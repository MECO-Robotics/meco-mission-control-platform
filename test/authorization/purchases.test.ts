import assert from "node:assert/strict";
import { test } from "node:test";

import { snapshot } from "../../src/data/mockData";
import { createMaterial, createMaterialTransaction, createPartInstance, createPurchaseItem, createSubsystem, getSnapshot, getTasks, receivePurchaseItem, resetStore, updateMaterial, updatePartInstance, updatePurchaseItem, updateTask } from "../../src/data/store";
import { purchaseItemSchema, purchaseReceiptRecordSchema, purchaseReceiptSchema } from "../../src/routes/routeSchemas";
import { createWorkflowAuthHeaders, withWorkflowAuthApp as withBaseWorkflowAuthApp } from "../helpers/workflowAuth";

function withWorkflowAuthApp(
  run: Parameters<typeof withBaseWorkflowAuthApp>[0],
  options: Parameters<typeof withBaseWorkflowAuthApp>[1] = {},
) {
  const fixture = structuredClone(snapshot);
  const taskTemplate = fixture.tasks.find((task) => task.projectId === "project-robot-2026")!;
  const nextSerial = Math.max(0, ...fixture.tasks.map((task) => task.serialNumber ?? 0)) + 1;
  const taskAliases = ["intake-guard", "procure-ferrule-kit"];
  fixture.tasks.push(...taskAliases.map((id, index) => ({
    ...structuredClone(taskTemplate),
    id,
    serialNumber: nextSerial + index,
    title: id,
    summary: "Purchase workflow test task.",
    status: "in-progress" as const,
  })));

  const materialTemplate = fixture.materials[0]!;
  fixture.materials.push({
    ...structuredClone(materialTemplate), id: "mat-onyx-filament", name: "Onyx test filament",
    onHandQuantity: 1, reorderPoint: 0, location: "Onyx shelf",
  });
  fixture.materialTransactions.push({
    id: "transaction-test-onyx-opening", operationId: "test-onyx-opening", materialId: "mat-onyx-filament",
    movementType: "receipt", quantityDelta: 1, reason: "Purchase workflow test opening stock",
    recordedAt: "2026-01-01T00:00:00.000Z", actorMemberId: null,
  });
  const partTemplate = fixture.partDefinitions[0]!;
  fixture.partDefinitions.push({
    ...structuredClone(partTemplate), id: "pd-polycarbonate-sheet", name: "Polycarbonate test sheet",
    partNumber: "TEST-PC-SHEET", vendorPartNumbers: {}, materialId: null,
  });

  const outsourcedTask = {
    ...structuredClone(taskTemplate),
    id: "outsourced-manufacturing-test-task",
    serialNumber: nextSerial + taskAliases.length,
    title: "Outsourced manufacturing test task",
    workTypeId: "robot:manufacturing",
    manufacturingDetails: {
      part: { kind: "provisional" as const, partNumber: "OUTSOURCED-TEST", revision: "A" },
      quantity: 1,
      processId: "fabrication",
      fulfillmentSource: "outsourced" as const,
      material: { kind: "specified-material" as const, name: "test material" },
      fileArtifactIds: [],
      tolerances: [],
      qaRequirements: [],
    },
  };
  fixture.tasks.push(outsourcedTask);
  const purchaseTemplate = fixture.purchaseItems[0]!;
  const purchase = (id: string, taskId: string, fields: Partial<typeof purchaseTemplate> = {}) => ({
    ...structuredClone(purchaseTemplate),
    id, taskId, title: id, quantity: 1, kind: "cots-goods" as const,
    partDefinitionId: "pd-polycarbonate-sheet", materialId: null,
    approvalStatus: "pending" as const, orderStatus: "not-ordered" as const,
    approvedById: null, approvedAt: null, purchaseOrderNumber: null,
    finalCost: null, expectedDeliveryDate: null, trackingNumber: null,
    trackingUrl: null, orderedAt: null, deliveredAt: null, receipts: [],
    ...fields,
  });
  fixture.purchaseItems.push(
    purchase("ferrule-kit", "procure-ferrule-kit"),
    purchase("polycarb-sheet", "intake-guard", { quantity: 2, approvalStatus: "approved", orderStatus: "ordered" }),
    purchase("outsourced-swerve-bracket", outsourcedTask.id, {
      kind: "manufacturing-service", partDefinitionId: null, materialId: null,
    }),
    purchase("material-stock-test", "intake-guard", {
      title: "Material stock test purchase", partDefinitionId: null, materialId: "mat-onyx-filament",
    }),
  );
  return withBaseWorkflowAuthApp(run, { ...options, snapshot: fixture });
}

function reduceMaterialStockToZero(materialId: string) {
  const quantity = getSnapshot().materials.find((material) => material.id === materialId)?.onHandQuantity;
  if (quantity && quantity > 0) {
    const result = createMaterialTransaction(materialId, {
      operationId: `clear-stock-${materialId}`,
      movementType: "adjustment",
      adjustmentDirection: "decrease",
      quantity,
      reason: "Reset test stock through the inventory ledger",
    });
    assert.ok("transaction" in result);
  }
}

function robotSubsystemId() {
  return getSnapshot().subsystems.find((subsystem) => subsystem.projectId === "project-robot-2026")!.id;
}

function robotMechanismId() {
  const subsystemId = robotSubsystemId();
  return getSnapshot().mechanisms.find((mechanism) => mechanism.subsystemId === subsystemId)!.id;
}

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

test("purchase quantities retain the original fractional minimum while receipt quantities remain bounded", async () => {
  assert.equal(purchaseItemSchema.shape.quantity.parse("1001.5"), 1001.5);
  assert.equal(purchaseReceiptSchema.safeParse({ operationId: "fractional", quantity: 1.5, location: "Shelf" }).success, true);
  assert.equal(purchaseReceiptSchema.safeParse({ operationId: "too-large", quantity: 1001, location: "Shelf" }).success, false);

  await withWorkflowAuthApp(async ({ app }) => {
    const student = await createWorkflowAuthHeaders("student");
    updatePurchaseItem("ferrule-kit", { partDefinitionId: null, materialId: "mat-onyx-filament" });
    const updated = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: student, payload: { quantity: 1001.5 } });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().item.quantity, 1001.5);
  });
});

test("discrete part purchase orders require whole quantities while material and service orders stay fractional", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const student = await createWorkflowAuthHeaders("student");
    const taskId = getTasks().find((task) => task.manufacturingDetails === null)!.id;
    const serviceTemplate = getSnapshot().purchaseItems.find((item) => item.kind === "manufacturing-service")!;
    const makePayload = (overrides: Record<string, unknown> = {}) => ({
      taskId, kind: "cots-goods", title: "Quantity rule purchase", partDefinitionId: "pd-polycarbonate-sheet",
      materialId: "mat-onyx-filament", quantity: 1, quotes: [], selectedQuoteId: null,
      approvalStatus: "pending", approvedById: null, approvedAt: null, purchaseOrderNumber: null,
      orderStatus: "not-ordered", finalCost: null, expectedDeliveryDate: null, trackingNumber: null,
      trackingUrl: null, orderedAt: null, deliveredAt: null, ...overrides,
    });
    const before = getSnapshot();
    const fractionalPart = await app.inject({ method: "POST", url: "/api/purchases", headers: student, payload: makePayload({ quantity: 1.5 }) });
    assert.equal(fractionalPart.statusCode, 400, fractionalPart.body);
    assert.match(fractionalPart.json().message, /positive whole number/i);
    assert.equal(getSnapshot().purchaseItems.length, before.purchaseItems.length);

    resetLimits();
    const fractionalMaterial = await app.inject({ method: "POST", url: "/api/purchases", headers: student, payload: makePayload({ title: "Fractional material", partDefinitionId: null, quantity: 1.5 }) });
    assert.equal(fractionalMaterial.statusCode, 201, fractionalMaterial.body);
    resetLimits();
    const fractionalPartIdentity = await app.inject({ method: "PATCH", url: `/api/purchases/${fractionalMaterial.json().item.id}`, headers: student, payload: { partDefinitionId: "pd-polycarbonate-sheet" } });
    assert.equal(fractionalPartIdentity.statusCode, 400, fractionalPartIdentity.body);
    assert.equal(getSnapshot().purchaseItems.find((item) => item.id === fractionalMaterial.json().item.id)?.partDefinitionId, null);
    resetLimits();
    const fractionalService = await app.inject({ method: "POST", url: "/api/purchases", headers: student, payload: makePayload({ title: "Fractional service", taskId: serviceTemplate.taskId, kind: "manufacturing-service", partDefinitionId: serviceTemplate.partDefinitionId, materialId: null, quantity: 1.5 }) });
    assert.equal(fractionalService.statusCode, 201, fractionalService.body);
    resetLimits();
    const largeWhole = await app.inject({ method: "POST", url: "/api/purchases", headers: student, payload: makePayload({ title: "Large whole order", quantity: 10001 }) });
    assert.equal(largeWhole.statusCode, 201, largeWhole.body);

    const created = largeWhole.json().item;
    resetLimits();
    const fractionalPatch = await app.inject({ method: "PATCH", url: `/api/purchases/${created.id}`, headers: student, payload: { quantity: 2.5 } });
    assert.equal(fractionalPatch.statusCode, 400, fractionalPatch.body);
    assert.equal(getSnapshot().purchaseItems.find((item) => item.id === created.id)?.quantity, 10001);
  });
});

test("metadata edits preserve legacy fractional discrete purchase quantities but quantity changes are rejected", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const current = getSnapshot();
    const item = current.purchaseItems.find((purchase) => purchase.id === "ferrule-kit")!;
    resetStore({ ...current, purchaseItems: current.purchaseItems.map((purchase) => purchase.id === item.id ? { ...purchase, quantity: 1.5 } : purchase) });

    const metadata = await app.inject({ method: "PATCH", url: `/api/purchases/${item.id}`, headers: mentor, payload: { title: "Legacy fractional part order" } });
    assert.equal(metadata.statusCode, 200, metadata.body);
    assert.equal(metadata.json().item.quantity, 1.5);
    resetLimits();
    const explicitUnchangedQuantity = await app.inject({ method: "PATCH", url: `/api/purchases/${item.id}`, headers: mentor, payload: { quantity: 1.5 } });
    assert.equal(explicitUnchangedQuantity.statusCode, 200, explicitUnchangedQuantity.body);

    resetLimits();
    const changedQuantity = await app.inject({ method: "PATCH", url: `/api/purchases/${item.id}`, headers: mentor, payload: { quantity: 2.5 } });
    assert.equal(changedQuantity.statusCode, 400, changedQuantity.body);
    assert.equal(getSnapshot().purchaseItems.find((purchase) => purchase.id === item.id)?.quantity, 1.5);
  });
});

test("receipt operation IDs return one durable effect on retry and conflict on changed payload", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const baseline = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const baselinePartCount = baseline.partInstances.length;
    const request = { method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "ambiguous-receipt-1", quantity: 1, location: "Receiving shelf A" } } as const;
    const [first, concurrentRetry] = await Promise.all([
      app.inject({ ...request, remoteAddress: "192.0.2.101" }),
      app.inject({ ...request, remoteAddress: "192.0.2.102" }),
    ]);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(concurrentRetry.statusCode, 200, concurrentRetry.body);
    assert.equal(first.json().receipt.id, concurrentRetry.json().receipt.id);
    assert.deepEqual(first.json(), concurrentRetry.json());
    assert.equal(concurrentRetry.json().item.receipts.length, 1);
    assert.equal(concurrentRetry.json().receipt.partInstanceIds.length, 1);

    resetLimits();
    const changedPayload = await app.inject({ ...request, payload: { ...request.payload, quantity: 2 } });
    assert.equal(changedPayload.statusCode, 409);
    resetLimits();
    const changedLocation = await app.inject({ ...request, payload: { ...request.payload, location: "Other shelf" } });
    assert.equal(changedLocation.statusCode, 409);

    resetLimits();
    const after = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(after.purchaseItems.find((item: { id: string }) => item.id === "polycarb-sheet").receipts.length, 1);
    assert.equal(after.partInstances.length, baselinePartCount + 1);
    resetLimits();
    const shipped = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/transition", headers: mentor, payload: { orderStatus: "shipped" } });
    assert.equal(shipped.statusCode, 200);
    resetLimits();
    const retryAfterStateChange = await app.inject(request);
    assert.equal(retryAfterStateChange.statusCode, 200, retryAfterStateChange.body);
    assert.equal(retryAfterStateChange.json().receipt.id, first.json().receipt.id);
    resetLimits();
    const afterStateChange = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(afterStateChange.purchaseItems.find((item: { id: string }) => item.id === "polycarb-sheet").receipts.length, 1);
    assert.equal(afterStateChange.partInstances.length, baselinePartCount + 1);
  });
});

test("receiving a part purchase with a missing definition is atomic", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    updatePurchaseItem("polycarb-sheet", { partDefinitionId: "deleted-part-definition" });
    const before = getSnapshot();
    const response = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: {
      operationId: "missing-definition-receipt", quantity: 1, location: "Receiving shelf A",
    } });
    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.json().message, /part definition no longer exists/i);
    assert.deepEqual(getSnapshot(), before, "rejected receipt creates no receipt, part instance, stock change, task link, or audit action");
  });
});

test("unreceived COTS purchases retain part identity until their receipts create the correct stock", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const materialId = "mat-onyx-filament";
    reduceMaterialStockToZero(materialId);
    updatePurchaseItem("ferrule-kit", {
      kind: "cots-goods", partDefinitionId: "pd-polycarbonate-sheet", materialId,
      quantity: 1, orderStatus: "ordered",
    });
    updatePurchaseItem("polycarb-sheet", {
      kind: "cots-goods", partDefinitionId: "pd-polycarbonate-sheet", materialId: null,
      quantity: 1, orderStatus: "ordered",
    });
    const beforeDelete = getSnapshot();

    const rejected = await app.inject({ method: "DELETE", url: "/api/part-definitions/pd-polycarbonate-sheet", headers: mentor });
    assert.equal(rejected.statusCode, 409, rejected.body);
    assert.match(rejected.json().message, /retarget or remove linked purchases/i);
    assert.deepEqual(getSnapshot(), beforeDelete, "rejected deletion preserves both orders, part identity, and audit history");

    resetLimits();
    const withMaterial = await app.inject({
      method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor,
      payload: { operationId: "part-identity-with-material", quantity: 1, location: "Receiving shelf A" },
    });
    assert.equal(withMaterial.statusCode, 200, withMaterial.body);
    assert.equal(withMaterial.json().receipt.partInstanceIds.length, 1);
    resetLimits();
    const withoutMaterial = await app.inject({
      method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor,
      payload: { operationId: "part-identity-no-material", quantity: 1, location: "Receiving shelf B" },
    });
    assert.equal(withoutMaterial.statusCode, 200, withoutMaterial.body);
    assert.equal(withoutMaterial.json().receipt.partInstanceIds.length, 1);

    const afterReceipts = getSnapshot();
    const receivedPartIds = [
      ...withMaterial.json().receipt.partInstanceIds,
      ...withoutMaterial.json().receipt.partInstanceIds,
    ];
    assert.ok(afterReceipts.partDefinitions.some((definition) => definition.id === "pd-polycarbonate-sheet"));
    assert.ok(receivedPartIds.every((id) => afterReceipts.partInstances.find((part) => part.id === id)?.partDefinitionId === "pd-polycarbonate-sheet"));
    assert.equal(afterReceipts.materials.find((material) => material.id === materialId)?.onHandQuantity, 0);
  });
});

test("material purchases block material deletion and still receive stock", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const materialId = "mat-onyx-filament";
    reduceMaterialStockToZero(materialId);
    updatePurchaseItem("ferrule-kit", {
      kind: "cots-goods", partDefinitionId: null, materialId,
      quantity: 1, orderStatus: "ordered",
    });
    const beforeDelete = getSnapshot();

    const rejected = await app.inject({ method: "DELETE", url: `/api/materials/${materialId}`, headers: mentor });
    assert.equal(rejected.statusCode, 409, rejected.body);
    assert.deepEqual(getSnapshot(), beforeDelete, "rejected deletion leaves the material purchase and audit history untouched");

    resetLimits();
    const received = await app.inject({
      method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor,
      payload: { operationId: "material-identity-receipt", quantity: 1, location: "Onyx shelf" },
    });
    assert.equal(received.statusCode, 200, received.body);
    assert.equal(getSnapshot().materials.find((material) => material.id === materialId)?.onHandQuantity, 1);
    assert.equal(received.json().receipt.partInstanceIds.length, 0);
  });
});

test("receipt part instances cannot be deleted but can change location", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    updatePurchaseItem("polycarb-sheet", { quantity: 1, orderStatus: "ordered" });
    const received = await app.inject({
      method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor,
      payload: { operationId: "instance-history-guard", quantity: 1, location: "Receiving shelf A" },
    });
    assert.equal(received.statusCode, 200, received.body);
    const partInstanceId = received.json().receipt.partInstanceIds[0];
    assert.ok(partInstanceId);

    for (const location of [
      { kind: "repair", location: "Repair cart" },
      { kind: "retired", location: "Retired bin" },
      { kind: "lost" },
    ]) {
      resetLimits();
      const updated = await app.inject({
        method: "PATCH", url: `/api/part-instances/${partInstanceId}`, headers: mentor,
        payload: { location },
      });
      assert.equal(updated.statusCode, 200, updated.body);
      assert.deepEqual(updated.json().item.location, location);
    }

    const beforeDelete = getSnapshot();
    resetLimits();
    const rejected = await app.inject({ method: "DELETE", url: `/api/part-instances/${partInstanceId}`, headers: mentor });
    assert.equal(rejected.statusCode, 409, rejected.body);
    assert.match(rejected.json().message, /recorded in purchase receipt history/i);
    assert.deepEqual(getSnapshot(), beforeDelete, "rejected deletion leaves part, receipt provenance, and audit history unchanged");

    const unreferencedPart = createPartInstance({
      partDefinitionId: "pd-polycarbonate-sheet", intendedSubsystemId: null,
      intendedMechanismId: null, location: { kind: "stock", location: "Unreferenced bin" },
    });
    resetLimits();
    const deleted = await app.inject({ method: "DELETE", url: `/api/part-instances/${unreferencedPart.id}`, headers: mentor });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(getSnapshot().partInstances.some((part) => part.id === unreferencedPart.id), false);
  });
});

test("subsystem deletion preserves receipt instances assigned outside its task scope", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const task = getTasks().find((candidate) => candidate.status === "complete" && candidate.projectId === "project-robot-2026");
    assert.ok(task, "fixture needs a completed purchase task outside the new subsystem");
    const subsystem = createSubsystem({
      projectId: task.projectId, name: "Receipt history cleanup fixture",
      description: "Subsystem deletion must retain receipt instance identifiers.",
      parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [],
    });
    updatePurchaseItem("polycarb-sheet", { taskId: task.id, quantity: 1, orderStatus: "ordered" });
    const received = await app.inject({
      method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor,
      payload: { operationId: "hierarchy-instance-history-guard", quantity: 1, location: "Receiving shelf A" },
    });
    assert.equal(received.statusCode, 200, received.body);
    const partInstanceId = received.json().receipt.partInstanceIds[0];
    assert.ok(partInstanceId);
    assert.deepEqual(getSnapshot().tasks.find((candidate) => candidate.id === task.id)?.partInstanceIds.includes(partInstanceId), false);
    updatePartInstance(partInstanceId, { intendedSubsystemId: subsystem.id });
    const beforeDelete = getSnapshot();

    resetLimits();
    const rejected = await app.inject({ method: "DELETE", url: `/api/subsystems/${subsystem.id}`, headers: mentor });
    assert.equal(rejected.statusCode, 409, rejected.body);
    assert.match(rejected.json().message, /recorded in purchase receipt history/i);
    assert.deepEqual(getSnapshot(), beforeDelete, "rejected hierarchy deletion preserves receipt instance and audit history");
  });
});

test("task deletion preserves linked orders and receipt history until the purchase is resolved", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const task = getTasks().find((candidate) => !getSnapshot().purchaseItems.some((item) => item.taskId === candidate.id))!;
    assert.ok(task);
    updatePurchaseItem("ferrule-kit", { taskId: task.id, orderStatus: "ordered" });
    const beforeDelete = getSnapshot();

    const rejected = await app.inject({ method: "DELETE", url: `/api/tasks/${task.id}`, headers: mentor });
    assert.equal(rejected.statusCode, 409, rejected.body);
    assert.match(rejected.json().message, /retarget or remove linked purchase items/i);
    assert.deepEqual(getSnapshot(), beforeDelete, "rejected deletion leaves tasks, orders, and audit history untouched");

    resetLimits();
    const receipt = await app.inject({
      method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor,
      payload: { operationId: "task-delete-order-receipt", quantity: 1, location: "Receiving shelf A" },
    });
    assert.equal(receipt.statusCode, 200, receipt.body);
    assert.equal(receipt.json().item.taskId, task.id);
    assert.equal(receipt.json().item.receipts.length, 1);

    const unreferencedTask = getTasks().find((candidate) => !getSnapshot().purchaseItems.some((item) => item.taskId === candidate.id))!;
    assert.ok(unreferencedTask);
    resetLimits();
    const deleted = await app.inject({ method: "DELETE", url: `/api/tasks/${unreferencedTask.id}`, headers: mentor });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(getTasks().some((candidate) => candidate.id === unreferencedTask.id), false);
  });
});

test("subsystem deletion cannot cascade away a linked purchase item", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const snapshot = getSnapshot();
    const subsystem = snapshot.subsystems.find((candidate) => !candidate.isCore && snapshot.tasks.some((task) =>
      task.subsystemIds.includes(candidate.id) && !snapshot.purchaseItems.some((item) => item.taskId === task.id),
    ));
    assert.ok(subsystem);
    const task = snapshot.tasks.find((candidate) => candidate.subsystemIds.includes(subsystem.id) && !snapshot.purchaseItems.some((item) => item.taskId === candidate.id))!;
    assert.ok(task);
    updatePurchaseItem("ferrule-kit", { taskId: task.id });
    const before = getSnapshot();

    const response = await app.inject({ method: "DELETE", url: `/api/subsystems/${subsystem.id}`, headers: mentor });
    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.json().message, /retarget or remove linked purchase items/i);
    assert.deepEqual(getSnapshot(), before, "rejected hierarchy deletion preserves task, purchase, and audit records");
  });
});

test("fractional material receipts use decimal-safe cumulative bounds and old receipt records remain valid", async () => {
  assert.equal(purchaseReceiptRecordSchema.safeParse({ id: "old", quantity: 1, location: "Shelf", receivedAt: "2026-01-01T00:00:00.000Z", partInstanceIds: [] }).success, true);
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const materialId = "mat-onyx-filament";
    reduceMaterialStockToZero(materialId);
    updatePurchaseItem("ferrule-kit", { kind: "cots-goods", partDefinitionId: null, materialId, quantity: 1.3, approvalStatus: "approved", orderStatus: "ordered" });
    const beforeSubPrecision = getSnapshot();
    assert.deepEqual(receivePurchaseItem("ferrule-kit", { operationId: "decimal-below-precision", quantity: 4e-13, location: "Onyx shelf" }), { error: "invalid-quantity" });
    assert.deepEqual(getSnapshot(), beforeSubPrecision, "direct subprecision receipt rejection leaves stock, ledger, and audit unchanged");
    const belowPrecision = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor, payload: { operationId: "decimal-below-precision", quantity: 4e-13, location: "Onyx shelf" } });
    assert.equal(belowPrecision.statusCode, 400, belowPrecision.body);
    assert.deepEqual(getSnapshot(), beforeSubPrecision, "authenticated subprecision receipt rejection is atomic");
    resetLimits();
    const first = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor, payload: { operationId: "decimal-0.1", quantity: 0.1, location: "Onyx shelf" } });
    assert.equal(first.statusCode, 200, first.body);
    const afterFirst = getSnapshot();
    resetLimits();
    const normalizedRetry = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor, payload: { operationId: "decimal-0.1", quantity: 0.1000000000004, location: "Onyx shelf" } });
    assert.equal(normalizedRetry.statusCode, 200, normalizedRetry.body);
    assert.deepEqual(getSnapshot(), afterFirst, "receipt replay matches the normalized quantity and has no second effect");
    resetLimits();
    const second = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor, payload: { operationId: "decimal-0.2", quantity: 0.2, location: "Onyx shelf" } });
    assert.equal(second.statusCode, 200, second.body);
    assert.ok(Math.abs(second.json().item.receipts.reduce((sum: number, receipt: { quantity: number }) => sum + receipt.quantity, 0) - 0.3) < Number.EPSILON);
    assert.equal(second.json().item.receipts.length, 2);
    resetLimits();
    const over = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor, payload: { operationId: "decimal-over", quantity: 1.0001, location: "Onyx shelf" } });
    assert.equal(over.statusCode, 409);
    resetLimits();
    const state = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(state.materials.find((material: { id: string }) => material.id === materialId).onHandQuantity, 0.3);
  });
});

test("postreceipt quantity floor is decimal-safe and allows unchanged quantity metadata edits atomically", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    updatePurchaseItem("ferrule-kit", { partDefinitionId: null, materialId: "mat-onyx-filament", quantity: 1.2 });
    const metadataEdit = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: mentor, payload: { title: "Ferrule kit received", quantity: 1.2 } });
    assert.equal(metadataEdit.statusCode, 200, metadataEdit.body);
    assert.equal(metadataEdit.json().item.title, "Ferrule kit received");
    assert.equal(metadataEdit.json().item.quantity, 1.2);
    resetLimits();
    reduceMaterialStockToZero("mat-onyx-filament");
    updatePurchaseItem("ferrule-kit", { kind: "cots-goods", partDefinitionId: null, materialId: "mat-onyx-filament", approvalStatus: "approved", orderStatus: "ordered" });
    const first = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor, payload: { operationId: "floor-1.1", quantity: 1.1, location: "Onyx shelf" } });
    assert.equal(first.statusCode, 200, first.body);
    resetLimits();
    const second = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/receipts", headers: mentor, payload: { operationId: "floor-0.1", quantity: 0.1, location: "Onyx shelf" } });
    assert.equal(second.statusCode, 200, second.body);
    resetLimits();
    const beforeUnderfloor = getSnapshot();
    const underfloor = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: mentor, payload: { title: "Must not apply", quantity: 1.19 } });
    assert.equal(underfloor.statusCode, 409);
    assert.deepEqual(getSnapshot(), beforeUnderfloor, "HTTP rejection leaves receipt, inventory, and audit snapshot unchanged");
    resetLimits();
    const after = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const saved = after.purchaseItems.find((item: { id: string }) => item.id === "ferrule-kit");
    assert.equal(saved.title, "Ferrule kit received");
    assert.equal(saved.quantity, 1.2);
    assert.equal(saved.receipts.length, 2);
  });
});

test("direct purchase edits cannot rewrite received identity or lower received quantity", async () => {
  await withWorkflowAuthApp(async () => {
    reduceMaterialStockToZero("mat-onyx-filament");
    updatePurchaseItem("ferrule-kit", { kind: "cots-goods", partDefinitionId: null, materialId: "mat-onyx-filament", quantity: 1.2, orderStatus: "ordered" });
    const received = receivePurchaseItem("ferrule-kit", { operationId: "domain-decimal-receipt", quantity: 0.1, location: "Onyx shelf" });
    assert.ok("receipt" in received);
    const fractionalReceipt = receivePurchaseItem("ferrule-kit", { operationId: "domain-decimal-receipt-2", quantity: 0.2, location: "Onyx shelf" });
    assert.ok("receipt" in fractionalReceipt);
    const beforeRejectedEdits = getSnapshot();
    const forgedEdits = [
      { taskId: "another-task" }, { taskId: undefined }, { kind: "manufacturing-service" },
      { partDefinitionId: "pd-polycarbonate-sheet" },
      { materialId: null }, { materialId: undefined }, { quantity: 0.2 }, { quantity: Number.NaN }, { quantity: undefined },
    ];
    for (const patch of forgedEdits) {
      assert.throws(
        () => updatePurchaseItem("ferrule-kit", patch as unknown as Parameters<typeof updatePurchaseItem>[1]),
        (error: unknown) => error instanceof Error && "statusCode" in error && error.statusCode === 409,
        `domain rejects received purchase edit ${JSON.stringify(patch)}`,
      );
      assert.deepEqual(getSnapshot(), beforeRejectedEdits, "rejected direct edit leaves inventory, receipts, and audit unchanged");
    }

    updatePurchaseItem("ferrule-kit", { partDefinitionId: null, materialId: "mat-onyx-filament" });
    updatePurchaseItem("ferrule-kit", { title: "Valid commercial edit", quantity: 0.3 });
    assert.equal(getSnapshot().purchaseItems.find((item) => item.id === "ferrule-kit")!.title, "Valid commercial edit");
    assert.equal(getSnapshot().purchaseItems.find((item) => item.id === "ferrule-kit")!.quantity, 0.3);
    assert.ok(Math.abs(getSnapshot().purchaseItems.find((item) => item.id === "ferrule-kit")!.receipts!.reduce((total, receipt) => total + receipt.quantity, 0) - 0.3) < Number.EPSILON);

    updatePurchaseItem("polycarb-sheet", { kind: "cots-goods", partDefinitionId: "pd-polycarbonate-sheet", materialId: null, quantity: 1, orderStatus: "ordered" });
    const partReceipt = receivePurchaseItem("polycarb-sheet", { operationId: "domain-part-receipt", quantity: 1, location: "Part shelf" });
    assert.ok("receipt" in partReceipt);
    const beforePartIdentityEdits = getSnapshot();
    for (const patch of [{ partDefinitionId: null }, { taskId: null }]) {
      assert.throws(() => updatePurchaseItem("polycarb-sheet", patch as unknown as Parameters<typeof updatePurchaseItem>[1]));
      assert.deepEqual(getSnapshot(), beforePartIdentityEdits, "part identity rewrite cannot orphan receipt provenance");
    }
  });
});

test("received purchase edits honor receiver floating-point tolerance without allowing a real shortfall", async () => {
  await withWorkflowAuthApp(async () => {
    const requestedQuantity = 1.4 - 0.1;
    assert.equal(requestedQuantity, 1.2999999999999998);
    updatePurchaseItem("outsourced-swerve-bracket", { quantity: requestedQuantity, orderStatus: "ordered" });
    const received = receivePurchaseItem("outsourced-swerve-bracket", {
      operationId: "domain-float-boundary-receipt",
      quantity: 1.3,
      location: "Fabrication receiving",
    });
    assert.ok("receipt" in received);

    updatePurchaseItem("outsourced-swerve-bracket", { title: "Boundary receipt title edit" });
    const edited = getSnapshot().purchaseItems.find((item) => item.id === "outsourced-swerve-bracket")!;
    assert.equal(edited.title, "Boundary receipt title edit");
    assert.equal(edited.quantity, requestedQuantity);

    const beforeShortfall = getSnapshot();
    assert.throws(
      () => updatePurchaseItem("outsourced-swerve-bracket", { quantity: 1.29 }),
      (error: unknown) => error instanceof Error && "statusCode" in error && error.statusCode === 409,
    );
    assert.deepEqual(getSnapshot(), beforeShortfall, "a meaningful below-received quantity leaves purchase and audit unchanged");
  });
});

test("receipt-bearing purchases and referenced materials resist deletion while stock edits use the ledger", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const student = await createWorkflowAuthHeaders("student");
    const mentor = await createWorkflowAuthHeaders("mentor");
    const beforeStockEdit = getSnapshot();
    const stockEdit = await app.inject({ method: "PATCH", url: "/api/materials/mat-onyx-filament", headers: student, payload: { onHandQuantity: 77 } });
    assert.equal(stockEdit.statusCode, 400);
    assert.deepEqual(getSnapshot(), beforeStockEdit);
    resetLimits();
    const materialDelete = await app.inject({ method: "DELETE", url: "/api/materials/mat-onyx-filament", headers: student });
    assert.equal(materialDelete.statusCode, 409);

    const referencedMaterial = createMaterial({ name: "Referenced manufacturing stock", category: "other", unit: "kg", reorderPoint: 0, location: "Shelf", preferredVendorId: null, notes: "" });
    const manufacturingTask = getTasks().find((task) => task.manufacturingDetails !== null);
    assert.ok(manufacturingTask?.manufacturingDetails);
    updateTask(manufacturingTask.id, {
      manufacturingDetails: {
        ...manufacturingTask.manufacturingDetails,
        fileArtifactIds: [...manufacturingTask.manufacturingDetails.fileArtifactIds],
        tolerances: [...manufacturingTask.manufacturingDetails.tolerances],
        qaRequirements: [...manufacturingTask.manufacturingDetails.qaRequirements],
        material: { kind: "inventory-material", materialId: referencedMaterial.id },
      },
    });
    resetLimits();
    const manufacturingMaterialDelete = await app.inject({ method: "DELETE", url: `/api/materials/${referencedMaterial.id}`, headers: student });
    assert.equal(manufacturingMaterialDelete.statusCode, 409);
    const unusedMaterial = createMaterial({ name: "Unused removable stock", category: "other", unit: "kg", reorderPoint: 0, location: "Shelf", preferredVendorId: null, notes: "" });
    resetLimits();
    const unusedDelete = await app.inject({ method: "DELETE", url: `/api/materials/${unusedMaterial.id}`, headers: student });
    assert.equal(unusedDelete.statusCode, 200);

    resetLimits();
    const receipt = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "ledger-delete-guard", quantity: 1, location: "Receiving shelf A" } });
    assert.equal(receipt.statusCode, 200, receipt.body);
    resetLimits();
    const deleted = await app.inject({ method: "DELETE", url: "/api/purchases/polycarb-sheet", headers: mentor });
    assert.equal(deleted.statusCode, 409);
    resetLimits();
    const partDefinitionDelete = await app.inject({ method: "DELETE", url: "/api/part-definitions/pd-polycarbonate-sheet", headers: mentor });
    assert.equal(partDefinitionDelete.statusCode, 409);
    assert.match(partDefinitionDelete.json().message, /referenced by receipt history/i);
    resetLimits();
    const after = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(after.purchaseItems.some((item: { id: string }) => item.id === "polycarb-sheet"), true);
    assert.equal(after.partInstances.some((part: { id: string }) => receipt.json().receipt.partInstanceIds.includes(part.id)), true);
  });
});

test("purchase receipts accumulate stock instances without completing the linked task", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const student = await createWorkflowAuthHeaders("student");
    const mentor = await createWorkflowAuthHeaders("mentor");
    const denied = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: student, payload: { operationId: "role-denied", quantity: 1, location: "Receiving shelf A" } });
    assert.equal(denied.statusCode, 403);

    resetLimits();
    const invalid = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "fractional-part", quantity: 0.5, location: "Receiving shelf A" } });
    assert.equal(invalid.statusCode, 400);

    resetLimits();
    const excessive = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "excessive", quantity: 1001, location: "Receiving shelf A" } });
    assert.equal(excessive.statusCode, 400);

    resetLimits();
    const beforeReceipt = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const linkedTaskBefore = beforeReceipt.tasks.find((item: { id: string }) => item.id === "intake-guard");
    const linkedTaskTargetsBefore = {
      workstreamIds: linkedTaskBefore.workstreamIds,
      subsystemIds: linkedTaskBefore.subsystemIds,
      mechanismIds: linkedTaskBefore.mechanismIds,
      partInstanceIds: linkedTaskBefore.partInstanceIds,
    };
    resetLimits();
    const first = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "first-partial", quantity: 1, location: "Receiving shelf A" } });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().item.receipts.length, 1);

    const unrelatedTaskBefore = beforeReceipt.tasks.find((item: { id: string; projectId: string; status: string }) => item.id !== "intake-guard" && item.projectId === linkedTaskBefore.projectId && item.status !== "complete");
    assert.ok(unrelatedTaskBefore);
    resetLimits();
    const unrelatedPatch = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${unrelatedTaskBefore.id}`,
      headers: mentor,
      payload: { title: `${unrelatedTaskBefore.title} after receiving stock` },
    });
    assert.equal(unrelatedPatch.statusCode, 200, unrelatedPatch.body);
    assert.deepEqual({
      workstreamIds: unrelatedPatch.json().item.workstreamIds,
      subsystemIds: unrelatedPatch.json().item.subsystemIds,
      mechanismIds: unrelatedPatch.json().item.mechanismIds,
      partInstanceIds: unrelatedPatch.json().item.partInstanceIds,
    }, {
      workstreamIds: unrelatedTaskBefore.workstreamIds,
      subsystemIds: unrelatedTaskBefore.subsystemIds,
      mechanismIds: unrelatedTaskBefore.mechanismIds,
      partInstanceIds: unrelatedTaskBefore.partInstanceIds,
    });

    const receivedInstanceId = first.json().receipt.partInstanceIds[0];
    resetLimits();
    const placed = await app.inject({
      method: "PATCH",
      url: `/api/part-instances/${receivedInstanceId}`,
      headers: mentor,
      payload: {
        intendedSubsystemId: robotSubsystemId(),
        intendedMechanismId: robotMechanismId(),
        location: { kind: "installed", subsystemId: robotSubsystemId(), mechanismId: robotMechanismId() },
      },
    });
    assert.equal(placed.statusCode, 200, placed.body);
    resetLimits();
    const explicitlyTargeted = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${unrelatedTaskBefore.id}`,
      headers: mentor,
      payload: { partInstanceIds: [...unrelatedTaskBefore.partInstanceIds, receivedInstanceId] },
    });
    assert.equal(explicitlyTargeted.statusCode, 200, explicitlyTargeted.body);
    assert.ok(explicitlyTargeted.json().item.partInstanceIds.includes(receivedInstanceId));

    resetLimits();
    const second = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "second-partial", quantity: 1, location: "Bin 4" } });
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
    const changedMaterial = await app.inject({ method: "PATCH", url: "/api/purchases/polycarb-sheet", headers: mentor, payload: { materialId: "mat-onyx-filament" } });
    assert.equal(changedMaterial.statusCode, 409);

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
    const excess = await app.inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "over-receipt", quantity: 1, location: "Bin 4" } });
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
    assert.deepEqual({
      workstreamIds: task.workstreamIds,
      subsystemIds: task.subsystemIds,
      mechanismIds: task.mechanismIds,
      partInstanceIds: task.partInstanceIds,
    }, linkedTaskTargetsBefore, "partial stock receipts do not change linked task scope");
    assert.equal(purchase.orderStatus, "delivered");
    assert.deepEqual(legacyPurchase.receipts, []);
    assert.deepEqual(purchase.receipts.map((receipt: { location: string }) => receipt.location), ["Receiving shelf A", "Bin 4"]);
    const receivedIds = purchase.receipts.flatMap((receipt: { partInstanceIds: string[] }) => receipt.partInstanceIds);
    assert.equal(receivedIds.length, 2);
    assert.deepEqual(purchase.receipts.map((receipt: { partInstanceIds: string[] }) => receipt.partInstanceIds).flat(), receivedIds);
    const receivedParts = body.partInstances.filter((part: { id: string }) => receivedIds.includes(part.id));
    assert.equal(receivedParts.find((part: { id: string }) => part.id === receivedIds[0]).location.kind, "installed");
    assert.equal(receivedParts.find((part: { id: string }) => part.id === receivedIds[1]).location.kind, "stock");
  });
});

test("receipt history prevents part identity reassignment but allows no-op identity and location updates", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const bootstrap = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const originalDefinitionId = bootstrap.purchaseItems.find((item: { id: string }) => item.id === "polycarb-sheet").partDefinitionId;
    const otherDefinitionId = bootstrap.partDefinitions.find((item: { id: string }) => item.id !== originalDefinitionId)?.id;
    assert.ok(otherDefinitionId);

    resetLimits();
    const received = await app.inject({
      method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor,
      payload: { operationId: "identity-reassignment-guard", quantity: 1, location: "Receiving shelf C" },
    });
    assert.equal(received.statusCode, 200, received.body);
    const instanceId = received.json().receipt.partInstanceIds[0];
    const beforeReassignment = getSnapshot();

    resetLimits();
    const reassignment = await app.inject({
      method: "PATCH", url: `/api/part-instances/${instanceId}`, headers: mentor,
      payload: { partDefinitionId: otherDefinitionId },
    });
    assert.equal(reassignment.statusCode, 409, reassignment.body);
    assert.match(reassignment.json().message, /receipt history.*reassigned/i);
    assert.deepEqual(getSnapshot(), beforeReassignment, "rejected reassignment publishes no instance or audit mutation");

    resetLimits();
    const locationChange = await app.inject({
      method: "PATCH", url: `/api/part-instances/${instanceId}`, headers: mentor,
      payload: { partDefinitionId: originalDefinitionId, location: { kind: "repair", location: "Inspection bench" } },
    });
    assert.equal(locationChange.statusCode, 200, locationChange.body);
    assert.equal(locationChange.json().item.partDefinitionId, originalDefinitionId);
    assert.deepEqual(locationChange.json().item.location, { kind: "repair", location: "Inspection bench" });
  });
});

test("partial receipt leaves completed task targets unchanged", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const bootstrap = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const completedTask = bootstrap.tasks.find((item: { projectId: string; status: string }) => item.projectId === "project-robot-2026" && item.status === "complete");
    assert.ok(completedTask, "fixture includes a completed robot task");
    updatePurchaseItem("ferrule-kit", {
      taskId: completedTask.id,
      kind: "cots-goods",
      partDefinitionId: "pd-polycarbonate-sheet",
      materialId: null,
      quantity: 1,
      orderStatus: "ordered",
    });

    resetLimits();
    const received = await app.inject({
      method: "POST",
      url: "/api/purchases/ferrule-kit/receipts",
      headers: mentor,
      payload: { operationId: "completed-task-stock", quantity: 1, location: "Receiving shelf B" },
    });
    assert.equal(received.statusCode, 200, received.body);
    assert.equal(received.json().receipt.partInstanceIds.length, 1);
    resetLimits();
    const after = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const completedTaskAfter = after.tasks.find((item: { id: string }) => item.id === completedTask.id);
    for (const field of ["workstreamIds", "subsystemIds", "mechanismIds", "partInstanceIds"] as const) {
      assert.deepEqual(completedTaskAfter[field], completedTask[field], `receipt leaves completed task ${field} unchanged`);
    }
    assert.ok(after.partInstances.some((part: { id: string }) => part.id === received.json().receipt.partInstanceIds[0]));
    assert.deepEqual(after.purchaseItems.find((item: { id: string }) => item.id === "ferrule-kit").receipts[0].partInstanceIds, received.json().receipt.partInstanceIds);
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
    const bothLinked = await inject({ method: "POST", url: "/api/purchases/polycarb-sheet/receipts", headers: mentor, payload: { operationId: "part-takes-precedence", quantity: 1, location: "New material shelf" } });
    assert.equal(bothLinked.statusCode, 200, bothLinked.body);
    assert.deepEqual(bothLinked.json().item.receipts[0].partInstanceIds.length, 1);
    resetLimits();
    const afterBothLinked = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(afterBothLinked.materials.find((entry: { id: string }) => entry.id === material.id).onHandQuantity, material.onHandQuantity);
    assert.equal(afterBothLinked.partInstances.length, before.partInstances.length + 1);

    const { id: _id, receipts: _receipts, ...materialPurchaseFields } = originalPurchase;
    const materialPurchase = createPurchaseItem({ ...materialPurchaseFields, title: "Independent material receipt test", partDefinitionId: null, materialId: material.id, quantity: 4 });
    const materialPurchaseId = materialPurchase.id;
    resetLimits();
    const conflicting = await inject({ method: "POST", url: `/api/purchases/${materialPurchaseId}/receipts`, headers: mentor, payload: { operationId: "conflicting-location", quantity: 1, location: "New material shelf" } });
    assert.equal(conflicting.statusCode, 409);
    assert.match(conflicting.json().message, /different location/i);
    resetLimits();
    const afterConflict = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    assert.equal(afterConflict.materials.find((entry: { id: string }) => entry.id === material.id).onHandQuantity, material.onHandQuantity);
    assert.equal(afterConflict.purchaseItems.find((entry: { id: string }) => entry.id === materialPurchaseId).receipts.length, 0);
    assert.equal(afterConflict.partInstances.length, before.partInstances.length + 1);

    resetLimits();
    const sameLocationMaterial = await inject({ method: "POST", url: `/api/purchases/${materialPurchaseId}/receipts`, headers: mentor, payload: { operationId: "same-location-material", quantity: 1, location: material.location } });
    assert.equal(sameLocationMaterial.statusCode, 200, sameLocationMaterial.body);
    resetLimits();
    const afterMaterialOnly = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const stocked = afterMaterialOnly.materials.find((entry: { id: string }) => entry.id === material.id);
    assert.equal(stocked.onHandQuantity, material.onHandQuantity + 1);
    assert.equal(stocked.location, material.location);
    assert.equal(afterMaterialOnly.partInstances.length, before.partInstances.length + 1);

    reduceMaterialStockToZero(material.id);
    resetLimits();
    const emptyStockReceipt = await inject({ method: "POST", url: `/api/purchases/${materialPurchaseId}/receipts`, headers: mentor, payload: { operationId: "empty-stock-material", quantity: 1, location: "New material shelf" } });
    assert.equal(emptyStockReceipt.statusCode, 200, emptyStockReceipt.body);
    resetLimits();
    const afterEmptyStock = (await inject({ method: "GET", url: "/api/bootstrap", headers: mentor })).json();
    const placedMaterial = afterEmptyStock.materials.find((entry: { id: string }) => entry.id === material.id);
    assert.equal(placedMaterial.onHandQuantity, 1);
    assert.equal(placedMaterial.location, "New material shelf");

    updatePurchaseItem("outsourced-swerve-bracket", { approvalStatus: "approved", orderStatus: "ordered" });
    resetLimits();
    const serviceReceipt = await inject({ method: "POST", url: "/api/purchases/outsourced-swerve-bracket/receipts", headers: mentor, payload: { operationId: "service-receipt", quantity: 1, location: "Fabrication receiving" } });
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
