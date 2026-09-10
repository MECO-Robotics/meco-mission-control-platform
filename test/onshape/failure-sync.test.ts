import assert from "node:assert/strict";
import { test } from "node:test";

import { getOnshapeRuntimeStore } from "../../src/onshape/cadStore";
import { setOnshapeCadClientFactoryForTests } from "../../src/onshape/onshapeClientFactory";
import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { setTransportClientFactory, simpleBomPayload, versionUrl } from "../helpers/onshapeFailureModes";

test("Onshape rate limits produce partial sync jobs and warning issues", async () => {
  let requestCount = 0;
  setTransportClientFactory(async ({ endpoint }) => {
    requestCount += 1;
    if (endpoint.endsWith("/bom")) {
      return {
        statusCode: 429,
        headers: { "x-rate-limit-remaining": "0" },
        json: { message: "Too many requests" },
      };
    }
    return {
      statusCode: 200,
      headers: { "x-rate-limit-remaining": "99" },
      json: {
        document: { name: "2026 Robot CAD" },
        element: { name: "Master Assembly" },
      },
    };
  });

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        payload: { url: versionUrl, label: "Robot version" },
      });
      assert.equal(createResponse.statusCode, 201);
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const importResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(importResponse.statusCode, 201);
      const result = importResponse.json().result as {
        syncJobId: string;
        status: string;
        stoppedReason: string;
        callsUsed: number;
      };
      assert.equal(result.status, "partial");
      assert.equal(result.stoppedReason, "rate_limit_429");
      assert.equal(result.callsUsed, 2);
      assert.equal(requestCount, 2);

      resetLimits();

      const issuesResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/sync-jobs/${result.syncJobId}/issues`,
      });
      assert.equal(issuesResponse.statusCode, 200);
      assert.ok(
        issuesResponse.json().items.some((issue: { code: string; message: string }) =>
          issue.code === "api_budget_reached" && issue.message.includes("rate_limit_429")),
      );
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});

test("Onshape immutable re-sync reuses the unchanged snapshot and cached payloads", async () => {
  let requestCount = 0;
  setTransportClientFactory(async ({ endpoint }) => {
    requestCount += 1;
    if (endpoint.endsWith("/bom")) {
      return {
        statusCode: 200,
        headers: { "x-rate-limit-remaining": "99" },
        json: simpleBomPayload(),
      };
    }
    return {
      statusCode: 200,
      headers: { "x-rate-limit-remaining": "99" },
      json: {
        document: { name: "2026 Robot CAD" },
        element: { name: "Master Assembly" },
      },
    };
  });

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        payload: { url: versionUrl, label: "Robot version" },
      });
      assert.equal(createResponse.statusCode, 201);
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const firstImport = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(firstImport.statusCode, 201);
      const firstSnapshotId = firstImport.json().result.snapshotId as string;

      resetLimits();

      const secondImport = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(secondImport.statusCode, 201);
      assert.equal(secondImport.json().result.snapshotId, firstSnapshotId);
      assert.equal(requestCount, 2);
      assert.equal(getOnshapeRuntimeStore().listSnapshots(refId).length, 1);
      assert.ok(getOnshapeRuntimeStore().listRequestLogs().some((log) => log.usedCache));
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});
