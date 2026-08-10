import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { createWorkflowAuthHeaders, workflowAuthEnv } from "../helpers/workflowAuth";

test("manufacturing review is protected while internal users can make adjacent progress", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const studentHeaders = createWorkflowAuthHeaders("student");
    const leadHeaders = createWorkflowAuthHeaders("lead");
    const mentorHeaders = createWorkflowAuthHeaders("mentor");

    const pendingEdit = await app.inject({ method: "PATCH", url: "/api/manufacturing/frame-weldment", headers: studentHeaders, payload: { quantity: 2 } });
    assert.equal(pendingEdit.statusCode, 200);

    resetLimits();
    const forgedReview = await app.inject({ method: "PATCH", url: "/api/manufacturing/frame-weldment", headers: studentHeaders, payload: { mentorReviewed: true, status: "approved" } });
    assert.equal(forgedReview.statusCode, 403);

    resetLimits();
    const leadReview = await app.inject({ method: "PUT", url: "/api/manufacturing/frame-weldment/review", headers: leadHeaders, payload: { reviewed: true } });
    assert.equal(leadReview.statusCode, 403);

    resetLimits();
    const unreviewedTransition = await app.inject({ method: "POST", url: "/api/manufacturing/frame-weldment/transition", headers: studentHeaders, payload: { status: "in-progress" } });
    assert.equal(unreviewedTransition.statusCode, 409);

    resetLimits();
    const reviewed = await app.inject({ method: "PUT", url: "/api/manufacturing/frame-weldment/review", headers: mentorHeaders, payload: { reviewed: true } });
    assert.equal(reviewed.statusCode, 200);
    assert.equal(reviewed.json().item.status, "approved");
    assert.equal(reviewed.json().item.reviewedById, "jordan");
    assert.equal(Number.isNaN(Date.parse(reviewed.json().item.reviewedAt)), false);

    resetLimits();
    const safeLegacyNoop = await app.inject({ method: "PATCH", url: "/api/manufacturing/frame-weldment", headers: studentHeaders, payload: { mentorReviewed: true, status: "approved" } });
    assert.equal(safeLegacyNoop.statusCode, 200);

    resetLimits();
    const postApprovalEdit = await app.inject({ method: "PATCH", url: "/api/manufacturing/frame-weldment", headers: studentHeaders, payload: { quantity: 3 } });
    assert.equal(postApprovalEdit.statusCode, 409);

    resetLimits();
    const revoked = await app.inject({ method: "PUT", url: "/api/manufacturing/frame-weldment/review", headers: mentorHeaders, payload: { reviewed: false } });
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().item.status, "requested");

    resetLimits();
    const rereviewed = await app.inject({ method: "PUT", url: "/api/manufacturing/frame-weldment/review", headers: mentorHeaders, payload: { reviewed: true } });
    assert.equal(rereviewed.statusCode, 200);

    resetLimits();
    const skipped = await app.inject({ method: "POST", url: "/api/manufacturing/frame-weldment/transition", headers: studentHeaders, payload: { status: "qa" } });
    assert.equal(skipped.statusCode, 409);

    for (const status of ["in-progress", "qa", "complete"] as const) {
      resetLimits();
      const transitioned = await app.inject({ method: "POST", url: "/api/manufacturing/frame-weldment/transition", headers: studentHeaders, payload: { status } });
      assert.equal(transitioned.statusCode, 200);
      assert.equal(transitioned.json().item.status, status);
      assert.equal(transitioned.json().item.mentorReviewed, true);
    }

    resetLimits();
    const deniedLeadDelete = await app.inject({ method: "DELETE", url: "/api/manufacturing/tablet-bracket-cut", headers: leadHeaders });
    assert.equal(deniedLeadDelete.statusCode, 403);

    resetLimits();
    const allowedMentorDelete = await app.inject({ method: "DELETE", url: "/api/manufacturing/tablet-bracket-cut", headers: mentorHeaders });
    assert.equal(allowedMentorDelete.statusCode, 200);
  }, { env: workflowAuthEnv });
});
