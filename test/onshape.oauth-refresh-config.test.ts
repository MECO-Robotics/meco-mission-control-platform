import assert from "node:assert/strict";
import { test } from "node:test";

import { setOnshapeOAuthTokenTransportForTests } from "../src/onshape/onshapeOAuth";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("Onshape OAuth refresh returns 409 when client credentials are missing", async () => {
  let transportCalled = false;
  setOnshapeOAuthTokenTransportForTests(async () => {
    transportCalled = true;
    throw new Error("refresh transport should not be called");
  });

  try {
    await withIntegrationApp(
      async ({ app, resetLimits }) => {
        const response = await app.inject({
          method: "POST",
          url: "/api/onshape/oauth/refresh",
        });

        assert.equal(response.statusCode, 409);
        assert.match(response.json().message, /client ID and client secret/i);
        assert.equal(transportCalled, false);
        resetLimits();
      },
      {
        env: {
          ONSHAPE_OAUTH_CLIENT_ID: undefined,
          ONSHAPE_OAUTH_CLIENT_SECRET: undefined,
          ONSHAPE_OAUTH_REFRESH_TOKEN: "stored-refresh-token",
        },
      },
    );
  } finally {
    setOnshapeOAuthTokenTransportForTests(null);
  }
});
