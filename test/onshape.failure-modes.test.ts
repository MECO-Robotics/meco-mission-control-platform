import assert from "node:assert/strict";
import { test } from "node:test";

import { getOnshapeRuntimeStore } from "../src/onshape/cadStore";
import { createOnshapeApiClient } from "../src/onshape/onshapeApiClient";
import { createOnshapeCadClient } from "../src/onshape/onshapeCadClient";
import { setOnshapeCadClientFactoryForTests } from "../src/onshape/onshapeClientFactory";
import { setOnshapeOAuthTokenTransportForTests } from "../src/onshape/onshapeOAuth";
import type { OnshapeTransport } from "../src/onshape/onshapeTypes";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111";
const missingElementUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222";

function setTransportClientFactory(transport: OnshapeTransport) {
  setOnshapeCadClientFactoryForTests((store) =>
    createOnshapeCadClient(
      createOnshapeApiClient({
        store,
        credentials: { mode: "oauth", bearerToken: "test-access-token" },
        transport,
      }),
    ));
}

function simpleBomPayload() {
  return {
    rootAssembly: {
      documentId: "0123456789abcdef01234567",
      elementId: "111111111111111111111111",
      occurrenceId: "root",
      name: "Robot master",
      children: [
        {
          documentId: "0123456789abcdef01234567",
          elementId: "111111111111111111111111",
          partId: "plate",
          occurrenceId: "plate-1",
          name: "Belly pan",
          partNumber: "DRV-100",
        },
      ],
    },
  };
}

test("Onshape document ref route rejects malformed and non-Onshape URLs safely", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const malformedResponse = await app.inject({
      method: "POST",
      url: "/api/onshape/document-refs",
      payload: {
        url: "this is not a url",
        label: "Bad reference",
      },
    });
    assert.equal(malformedResponse.statusCode, 400);
    assert.match(malformedResponse.body, /Onshape URL is invalid/);
    assert.doesNotMatch(malformedResponse.body, /test-onshape-secret|test-access-token/i);

    resetLimits();

    const wrongHostResponse = await app.inject({
      method: "POST",
      url: "/api/onshape/document-refs",
      payload: {
        url: "https://example.test/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111",
        label: "Wrong host",
      },
    });
    assert.equal(wrongHostResponse.statusCode, 400);
    assert.match(wrongHostResponse.body, /URL is not an Onshape URL/);
    assert.doesNotMatch(wrongHostResponse.body, /test-onshape-secret|test-access-token/i);
  });
});

test("Onshape BOM sync records missing element references as failed jobs", async () => {
  let requestCount = 0;
  setTransportClientFactory(async ({ endpoint }) => {
    requestCount += 1;
    if (endpoint.endsWith("/bom")) {
      throw new Error("BOM transport should not be called when the element ID is missing");
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
        payload: { url: missingElementUrl, label: "Version without element" },
      });
      assert.equal(createResponse.statusCode, 201);
      assert.ok(
        createResponse.json().warnings.includes(
          "elementId is missing; link-only storage is allowed but assembly sync may need an element.",
        ),
      );
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const importResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(importResponse.statusCode, 502);
      const result = importResponse.json().result as { syncJobId: string; status: string };
      assert.equal(result.status, "failed");

      resetLimits();

      const jobResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/sync-jobs/${result.syncJobId}`,
      });
      assert.equal(jobResponse.statusCode, 200);
      assert.equal(jobResponse.json().item.status, "failed");
      assert.equal(jobResponse.json().item.errorMessage, "Onshape element ID is required for BOM sync.");
      assert.ok(
        jobResponse.json().issues.some((issue: { code: string }) => issue.code === "missing_element_id"),
      );
      assert.equal(requestCount, 1);
      assert.equal(getOnshapeRuntimeStore().listRequestLogs().length, 1);
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});

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

test("Onshape expired token refresh failures return safe browser-facing errors", async () => {
  setOnshapeOAuthTokenTransportForTests(async ({ body }) => {
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "expired-refresh-token");
    return {
      statusCode: 401,
      json: { error: "invalid_grant", access_token: "leaked-access-token" },
    };
  });

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      getOnshapeRuntimeStore().setOAuthTokenSet({
        accessToken: "expired-access-token",
        refreshToken: "expired-refresh-token",
        tokenType: "Bearer",
        scope: "OAuth2Read",
        expiresAt: "2000-01-01T00:00:00.000Z",
        receivedAt: "1999-12-31T23:00:00.000Z",
      });

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
        payload: { documentRefId: refId, syncLevel: "shallow", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(importResponse.statusCode, 502);
      assert.deepEqual(importResponse.json(), {
        message: "Onshape sync client could not be configured. Check the Onshape OAuth connection and try again.",
      });
      assert.doesNotMatch(
        importResponse.body,
        /expired-access-token|expired-refresh-token|leaked-access-token|test-onshape-secret/,
      );
    });
  } finally {
    setOnshapeOAuthTokenTransportForTests(null);
  }
});

test("Onshape overview omits browser-exposed OAuth secrets", async () => {
  await withIntegrationApp(async ({ app }) => {
    getOnshapeRuntimeStore().setOAuthTokenSet({
      accessToken: "runtime-access-token",
      refreshToken: "runtime-refresh-token",
      tokenType: "Bearer",
      scope: "OAuth2Read",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      receivedAt: new Date().toISOString(),
    });

    const response = await app.inject({ method: "GET", url: "/api/onshape/overview" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().connection.oauth.credentialSource, "runtime");
    assert.doesNotMatch(
      response.body,
      /runtime-access-token|runtime-refresh-token|test-onshape-secret|clientSecret|refreshToken|accessToken/,
    );
  });
});
