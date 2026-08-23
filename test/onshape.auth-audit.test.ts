import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot } from "../src/data/store";
import { setOnshapeCadClientFactoryForTests } from "../src/onshape/onshapeClientFactory";
import type { CadImportOnshapeClient } from "../src/onshape/onshapeTypes";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111";

function createAuthAuditFakeClient(): CadImportOnshapeClient {
  let callsUsed = 0;
  return {
    getCallsUsed: () => callsUsed,
    async fetchDocumentMetadata() {
      callsUsed += 1;
      return {
        documentName: "2026 Robot CAD",
        elementName: "Master Assembly",
        raw: { metadata: true },
      };
    },
    async fetchAssemblyBom() {
      callsUsed += 1;
      return {
        assemblyNodes: [],
        partDefinitions: [],
        partInstances: [],
        raw: { bom: true },
      };
    },
  };
}

test("Onshape import audit actor is derived from the authenticated session", async () => {
  setOnshapeCadClientFactoryForTests(() => createAuthAuditFakeClient());

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const { signSessionToken } = await import("../src/auth/authService");
      const token = signSessionToken({
        accountId: "jordan",
        authProvider: "email",
        email: "jordan.lee@mecorobotics.org",
        hostedDomain: "mecorobotics.org",
        name: "Jordan Lee",
        picture: null,
        role: "mentor",
        taskSubteamIds: [],
      });
      const authHeaders = { authorization: `Bearer ${token}` };

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        headers: authHeaders,
        payload: {
          url: versionUrl,
          label: "Robot version",
          projectId: "project-robot-2026",
          seasonId: "default-season",
          createdBy: "ava",
        },
      });
      assert.equal(createResponse.statusCode, 201);
      assert.equal(createResponse.json().item.createdBy, "jordan");
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const importResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        headers: authHeaders,
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "mallory" },
      });
      assert.equal(importResponse.statusCode, 201);
      const result = importResponse.json().result as { syncJobId: string };

      const auditAction = (getSnapshot().actions ?? []).find((action) => action.entityId === result.syncJobId);
      assert.ok(auditAction);
      assert.equal(auditAction.actorMemberId, "jordan");
      assert.deepEqual(auditAction.memberIds, ["jordan"]);
      assert.equal(auditAction.detailsJson?.actor, "jordan");
    }, {
      env: {
        AUTH_JWT_SECRET: "test-secret-that-is-long-enough-for-auth",
        AUTH_EMAIL_SMTP_HOST: "smtp.example.test",
        AUTH_EMAIL_FROM: "noreply@mecorobotics.org",
      },
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});
