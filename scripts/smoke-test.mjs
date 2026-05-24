#!/usr/bin/env node

import {
  BASE_URL,
  PLATFORM_TEST_TOKEN,
  WEB_BASE_URL,
} from "./smoke-test/config.mjs";
import {
  checkAuthConfig,
  checkBootstrapAuth,
  checkBootstrapUnauth,
  checkCadEndpoint,
  checkCorsHeader,
  checkDatabaseSocket,
  checkHealth,
  checkWebApiProxy,
} from "./smoke-test/checks.mjs";
import {
  finalizeSmokeResults,
  logResult,
  runCheck,
} from "./smoke-test/results.mjs";

async function main() {
  await runCheck("health", checkHealth);
  const authConfig = await runCheck("auth_config", checkAuthConfig);
  const isAuthEnabled = authConfig?.enabled === true;

  await runCheck("auth_cors_with_web_origin", checkCorsHeader);
  if (WEB_BASE_URL) {
    await runCheck("web_api_proxy", checkWebApiProxy);
  }

  await runCheck("bootstrap_unauth", () => checkBootstrapUnauth(isAuthEnabled));
  await runCheck("database_socket", checkDatabaseSocket);

  if (PLATFORM_TEST_TOKEN) {
    await runCheck("database_via_cad_endpoint", checkCadEndpoint);
    await runCheck("bootstrap_auth", checkBootstrapAuth);
  } else {
    logResult("skip", "database_via_cad_endpoint", "PLATFORM_TEST_TOKEN not set");
    logResult("skip", "bootstrap_auth", "PLATFORM_TEST_TOKEN not set");
  }

  finalizeSmokeResults();
}

main().catch((error) => {
  console.error(
    "Smoke checks failed before results could be finalized.",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
