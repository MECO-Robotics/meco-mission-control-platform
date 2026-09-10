import { emailSignInVerifySchema } from "./emailAuthSchemas";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  AuthError,
  buildDevelopmentSessionUser,
  verifyEmailSignInCode,
  verifyGoogleCredential,
  type SessionUser,
} from "../auth/authService";
import {
  WEB_SESSION_COOKIE_NAME,
  type WebSessionService,
} from "../auth/webSessionService";
import { webSessionCookieOptions } from "../auth/webSessionPlugin";
import { authConfig, env } from "../config/env";
import {
  devBypassSchema,
} from "./routeSchemas";

type RequestGuard = (request: FastifyRequest, reply: FastifyReply) => boolean;

interface WebAuthRoutesOptions {
  allowAuthEmailRouteRequest: RequestGuard;
  allowAuthRouteRequest: RequestGuard;
  webSessionService: WebSessionService;
}

export async function establishWebSession(
  reply: FastifyReply,
  service: WebSessionService,
  user: SessionUser,
) {
  const session = await service.create(user);
  reply.setCookie(
    WEB_SESSION_COOKIE_NAME,
    session.sessionToken,
    webSessionCookieOptions(session.expiresAt),
  );
  return {
    user,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt.toISOString(),
  };
}

function sendAuthFailure(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({ message: error.message });
  }

  request.log.error({ err: error }, "Web authentication failed");
  return reply.code(500).send({ message: "Web authentication failed unexpectedly." });
}

export function registerWebAuthRoutes(app: FastifyInstance, options: WebAuthRoutesOptions) {
  const { allowAuthEmailRouteRequest, allowAuthRouteRequest, webSessionService } = options;

  app.post<{ Body: { credential?: string } }>("/api/auth/web/google", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    if (!request.body?.credential) {
      return reply.code(400).send({ message: "Google did not provide a credential to exchange." });
    }

    try {
      return await establishWebSession(
        reply,
        webSessionService,
        await verifyGoogleCredential(request.body.credential, app.userPreferences),
      );
    } catch (error) {
      return sendAuthFailure(request, reply, error);
    }
  });

  app.post<{ Body: unknown }>("/api/auth/web/email/verify", async (request, reply) => {
    if (!allowAuthEmailRouteRequest(request, reply)) return;
    const parsed = emailSignInVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Email verification payload is invalid.", issues: parsed.error.flatten() });
    }

    try {
      const user = verifyEmailSignInCode(parsed.data.email, parsed.data.code, app.userPreferences);
      return await establishWebSession(reply, webSessionService, user);
    } catch (error) {
      return sendAuthFailure(request, reply, error);
    }
  });

  if (env.NODE_ENV !== "production") {
    app.post<{ Body: unknown }>("/api/auth/web/dev-bypass", async (request, reply) => {
      if (!allowAuthRouteRequest(request, reply)) return;
      if (!authConfig.enabled) {
        return reply.code(503).send({ message: "Development sign-in is not available until auth is configured." });
      }
      const parsed = devBypassSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ message: "Development sign-in payload is invalid.", issues: parsed.error.flatten() });
      }

      try {
        return await establishWebSession(
          reply,
          webSessionService,
          buildDevelopmentSessionUser(parsed.data.role, app.userPreferences),
        );
      } catch (error) {
        return sendAuthFailure(request, reply, error);
      }
    });
  }

  app.get("/api/auth/web/session", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    if (!request.webSession) {
      return reply.code(401).send({ message: "Sign in to continue." });
    }
    return {
      user: request.webSession.user,
      csrfToken: request.webSession.csrfToken,
      expiresAt: request.webSession.expiresAt.toISOString(),
    };
  });

  app.post("/api/auth/web/logout", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) return;
    if (!request.webSession) {
      reply.clearCookie(WEB_SESSION_COOKIE_NAME, webSessionCookieOptions());
      return reply.code(401).send({ message: "The web session is no longer active." });
    }

    await webSessionService.revoke(request.webSession);
    reply.clearCookie(WEB_SESSION_COOKIE_NAME, webSessionCookieOptions());
    return { ok: true };
  });
}
