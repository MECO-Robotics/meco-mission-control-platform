import { issueTestMobileToken } from "./helpers/sessionAuth";
import assert from "node:assert/strict";
import { test } from "node:test";

import { setOnshapeCadClientFactoryForTests } from "../src/onshape/onshapeClientFactory";
import type { CadImportOnshapeClient } from "../src/onshape/onshapeTypes";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111";

function createRouteFakeClient(): CadImportOnshapeClient {
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

async function createAuthHeadersFor(email: string, role: "student" | "lead" | "mentor" | "admin") {

  const token = await issueTestMobileToken({
    accountId: email,
    authProvider: "email",
    email,
    hostedDomain: "mecorobotics.org",
    name: email,
    picture: null,
    role,
    taskSubteamIds: [],
  });
  return { authorization: `Bearer ${token}` };
}

test("Onshape OAuth credential routes allow configured bootstrap mentors outside the roster", async () => {
  await withIntegrationApp(
    async ({ app }) => {
      const mentorHeaders = await createAuthHeadersFor("mentor.override@mecorobotics.org", "mentor");

      const allowedAuthorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
        headers: mentorHeaders,
      });
      assert.equal(allowedAuthorizationResponse.statusCode, 200);
      assert.equal(typeof allowedAuthorizationResponse.json().authorizationUrl, "string");
    },
    {
      env: {
        GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
        AUTH_MENTOR_EMAILS: "mentor.override@mecorobotics.org",
      },
    },
  );
});

test("Onshape OAuth credential routes keep external roster members from inheriting bootstrap mentor access", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const adminHeaders = await createAuthHeadersFor("maya.ortiz@mecorobotics.org", "admin");
      const createExternalResponse = await app.inject({
        method: "POST",
        url: "/api/members",
        headers: adminHeaders,
        payload: {
          name: "External Sponsor",
          email: "mentor.override@mecorobotics.org",
          role: "external",
        },
      });
      assert.equal(createExternalResponse.statusCode, 201);

      resetLimits();

      const externalHeaders = await createAuthHeadersFor("mentor.override@mecorobotics.org", "mentor");

      const deniedAuthorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
        headers: externalHeaders,
      });
      assert.equal(deniedAuthorizationResponse.statusCode, 403);
      assert.match(deniedAuthorizationResponse.json().message, /external roster sessions cannot access internal platform api routes/i);
    },
    {
      env: {
        GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
        AUTH_MENTOR_EMAILS: "mentor.override@mecorobotics.org",
      },
    },
  );
});

test("Onshape OAuth credential routes require lead mentor or admin permissions when auth is enabled", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const studentHeaders = await createAuthHeadersFor("ava.chen@mecorobotics.org", "student");
      const mentorHeaders = await createAuthHeadersFor("jordan.lee@mecorobotics.org", "mentor");

      const deniedAuthorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
        headers: studentHeaders,
      });
      assert.equal(deniedAuthorizationResponse.statusCode, 403);
      assert.match(deniedAuthorizationResponse.json().message, /leads, mentors, and admins/i);

      resetLimits();

      const deniedRefreshResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/refresh",
        headers: studentHeaders,
      });
      assert.equal(deniedRefreshResponse.statusCode, 403);
      assert.match(deniedRefreshResponse.json().message, /leads, mentors, and admins/i);

      resetLimits();

      const studentHealthResponse = await app.inject({
        method: "GET",
        url: "/api/onshape/oauth/health",
        headers: studentHeaders,
      });
      assert.equal(studentHealthResponse.statusCode, 200);
      assert.equal(studentHealthResponse.json().item.reconnectAction.available, false);

      resetLimits();

      const allowedAuthorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
        headers: mentorHeaders,
      });
      assert.equal(allowedAuthorizationResponse.statusCode, 200);
      assert.equal(typeof allowedAuthorizationResponse.json().authorizationUrl, "string");

      resetLimits();

      const mentorHealthResponse = await app.inject({
        method: "GET",
        url: "/api/onshape/oauth/health",
        headers: mentorHeaders,
      });
      assert.equal(mentorHealthResponse.statusCode, 200);
      assert.equal(mentorHealthResponse.json().item.reconnectAction.available, true);
    },
    {
      env: {
        GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      },
    },
  );
});

test("Onshape deep release sync honors mentor sessions", async () => {
  setOnshapeCadClientFactoryForTests(() => createRouteFakeClient());

  try {
    await withIntegrationApp(
      async ({ app, resetLimits }) => {
        const mentorHeaders = await createAuthHeadersFor("jordan.lee@mecorobotics.org", "mentor");

        const createResponse = await app.inject({
          method: "POST",
          url: "/api/onshape/document-refs",
          headers: mentorHeaders,
          payload: {
            url: versionUrl,
            label: "Release robot version",
            projectId: "robot-2026",
          },
        });
        assert.equal(createResponse.statusCode, 201);
        const refId = createResponse.json().item.id as string;

        resetLimits();

        const deepReleaseResponse = await app.inject({
          method: "POST",
          url: "/api/onshape/import-runs",
          headers: mentorHeaders,
          payload: {
            documentRefId: refId,
            syncLevel: "deep_release",
          },
        });

        assert.equal(deepReleaseResponse.statusCode, 201);
      },
      {
        env: {
          GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
        },
      },
    );
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});
