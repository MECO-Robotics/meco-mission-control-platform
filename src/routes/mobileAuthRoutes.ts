import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  AuthError,
  refreshSessionUser,
  verifyEmailSignInCode,
} from "../auth/authService";
import {
  MobileSessionError,
  type MobileSessionService,
} from "../auth/mobileSessionService";
import {
  mobileEmailVerifySchema,
  mobileLogoutSchema,
  mobileRefreshSchema,
  mobileSessionParamsSchema,
} from "./mobileAuthSchemas";

type RequestGuard = (request: FastifyRequest, reply: FastifyReply) => boolean;

interface MobileAuthRoutesOptions {
  allowAuthEmailRouteRequest: RequestGuard;
  allowAuthRouteRequest: RequestGuard;
  service: MobileSessionService;
}

function requireMobileSession(request: FastifyRequest, reply: FastifyReply) {
  if (request.mobileSession) return request.mobileSession;
  reply.code(401).send({ message: "A valid mobile session is required." });
  return null;
}

function invalidPayload(reply: FastifyReply, message: string, issues: unknown) {
  return reply.code(400).send({ message, issues });
}

function sendAuthError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  operation: string,
) {
  if (error instanceof AuthError || error instanceof MobileSessionError) {
    return reply.code(error.statusCode).send({
      message: error.message,
      ...(error instanceof MobileSessionError ? { code: error.code } : null),
    });
  }
  request.log.error({ err: error }, `Mobile ${operation} failed`);
  return reply.code(500).send({ message: `Mobile ${operation} failed unexpectedly.` });
}

export function registerMobileAuthRoutes(
  app: FastifyInstance,
  options: MobileAuthRoutesOptions,
) {
  const { allowAuthEmailRouteRequest, allowAuthRouteRequest, service } = options;

  app.post<{ Body: unknown }>("/api/auth/mobile/email/verify", async (request, reply) => {
    if (!allowAuthEmailRouteRequest(request, reply)) return;
    const parsed = mobileEmailVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidPayload(
        reply,
        "Mobile email verification payload is invalid.",
        parsed.error.flatten(),
      );
    }
    try {
      const user = verifyEmailSignInCode(parsed.data.email, parsed.data.code);
      return await service.create(
        user,
        parsed.data.deviceId,
        parsed.data.deviceName ?? null,
      );
    } catch (error) {
      return sendAuthError(request, reply, error, "email authentication");
    }
  });

  app.post<{ Body: unknown }>("/api/auth/mobile/refresh", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    const parsed = mobileRefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidPayload(
        reply,
        "Mobile refresh payload is invalid.",
        parsed.error.flatten(),
      );
    }
    try {
      const response = await service.refresh(parsed.data.refreshToken);
      try {
        response.user = refreshSessionUser(response.user);
      } catch (error) {
        await service.revokeSession(response.session.id);
        throw error;
      }
      return response;
    } catch (error) {
      return sendAuthError(request, reply, error, "session refresh");
    }
  });

  app.post<{ Body: unknown }>("/api/auth/mobile/logout", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    const parsed = mobileLogoutSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return invalidPayload(
        reply,
        "Mobile logout payload is invalid.",
        parsed.error.flatten(),
      );
    }
    if (request.mobileSession) {
      await service.revokeSession(request.mobileSession.session.id);
    } else if (parsed.data.refreshToken) {
      await service.revokeRefresh(parsed.data.refreshToken);
    }
    return { ok: true };
  });

  app.post("/api/auth/mobile/logout-all", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    const current = requireMobileSession(request, reply);
    if (!current) return;
    await service.revokeAll(current.user.accountId);
    return { ok: true };
  });

  app.get("/api/auth/mobile/sessions", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    const current = requireMobileSession(request, reply);
    if (!current) return;
    return {
      sessions: await service.list(current.user.accountId, current.session.id),
    };
  });

  app.delete<{ Params: unknown }>("/api/auth/mobile/sessions/:sessionId", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    const current = requireMobileSession(request, reply);
    if (!current) return;
    const parsed = mobileSessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return invalidPayload(
        reply,
        "Mobile session identifier is invalid.",
        parsed.error.flatten(),
      );
    }
    await service.revokeForAccount(parsed.data.sessionId, current.user.accountId);
    return { ok: true };
  });
}
