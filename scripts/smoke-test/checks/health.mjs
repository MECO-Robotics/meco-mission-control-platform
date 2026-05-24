import { BASE_URL } from "../config.mjs";
import { requestJson } from "../http.mjs";
import { logResult } from "../results.mjs";

export async function checkHealth() {
  const { response, rawText, payload } = await requestJson(`${BASE_URL}/health`);
  if (response.status !== 200) {
    logResult("FAIL", "health", `unexpected status ${response.status} on ${BASE_URL}/health`);
    return null;
  }
  if (!payload || payload.status !== "ok" || payload.service !== "meco-platform") {
    logResult("FAIL", "health", `unexpected payload: ${rawText || "<empty>"}`);
    return null;
  }

  logResult(
    "PASS",
    "health",
    `status=${payload.status}, service=${payload.service}, timestamp=${payload.timestamp ?? "<missing>"}`,
  );
  return payload;
}
