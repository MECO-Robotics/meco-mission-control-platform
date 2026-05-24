import net from "node:net";

import {
  ALLOW_SERVICE_DB_HOST,
  BASE_URL,
  DATABASE_URL,
  PLATFORM_TEST_TOKEN,
  TIMEOUT_MS,
} from "../config.mjs";
import { requestJson } from "../http.mjs";
import { logResult } from "../results.mjs";

export async function checkCadEndpoint() {
  const { response, payload } = await requestJson(
    `${BASE_URL}/api/cad/import-runs?limit=1`,
    {
      headers: {
        Authorization: `Bearer ${PLATFORM_TEST_TOKEN}`,
      },
    },
  );
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
