import { deepStrictEqual } from "node:assert";

import {
  BASE_URL,
  REQUIRE_AUTH_ENABLED,
  WEB_BASE_URL,
} from "../config.mjs";
import { requestJson } from "../http.mjs";
import { logResult } from "../results.mjs";

export async function checkAuthConfig() {
  const { response, payload } = await requestJson(`${BASE_URL}/api/auth/config`);
  if (response.status !== 200) {
    logResult(
      "FAIL",
      "auth_config",
      `unexpected status ${response.status} on ${BASE_URL}/api/auth/config`,
    );
    return null;
  }
  if (!isAuthConfigPayload(payload)) {
    logResult("FAIL", "auth_config", "missing expected auth fields in /api/auth/config response");
    return null;
  }
  if (REQUIRE_AUTH_ENABLED && payload.enabled !== true) {
    logResult(
      "FAIL",
      "auth_config",
      "production smoke checks expect auth enabled; auth config is disabled",
    );
    return null;
  }

  logResult(
    "PASS",
    "auth_config",
    `enabled=${payload.enabled}, hostedDomain=${payload.hostedDomain}, googleClientId=${payload.googleClientId ? "present" : "missing"}`,
  );
  return payload;
}

export async function checkCorsHeader() {
  if (!WEB_BASE_URL) {
    logResult("SKIP", "auth_cors_with_web_origin", "WEB_BASE_URL not set");
    return;
  }

  const requestUrl = `${BASE_URL}/api/auth/config`;
  const { response } = await requestJson(requestUrl, {
    headers: { Origin: WEB_BASE_URL },
  });
  const allowOrigin = response.headers.get("access-control-allow-origin");
  if (allowOrigin === "*" || allowOrigin === WEB_BASE_URL) {
    logResult(
      "PASS",
      "auth_cors_with_web_origin",
      `access-control-allow-origin=${allowOrigin}`,
    );
    return;
  }
  if (response.status === 200 && (!allowOrigin || allowOrigin === "null")) {
    logResult("FAIL", "auth_cors_with_web_origin", "missing or invalid access-control-allow-origin header");
    return;
  }
  logResult(
    "FAIL",
    "auth_cors_with_web_origin",
    `access-control-allow-origin=${allowOrigin ?? "missing"}`,
  );
}

export async function checkWebApiProxy() {
  const { response, payload: proxyPayload } = await requestJson(
    `${WEB_BASE_URL}/api/auth/config`,
  );
  const { response: directResponse, payload: directPayload } = await requestJson(
    `${BASE_URL}/api/auth/config`,
  );

  if (!isAuthConfigPayload(proxyPayload)) {
    logResult("FAIL", "web_api_proxy", "proxied /api/auth/config did not return a valid auth-config JSON body");
    return;
  }
  if (!isAuthConfigPayload(directPayload)) {
    logResult("FAIL", "web_api_proxy", "platform /api/auth/config did not return a valid auth-config JSON body");
    return;
  }

  try {
    deepStrictEqual(proxyPayload, directPayload);
  } catch {
    logResult(
      "FAIL",
      "web_api_proxy",
      "web proxy auth-config response body does not match platform auth-config payload",
    );
    return;
  }

  if (response.status !== 200) {
    logResult(
      "FAIL",
      "web_api_proxy",
      `unexpected status ${response.status} on ${WEB_BASE_URL}/api/auth/config`,
    );
    return;
  }
  if (directResponse.status !== null && response.status !== directResponse.status) {
    logResult(
      "FAIL",
      "web_api_proxy",
      `status mismatch direct=${directResponse.status} proxied=${response.status}`,
    );
    return;
  }

  logResult(
    "PASS",
    "web_api_proxy",
    `${WEB_BASE_URL}/api/auth/config is reachable and returns /api contract`,
  );
}

function isAuthConfigPayload(payload) {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof payload.enabled === "boolean" &&
    typeof payload.hostedDomain === "string" &&
    "googleClientId" in payload &&
    (payload.googleClientId === null || typeof payload.googleClientId === "string")
  );
}
