import assert from "node:assert/strict";
import { test } from "node:test";

import { updateMaterial, updatePurchaseItem } from "../../src/data/store";
import { purchaseItemSchema, purchaseReceiptSchema } from "../../src/routes/routeSchemas";
import { createWorkflowAuthHeaders, withWorkflowAuthApp } from "../helpers/workflowAuth";

test("purchase approval and transitions are mentor/admin-only adjacent operations", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const leadHeaders = await createWorkflowAuthHeaders("lead");
    const mentorHeaders = await createWorkflowAuthHeaders("mentor");

    const pendingEdit = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { quantity: 2 } });
    assert.equal(pendingEdit.statusCode, 200);
    assert.equal(pendingEdit.json().item.quantity, 2);

    resetLimits();
    const forgedApproval = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { approvalStatus: "approved" } });
    assert.equal(forgedApproval.statusCode, 403);

    resetLimits();
    const leadApproval = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: leadHeaders, payload: { approvalStatus: "approved" } });
    assert.equal(leadApproval.statusCode, 403);

    resetLimits();
    const mentorApproval = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approvalStatus: "approved" } });
    assert.equal(mentorApproval.statusCode, 200);
    assert.equal(mentorApproval.json().item.approvalStatus, "approved");
    assert.equal(mentorApproval.json().item.approvedById, "jordan");
    assert.equal(Number.isNaN(Date.parse(mentorApproval.json().item.approvedAt)), false);

    resetLimits();
    const safeLegacyNoop = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { approvalStatus: "approved" } });
    assert.equal(safeLegacyNoop.statusCode, 200);

    resetLimits();
    const postApprovalEdit = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { quantity: 3 } });
    assert.equal(postApprovalEdit.statusCode, 409);

    resetLimits();
    const revoked = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approvalStatus: "rejected" } });
    assert.equal(revoked.statusCode, 409);

    resetLimits();
    const reapproved = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approvalStatus: "approved" } });
    assert.equal(reapproved.statusCode, 200);

    resetLimits();
    const skippedTransition = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: mentorHeaders, payload: { orderStatus: "delivered" } });
    assert.equal(skippedTransition.statusCode, 409);

    resetLimits();
    const studentTransition = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: studentHeaders, payload: { orderStatus: "ordered" } });
    assert.equal(studentTransition.statusCode, 403);

    resetLimits();
    const purchased = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: mentorHeaders, payload: { orderStatus: "ordered", finalCost: { amount: 37.5, currency: "USD" } } });
    assert.equal(purchased.statusCode, 200);
    assert.deepEqual(purchased.json().item.finalCost, { amount: 37.5, currency: "USD" });
    assert.ok(purchased.json().item.orderedAt);

    resetLimits();
    const revokeAfterPurchase = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approvalStatus: "rejected" } });
    assert.equal(revokeAfterPurchase.statusCode, 409);

    resetLimits();
    const deniedLeadDelete = await app.inject({ method: "DELETE", url: "/api/purchases/ferrule-kit", headers: leadHeaders });
    assert.equal(deniedLeadDelete.statusCode, 403);

    resetLimits();
    const allowedMentorDelete = await app.inject({ method: "DELETE", url: "/api/purchases/ferrule-kit", headers: mentorHeaders });
    assert.equal(allowedMentorDelete.statusCode, 200);
  });
});

test("purchase creation cannot self-approve and missing workflow records return 404", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const mentorHeaders = await createWorkflowAuthHeaders("mentor");
    const adminHeaders = await createWorkflowAuthHeaders("admin");
    const purchaseTemplate = {
      method: "POST",
      url: "/api/purchases",
      headers: studentHeaders,
      payload: {
        taskId: "procure-ferrule-kit",
        kind: "cots-goods",
        title: "Forged approval",
        partDefinitionId: null,
        materialId: null,
        quantity: 1,
        quotes: [],
        selectedQuoteId: null,
        approvalStatus: "approved",
        approvedById: "ava",
        approvedAt: new Date().toISOString(),
        purchaseOrderNumber: null,
        orderStatus: "not-ordered",
        finalCost: null,
        expectedDeliveryDate: null,
        trackingNumber: null,
        trackingUrl: null,
        orderedAt: null,
        deliveredAt: null,
      },
    } as const;
    const forgedCreate = await app.inject(purchaseTemplate);
    assert.equal(forgedCreate.statusCode, 403);

    resetLimits();
    const adminApproval = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: adminHeaders, payload: { approvalStatus: "approved" } });
    assert.equal(adminApproval.statusCode, 200);
    assert.equal(adminApproval.json().item.approvedById, "maya");

    resetLimits();
    const missing = await app.inject({ method: "PUT", url: "/api/purchases/missing/approval", headers: mentorHeaders, payload: { approvalStatus: "approved" } });
    assert.equal(missing.statusCode, 404);
  });
});

test("purchase quantities retain the original unbounded minimum while receipt quantities stay bounded integers", async () => {
  assert.equal(purchaseItemSchema.shape.quantity.parse("1001.5"), 1001.5);
  assert.equal(purchaseReceiptSchema.safeParse({ quantity: 1.5, location: "Shelf" }).success, false);
  assert.equal(purchaseReceiptSchema.safeParse({ quantity: 1001, location: "Shelf" }).success, false);

  await withWorkflowAuthApp(async ({ app }) => {
    const student = await createWorkflowAuthHeaders("student");
    const updated = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: student, payload: { quantity: 1001.5 } });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().item.quantity, 1001.5);
  });
});

test("purchase receipts accumulate stock instances without completing the linked task", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const student = await createWorkflowAuthHeaders("student");
    const mentor = await createWorkflowAuthHeaders("mentor");
    const denied = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: student, payload: { quantity: 1, location: "Receiving shelf A" } });
    assert.equal(denied.statusCode, 403);

    resetLimits();
    const invalid = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 0.5, location: "Receiving shelf A" } });
    assert.equal(invalid.statusCode, 400);

    resetLimits();
    const excessive = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1001, location: "Receiving shelf A" } });
    assert.equal(excessive.statusCode, 400);

    resetLimits();
    const first = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1, location: "Receiving shelf A" } });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().item.receipts.length, 1);

    resetLimits();
    const second = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1, location: "Bin 4" } });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().item.receipts.length, 2);
    assert.equal(second.json().item.orderStatus, "ordered");

    resetLimits();
    const beforeIdentityRejections = await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor });
    const beforeIdentityState = beforeIdentityRejections.json();
    const beforeIdentityPurchase = beforeIdentityState.purchaseItems.find((item: { id: string }) => item.id === "polycarb-sheet");
    const beforeIdentityPartInstances = beforeIdentityState.partInstances;

    resetLimits();
    const tooSmall = await app.inject({ method: "PATCH", url: "/api/purchases/polycarb-sheet", headers: mentor, payload: { quantity: 1 } });
    assert.equal(tooSmall.statusCode, 409);
    resetLimits();
    const changedPart = await app.inject({ method: "PATCH", url: "/api/purchases/polycarb-sheet", headers: mentor, payload: { partDefinitionId: null } });
    assert.equal(changedPart.statusCode, 409);

    resetLimits();
    const changedKind = await app.inject({ method: "PATCH", url: "/api/purchases/polycarb-sheet", headers: mentor, payload: { kind: "manufacturing-service" } });
    assert.equal(changedKind.statusCode, 409);
    resetLimits();
    const changedTask = await app.inject({ method: "PATCH", url: "/api/purchases/polycarb-sheet", headers: mentor, payload: { taskId: "different-task" } });
    assert.equal(changedTask.statusCode, 409);

    resetLimits();
    const afterIdentityRejections = await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor });
    const identityState = afterIdentityRejections.json();
    const unchangedPurchase = identityState.purchaseItems.find((item: { id: string }) => item.id === "polycarb-sheet");
    assert.equal(unchangedPurchase.kind, "cots-goods");
    assert.equal(unchangedPurchase.taskId, "intake-guard");
    assert.equal(unchangedPurchase.receipts.length, 2);
    assert.deepEqual(unchangedPurchase.receipts, beforeIdentityPurchase.receipts);
    assert.deepEqual(identityState.partInstances, beforeIdentityPartInstances);

    resetLimits();
    const excess = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1, location: "Bin 4" } });
    assert.equal(excess.statusCode, 409);

    resetLimits();
    const shipped = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/transition", headers: mentor, payload: { orderStatus: "shipped" } });
    assert.equal(shipped.statusCode, 200);

    resetLimits();
    const delivered = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/transition", headers: mentor, payload: { orderStatus: "delivered" } });
    assert.equal(delivered.statusCode, 200);

    resetLimits();
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor });
    const body = bootstrap.json();
    const purchase = body.purchaseItems.find((item: { id: string }) => item.id === "polycarb-sheet");
    const legacyPurchase = body.purchaseItems.find((item: { id: string }) => item.id === "ferrule-kit");
    const task = body.tasks.find((item: { id: string }) => item.id === "intake-guard");
    assert.equal(purchase.receipts.reduce((total: number, receipt: { quantity: number }) => total + receipt.quantity, 0), 2);
    assert.equal(task.status, "in-progress");
    assert.equal(purchase.orderStatus, "delivered");
    assert.deepEqual(legacyPurchase.receipts, []);
    assert.deepEqual(purchase.receipts.map((receipt: { location: string }) => receipt.location), ["Receiving shelf A", "Bin 4"]);
    const receivedIds = purchase.receipts.flatMap((receipt: { partInstanceIds: string[] }) => receipt.partInstanceIds);
    assert.equal(receivedIds.length, 2);
    assert.ok(receivedIds.every((id: string) => task.partInstanceIds.includes(id)));
    assert.ok(body.partInstances.filter((part: { id: string }) => receivedIds.includes(part.id)).every((part: { location: { kind: string } }) => part.location.kind === "stock"));
  });
});

test("material receipt conflicts are atomic; same-location and empty-stock receipts work, while part identity and outsourced semantics are preserved", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const inject = (options: any) => app.inject({ ...options, remoteAddress: "192.0.2.44" });
    const bootstrap = await inject({ method: "GET", url: "/api/bootstrap", headers: mentor });
    const before = bootstrap.json();
    const material = before.materials.find((entry: { id: string }) => entry.id === "mat-onyx-filament");
    updatePurchaseItem("polycarb-sheet", { materialId: material.id, quantity: 4 });
    const originalPurchase = before.purchaseItems.find((entry: { id: string }) => entry.id === "polycarb-sheet");
    resetLimits();
    const bothLinked = await inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1, location: "New material shelf" } });
    assert.equal(bothLinked.statusCode, 200, bothLinked.body);
    assert.deepEqual(bothLinked.json().item.receipts[0].partInstanceIds.length, 1);
    resetLimits();
    const afterBothLinked = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(afterBothLinked.materials.find((entry: { id: string }) => entry.id === material.id).onHandQuantity, material.onHandQuantity);
    assert.equal(afterBothLinked.partInstances.length, before.partInstances.length + 1);

    updatePurchaseItem("polycarb-sheet", { partDefinitionId: null });
    resetLimits();
    const conflicting = await inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1, location: "New material shelf" } });
    assert.equal(conflicting.statusCode, 409);
    assert.match(conflicting.json().message, /different location/i);
    resetLimits();
    const afterConflict = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(afterConflict.materials.find((entry: { id: string }) => entry.id === material.id).onHandQuantity, material.onHandQuantity);
    assert.equal(afterConflict.purchaseItems.find((entry: { id: string }) => entry.id === "polycarb-sheet").receipts.length, originalPurchase.receipts.length + 1);
    assert.equal(afterConflict.partInstances.length, before.partInstances.length + 1);

    resetLimits();
    const sameLocationMaterial = await inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1, location: material.location } });
    assert.equal(sameLocationMaterial.statusCode, 200, sameLocationMaterial.body);
    resetLimits();
    const afterMaterialOnly = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const stocked = afterMaterialOnly.materials.find((entry: { id: string }) => entry.id === material.id);
    assert.equal(stocked.onHandQuantity, material.onHandQuantity + 1);
    assert.equal(stocked.location, material.location);
    assert.equal(afterMaterialOnly.partInstances.length, before.partInstances.length + 1);

    updateMaterial(material.id, { onHandQuantity: 0 });
    resetLimits();
    const emptyStockReceipt = await inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { quantity: 1, location: "New material shelf" } });
    assert.equal(emptyStockReceipt.statusCode, 200, emptyStockReceipt.body);
    resetLimits();
    const afterEmptyStock = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const placedMaterial = afterEmptyStock.materials.find((entry: { id: string }) => entry.id === material.id);
    assert.equal(placedMaterial.onHandQuantity, 1);
    assert.equal(placedMaterial.location, "New material shelf");

    updatePurchaseItem("outsourced-swerve-bracket", { approvalStatus: "approved", orderStatus: "ordered" });
    resetLimits();
    const serviceReceipt = await inject({ method: "POST", url: "/api/purchases/outsourced-swerve-bracket/receipts", headers: mentor, payload: { quantity: 1, location: "Fabrication receiving" } });
    assert.equal(serviceReceipt.statusCode, 200);
    resetLimits();
    const afterService = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(afterService.materials.find((entry: { id: string }) => entry.id === material.id).onHandQuantity, placedMaterial.onHandQuantity);
    assert.equal(afterService.partInstances.length, afterEmptyStock.partInstances.length);
    assert.deepEqual(serviceReceipt.json().item.receipts[0].partInstanceIds, []);
  });
});

test("purchase workflow owns same-state cost and PO edits without rewriting transition dates", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const student = await createWorkflowAuthHeaders("student");
    const mentor = await createWorkflowAuthHeaders("mentor");
    const payload = { orderStatus: "not-ordered", finalCost: { amount: 41, currency: "USD" }, purchaseOrderNumber: "PO-41" };
    const denied = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: student, payload });
    assert.equal(denied.statusCode, 403);
    resetLimits();
    const changed = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: mentor, payload });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.deepEqual(changed.json().item.finalCost, payload.finalCost);
    assert.equal(changed.json().item.purchaseOrderNumber, "PO-41");
    assert.equal(changed.json().item.orderedAt, null);
    resetLimits();
    const approved = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentor, payload: { approvalStatus: "approved" } });
    assert.equal(approved.statusCode, 200, approved.body);
    resetLimits();
    const ordered = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: mentor, payload: { orderStatus: "ordered" } });
    assert.equal(ordered.statusCode, 200, ordered.body);
    resetLimits();
    const replay = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: mentor, payload: { orderStatus: "ordered", finalCost: null } });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().item.orderedAt, ordered.json().item.orderedAt);
    assert.equal(replay.json().item.purchaseOrderNumber, "PO-41");
  });
});
