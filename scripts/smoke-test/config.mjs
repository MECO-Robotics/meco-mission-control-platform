export const BASE_URL = trimTrailingSlash(
  process.env.PLATFORM_API_BASE_URL ??
    process.env.PLATFORM_BASE_URL ??
    "http://127.0.0.1:8080",
);
export const WEB_BASE_URL = trimTrailingSlash(process.env.WEB_BASE_URL ?? "");
export const PLATFORM_TEST_TOKEN = process.env.PLATFORM_TEST_TOKEN?.trim() ?? "";
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
export const REQUIRE_AUTH_ENABLED = parseBool(process.env.SMOKE_REQUIRE_AUTH_ENABLED, true);
export const ALLOW_SERVICE_DB_HOST = parseBool(process.env.SMOKE_ALLOW_SERVICE_DB_HOST, false);

const rawTimeoutMs = process.env.SMOKE_TIMEOUT_MS;
const parsedTimeoutMs = rawTimeoutMs === undefined ? 10000 : Number.parseInt(rawTimeoutMs, 10);
export const TIMEOUT_MS = Number.isFinite(parsedTimeoutMs)
  ? Math.max(500, parsedTimeoutMs)
  : 10000;

function parseBool(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
