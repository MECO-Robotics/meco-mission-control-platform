#!/usr/bin/env node

import net from "node:net";

const BASE_URL = trimTrailingSlash(
  process.env.PLATFORM_API_BASE_URL ??
    process.env.PLATFORM_BASE_URL ??
    "http://127.0.0.1:8080",
);
const WEB_BASE_URL = trimTrailingSlash(process.env.WEB_BASE_URL ?? "");
const PLATFORM_TEST_TOKEN = process.env.PLATFORM_TEST_TOKEN?.trim() ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const REQUIRE_AUTH_ENABLED = parseBool(process.env.SMOKE_REQUIRE_AUTH_ENABLED, true);
const ALLOW_SERVICE_DB_HOST = parseBool(process.env.SMOKE_ALLOW_SERVICE_DB_HOST, false);
const TIMEOUT_MS = Math.max(500, Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "10000", 10));

const results = [];
let hasFailure = false;

async function main() {
  await runCheck("health", checkHealth);
  const authConfig = await runCheck("auth_config", () => checkAuthConfig());
  const isAuthEnabled = authConfig?.enabled === true;

  await runCheck("auth_cors_with_web_origin", () => checkCorsHeader());
  if (WEB_BASE_URL) {
    await runCheck("web_api_proxy", checkWebApiProxy);
  }

  await runCheck("bootstrap_unauth", () =>
    checkBootstrapUnauth(isAuthEnabled),
  );
  await runCheck("database_socket", () => checkDatabaseSocket());

  if (PLATFORM_TEST_TOKEN) {
    await runCheck("database_via_cad_endpoint", () => checkCadEndpoint());
    await runCheck("bootstrap_auth", () => checkBootstrapAuth());
  } else {
    logResult("skip", "database_via_cad_endpoint", "PLATFORM_TEST_TOKEN not set");
    logResult("skip", "bootstrap_auth", "PLATFORM_TEST_TOKEN not set");
  }

  if (hasFailure) {
    console.log("\nSmoke checks failed.");
    for (const result of results) {
      console.log(formatResult(result));
    }
    process.exit(1);
  }

  console.log("\nSmoke checks passed.");
  for (const result of results) {
    console.log(formatResult(result));
  }
}

function formatResult(result) {
  return `[${result.status}] ${result.check.padEnd(30)} ${result.details}`;
}

async function runCheck(name, fn) {
  try {
    return await fn();
  } catch (error) {
    logResult(
      "FAIL",
      name,
      (error instanceof Error ? error.message : `${error}`) || "unknown failure",
    );
    return null;
  }
}

function parseBool(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function logResult(status, check, details) {
  results.push({ status, check, details });
  if (status === "FAIL") {
    hasFailure = true;
  }
}

async function requestJson(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("accept", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const rawText = await response.text();
    const payload = rawText.length ? safeParseJson(rawText) : null;
    return { response, rawText, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function checkHealth() {
  const { response, rawText, payload } = await requestJson(`${BASE_URL}/health`);
  if (response.status !== 200) {
    logResult(
      "FAIL",
      "health",
      `unexpected status ${response.status} on ${BASE_URL}/health`,
    );
    return null;
  }
  if (
    !payload ||
    payload.status !== "ok" ||
    payload.service !== "meco-platform"
  ) {
    logResult(
      "FAIL",
      "health",
      `unexpected payload: ${rawText || "<empty>"}`,
    );
    return null;
  }

  logResult(
    "PASS",
    "health",
    `status=${payload.status}, service=${payload.service}, timestamp=${payload.timestamp ?? "<missing>"}`,
  );
  return payload;
}

async function checkAuthConfig() {
  const { response, payload } = await requestJson(`${BASE_URL}/api/auth/config`);
  if (response.status !== 200) {
    logResult(
      "FAIL",
      "auth_config",
      `unexpected status ${response.status} on ${BASE_URL}/api/auth/config`,
    );
    return null;
  }
  if (!payload || typeof payload.enabled !== "boolean" || !payload.hostedDomain) {
    logResult(
      "FAIL",
      "auth_config",
      "missing expected auth fields in /api/auth/config response",
    );
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

async function checkCorsHeader() {
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
    logResult(
      "FAIL",
      "auth_cors_with_web_origin",
      "missing or invalid access-control-allow-origin header",
    );
    return;
  }
  logResult(
    "FAIL",
    "auth_cors_with_web_origin",
    `access-control-allow-origin=${allowOrigin ?? "missing"}`,
  );
}

async function checkWebApiProxy() {
  const { response } = await requestJson(`${WEB_BASE_URL}/api/auth/config`);
  const directStatus = await getStatusWithoutThrow(`${BASE_URL}/api/auth/config`);
  if (response.status !== 200) {
    logResult(
      "FAIL",
      "web_api_proxy",
      `unexpected status ${response.status} on ${WEB_BASE_URL}/api/auth/config`,
    );
    return;
  }
  if (directStatus !== null && response.status !== directStatus) {
    logResult(
      "FAIL",
      "web_api_proxy",
      `status mismatch direct=${directStatus} proxied=${response.status}`,
    );
    return;
  }

  logResult(
    "PASS",
    "web_api_proxy",
    `${WEB_BASE_URL}/api/auth/config is reachable and returns /api contract`,
  );
}

async function getStatusWithoutThrow(url) {
  try {
    const { response } = await requestJson(url);
    return response.status;
  } catch {
    return null;
  }
}

async function checkBootstrapUnauth(expect401WhenAuthEnabled) {
  const { response, payload } = await requestJson(`${BASE_URL}/api/bootstrap`);
  if (expect401WhenAuthEnabled) {
    if (response.status === 401) {
      logResult("PASS", "bootstrap_unauth", "authentication required as expected");
      return;
    }
    logResult(
      "FAIL",
      "bootstrap_unauth",
      `expected 401 when auth is enabled, got ${response.status}`,
    );
    return;
  }

  if (response.status === 200 && payload && typeof payload === "object") {
    logResult("PASS", "bootstrap_unauth", "bootstrap returned without auth (auth disabled path)");
    return;
  }
  logResult(
    "FAIL",
    "bootstrap_unauth",
    `unexpected status ${response.status} when auth is disabled`,
  );
}

async function checkCadEndpoint() {
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
    logResult(
      "FAIL",
      "database_via_cad_endpoint",
      "response missing expected items array",
    );
    return;
  }
  logResult(
    "PASS",
    "database_via_cad_endpoint",
    `received ${payload.items.length} item(s) from CAD import runs list`,
  );
}

async function checkBootstrapAuth() {
  const { response, payload } = await requestJson(`${BASE_URL}/api/bootstrap`, {
    headers: {
      Authorization: `Bearer ${PLATFORM_TEST_TOKEN}`,
    },
  });
  if (response.status !== 200) {
    logResult(
      "FAIL",
      "bootstrap_auth",
      `unexpected status ${response.status} on /api/bootstrap with token`,
    );
    return;
  }
  if (!payload || typeof payload !== "object") {
    logResult(
      "FAIL",
      "bootstrap_auth",
      "bootstrap response is not JSON object",
    );
    return;
  }
  const missing = ["seasons", "projects", "members", "tasks", "actions"].filter(
    (field) => !Array.isArray(payload[field]),
  );
  if (missing.length) {
    logResult(
      "FAIL",
      "bootstrap_auth",
      `missing or invalid fields: ${missing.join(", ")}`,
    );
    return;
  }
  logResult("PASS", "bootstrap_auth", "bootstrap payload includes core collections");
}

async function checkDatabaseSocket() {
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

  logResult(
    "PASS",
    "database_socket",
    `socket connect to ${db.host}:${db.port} succeeded`,
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

void main();
