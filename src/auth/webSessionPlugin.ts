import type { FastifyInstance } from "fastify";

import { corsConfig, env, requestLimitConfig } from "../config/env";
import { createRequestLimitGuard } from "../security/requestLimits";
import { refreshSessionUser } from "./authService";
import {
  WEB_SESSION_COOKIE_NAME,
  type ResolvedWebSession,
  type WebSessionService,
} from "./webSessionService";

declare module "fastify" {
  interface FastifyRequest {
    webSession: ResolvedWebSession | null;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const WEB_LOGIN_PATHS = new Set([
  "/api/auth/web/google",
  "/api/auth/web/email/verify",
  "/api/auth/web/dev-bypass",
]);
const allowWebSessionResolutionRequest = createRequestLimitGuard({
  scope: "web-session-resolution",
  ...requestLimitConfig.api,
});

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) {
    return false;
  }
  return corsConfig.allowsAnyOrigin || corsConfig.origins.includes(origin);
}

function readCsrfHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function webSessionCookieOptions(expiresAt?: Date) {
  return {
    path: "/api",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    ...(expiresAt ? { expires: expiresAt } : null),
  };
}

export function registerWebSessionSupport(
  app: FastifyInstance,
  service: WebSessionService,
) {
  app.decorateRequest("webSession", null);

  app.addHook("onRequest", async (request, reply) => {
    request.webSession = null;

    const path = request.url.split("?", 1)[0];
    if (
      (path !== "/api" && !path.startsWith("/api/")) ||
      request.headers.authorization ||
      WEB_LOGIN_PATHS.has(path)
    ) {
      return;
    }

    const sessionToken = request.cookies[WEB_SESSION_COOKIE_NAME];
    if (!sessionToken) {
      return;
    }
    if (!allowWebSessionResolutionRequest(request, reply)) {
      return;
    }

    const resolved = await service.resolve(sessionToken);
    if (!resolved) {
      reply.clearCookie(WEB_SESSION_COOKIE_NAME, webSessionCookieOptions());
      return;
    }

    try {
      resolved.user = refreshSessionUser(resolved.user, app.userPreferences);
    } catch {
      await service.revoke(resolved);
      reply.clearCookie(WEB_SESSION_COOKIE_NAME, webSessionCookieOptions());
      return;
    }
    request.webSession = resolved;

    if (SAFE_METHODS.has(request.method)) {
      return;
    }

    const csrfToken = readCsrfHeader(request.headers["x-csrf-token"]);
    if (!isAllowedOrigin(request.headers.origin) || !service.validateCsrf(resolved, csrfToken)) {
      return reply.code(403).send({
        message: "This request could not be verified. Refresh the app and try again.",
      });
    }
  });
}
