import type { FastifyInstance } from "fastify";

import { requestLimitConfig } from "../config/env";
import { createRequestLimitGuard } from "../security/requestLimits";
import { readBearerToken, refreshSessionUser } from "./authService";
import {
  isMobileAccessToken,
  type MobileSessionService,
  type ResolvedMobileSession,
} from "./mobileSessionService";

declare module "fastify" {
  interface FastifyRequest {
    mobileSession: ResolvedMobileSession | null;
  }
}

const allowMobileTokenResolution = createRequestLimitGuard({
  scope: "mobile-token-resolution",
  ...requestLimitConfig.auth,
});

export function registerMobileSessionSupport(
  app: FastifyInstance,
  service: MobileSessionService,
) {
  app.decorateRequest("mobileSession", null);

  app.addHook("preHandler", async (request, reply) => {
    request.mobileSession = null;
    const token = readBearerToken(request.headers.authorization);
    if (!token || !isMobileAccessToken(token)) return;
    if (!allowMobileTokenResolution(request, reply)) return reply;

    const resolved = await service.resolve(token);
    if (!resolved) return;
    try {
      resolved.user = refreshSessionUser(resolved.user);
    } catch {
      await service.revokeSession(resolved.session.id);
      return;
    }
    request.mobileSession = resolved;
  });
}
