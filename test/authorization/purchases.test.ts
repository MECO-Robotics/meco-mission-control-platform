import assert from "node:assert/strict";
import { test } from "node:test";

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
    const forgedCreate = await app.inject({
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
    });
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
