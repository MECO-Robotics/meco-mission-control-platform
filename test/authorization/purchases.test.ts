import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { createWorkflowAuthHeaders, workflowAuthEnv } from "../helpers/workflowAuth";

test("purchase approval and transitions are mentor/admin-only adjacent operations", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const leadHeaders = await createWorkflowAuthHeaders("lead");
    const mentorHeaders = await createWorkflowAuthHeaders("mentor");

    const pendingEdit = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { quantity: 2 } });
    assert.equal(pendingEdit.statusCode, 200);
    assert.equal(pendingEdit.json().item.quantity, 2);

    resetLimits();
    const forgedApproval = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { approvedByMentor: true, status: "approved" } });
    assert.equal(forgedApproval.statusCode, 403);

    resetLimits();
    const leadApproval = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: leadHeaders, payload: { approved: true } });
    assert.equal(leadApproval.statusCode, 403);

    resetLimits();
    const mentorApproval = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approved: true } });
    assert.equal(mentorApproval.statusCode, 200);
    assert.equal(mentorApproval.json().item.status, "approved");
    assert.equal(mentorApproval.json().item.approvedById, "jordan");
    assert.equal(Number.isNaN(Date.parse(mentorApproval.json().item.approvedAt)), false);

    resetLimits();
    const safeLegacyNoop = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { approvedByMentor: true, status: "approved" } });
    assert.equal(safeLegacyNoop.statusCode, 200);

    resetLimits();
    const postApprovalEdit = await app.inject({ method: "PATCH", url: "/api/purchases/ferrule-kit", headers: studentHeaders, payload: { quantity: 3 } });
    assert.equal(postApprovalEdit.statusCode, 409);

    resetLimits();
    const revoked = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approved: false } });
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().item.status, "requested");

    resetLimits();
    const reapproved = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approved: true } });
    assert.equal(reapproved.statusCode, 200);

    resetLimits();
    const skippedTransition = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: mentorHeaders, payload: { status: "delivered" } });
    assert.equal(skippedTransition.statusCode, 409);

    resetLimits();
    const studentTransition = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: studentHeaders, payload: { status: "purchased" } });
    assert.equal(studentTransition.statusCode, 403);

    resetLimits();
    const purchased = await app.inject({ method: "POST", url: "/api/purchases/ferrule-kit/transition", headers: mentorHeaders, payload: { status: "purchased", finalCost: 37.5 } });
    assert.equal(purchased.statusCode, 200);
    assert.equal(purchased.json().item.finalCost, 37.5);
    assert.ok(purchased.json().item.purchasedAt);

    resetLimits();
    const revokeAfterPurchase = await app.inject({ method: "PUT", url: "/api/purchases/ferrule-kit/approval", headers: mentorHeaders, payload: { approved: false } });
    assert.equal(revokeAfterPurchase.statusCode, 409);

    resetLimits();
    const deniedLeadDelete = await app.inject({ method: "DELETE", url: "/api/purchases/climber-ratchet-kit", headers: leadHeaders });
    assert.equal(deniedLeadDelete.statusCode, 403);

    resetLimits();
    const allowedMentorDelete = await app.inject({ method: "DELETE", url: "/api/purchases/climber-ratchet-kit", headers: mentorHeaders });
    assert.equal(allowedMentorDelete.statusCode, 200);
  }, { env: workflowAuthEnv });
});

test("purchase creation cannot self-approve and missing workflow records return 404", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const mentorHeaders = await createWorkflowAuthHeaders("mentor");
    const adminHeaders = await createWorkflowAuthHeaders("admin");
    const forgedCreate = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: studentHeaders,
      payload: {
        title: "Forged approval",
        subsystemId: "drive",
        requestedById: "ava",
        quantity: 1,
        vendor: "Vendor",
        linkLabel: "vendor.example/item",
        estimatedCost: 10,
        approvedByMentor: true,
        status: "approved",
      },
    });
    assert.equal(forgedCreate.statusCode, 403);

    resetLimits();
    const adminApproval = await app.inject({ method: "PUT", url: "/api/purchases/climber-ratchet-kit/approval", headers: adminHeaders, payload: { approved: true } });
    assert.equal(adminApproval.statusCode, 200);
    assert.equal(adminApproval.json().item.approvedById, "maya");

    resetLimits();
    const missing = await app.inject({ method: "PUT", url: "/api/purchases/missing/approval", headers: mentorHeaders, payload: { approved: true } });
    assert.equal(missing.statusCode, 404);
  }, { env: workflowAuthEnv });
});
