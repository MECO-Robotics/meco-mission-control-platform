import {
  BASE_URL,
  PLATFORM_TEST_TOKEN,
} from "../config.mjs";
import { requestJson } from "../http.mjs";
import { logResult } from "../results.mjs";

export async function checkBootstrapUnauth(expect401WhenAuthEnabled) {
  const { response, payload } = await requestJson(`${BASE_URL}/api/bootstrap`);
  if (expect401WhenAuthEnabled) {
    if (response.status === 401) {
      logResult("PASS", "bootstrap_unauth", "authentication required as expected");
      return;
    }
    logResult("FAIL", "bootstrap_unauth", `expected 401 when auth is enabled, got ${response.status}`);
    return;
  }

  if (response.status === 200 && payload && typeof payload === "object") {
    logResult("PASS", "bootstrap_unauth", "bootstrap returned without auth (auth disabled path)");
    return;
  }
  logResult("FAIL", "bootstrap_unauth", `unexpected status ${response.status} when auth is disabled`);
}

export async function checkBootstrapAuth() {
  const { response, payload } = await requestJson(`${BASE_URL}/api/bootstrap`, {
    headers: {
      Authorization: `Bearer ${PLATFORM_TEST_TOKEN}`,
    },
  });
  if (response.status !== 200) {
    logResult("FAIL", "bootstrap_auth", `unexpected status ${response.status} on /api/bootstrap with token`);
    return;
  }
  if (!payload || typeof payload !== "object") {
    logResult("FAIL", "bootstrap_auth", "bootstrap response is not JSON object");
    return;
  }
  const missing = ["seasons", "projects", "members", "tasks", "actions"].filter(
    (field) => !Array.isArray(payload[field]),
  );
  if (missing.length) {
    logResult("FAIL", "bootstrap_auth", `missing or invalid fields: ${missing.join(", ")}`);
    return;
  }
  logResult("PASS", "bootstrap_auth", "bootstrap payload includes core collections");
}
