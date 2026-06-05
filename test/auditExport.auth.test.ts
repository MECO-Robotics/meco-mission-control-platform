import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { authEnv, signTestToken } from "./auditExport.helpers";

test("audit export requires an admin session", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const mentorToken = await signTestToken({
        email: "mentor@mecorobotics.org",
        role: "mentor",
      });
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      const mentorResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export",
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
      });

      assert.equal(mentorResponse.statusCode, 403);
      assert.match(mentorResponse.json().message, /Only admins can export audit history/i);

      resetLimits();

      const adminResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(adminResponse.statusCode, 200);
      assert.equal(Array.isArray(adminResponse.json().items), true);
    },
    { env: authEnv },
  );
});
