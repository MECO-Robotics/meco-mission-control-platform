import { TIMEOUT_MS } from "./config.mjs";

export async function requestJson(url, init = {}) {
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
