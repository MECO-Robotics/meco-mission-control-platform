import { deepStrictEqual } from "node:assert";
import net from "node:net";

import {
  ALLOW_SERVICE_DB_HOST,
  BASE_URL,
  DATABASE_URL,
  PLATFORM_TEST_TOKEN,
  REQUIRE_AUTH_ENABLED,
  TIMEOUT_MS,
  WEB_BASE_URL,
} from "./config.mjs";
import { requestJson } from "./http.mjs";
import { logResult } from "./results.mjs";

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

export async function checkCadEndpoint() {
  const { response, payload } = await requestJson(`${BASE_URL}/api/cad/import-runs`, {
    headers: {
      Authorization: `Bearer ${PLATFORM_TEST_TOKEN}`,
    },
  });
  if (response.status !== 200) {
    logResult(
      "FAIL",
      "database_via_cad_endpoint",
      `unexpected status ${response.status} on /api/cad/import-runs`,
    );
    return;
  }
  if (!payload || !Array.isArray(payload.items)) {
    logResult("FAIL", "database_via_cad_endpoint", "response missing expected items array");
    return;
  }
  logResult(
    "PASS",
    "database_via_cad_endpoint",
    `received ${payload.items.length} item(s) from CAD import runs list`,
  );
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

export async function checkDatabaseSocket() {
  if (!DATABASE_URL) {
    logResult("SKIP", "database_socket", "DATABASE_URL not set");
    return;
  }

  const db = parseDatabaseUrl(DATABASE_URL);
  if (!db) {
    logResult("FAIL", "database_socket", "cannot parse DATABASE_URL");
    return;
  }
  if (db.host === "postgres" && !ALLOW_SERVICE_DB_HOST) {
    logResult(
      "SKIP",
      "database_socket",
      "DATABASE_URL host is postgres service name; set SMOKE_ALLOW_SERVICE_DB_HOST=1 to force check",
    );
    return;
  }

  await new Promise((resolve, reject) => {
    const socket = net.createConnection(
      {
        host: db.host,
        port: db.port,
        timeout: TIMEOUT_MS,
      },
      () => {
        socket.destroy();
        resolve();
      },
    );
    socket.once("timeout", () => {
      socket.destroy(new Error(`timeout after ${TIMEOUT_MS}ms`));
    });
    socket.once("error", (error) => {
      reject(new Error(`socket check failed for ${db.host}:${db.port}: ${error.message}`));
    });
  });

  logResult("PASS", "database_socket", `socket connect to ${db.host}:${db.port} succeeded`);
}

function isAuthConfigPayload(payload) {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof payload.enabled === "boolean" &&
    typeof payload.hostedDomain === "string"
  );
}

function parseDatabaseUrl(value) {
  try {
    const normalized = value.startsWith("postgres://") || value.startsWith("postgresql://")
      ? value
      : `postgresql://${value}`;
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : 5432,
    };
  } catch {
    return null;
  }
}
