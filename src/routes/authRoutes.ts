import { emailSignInRequestSchema } from "./emailAuthSchemas";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  AuthError,
  getPublicAuthConfig,
  isAuthEnabled,
  requestEmailSignInCode,
  requireSession,
} from "../auth/authService";
import {
  userPreferencesPatchSchema,
} from "./routeSchemas";

type RequestGuard = (request: FastifyRequest, reply: FastifyReply) => boolean;

interface AuthRoutesOptions {
  allowApiRouteRequest: RequestGuard;
  allowAuthEmailRouteRequest: RequestGuard;
  allowAuthRouteRequest: RequestGuard;
}

function resolvePreferencesIdentity(request: FastifyRequest, reply: FastifyReply) {
  if (!isAuthEnabled()) {
    return {
      userKey: "local-development",
    };
  }

  const session = requireSession(request, reply);
  if (!session) {
    return null;
  }

  return {
    userKey: session.email,
  };
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions) {
  const { allowApiRouteRequest, allowAuthEmailRouteRequest, allowAuthRouteRequest } = options;

  app.get("/api/auth/config", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) {
      return;
    }

    return getPublicAuthConfig();
  });

  app.post<{ Body: unknown }>("/api/auth/email/start", async (request, reply) => {
    if (!allowAuthEmailRouteRequest(request, reply)) {
      return;
    }

    const parsed = emailSignInRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Email sign-in payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      return await requestEmailSignInCode(parsed.data.email);
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }

      request.log.error({ err: error }, "Email sign-in code request failed");
      return reply.code(500).send({
        message: "Email sign-in failed unexpectedly.",
      });
    }
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) {
      return;
    }

    if (!isAuthEnabled()) {
      return {
        enabled: false,
        user: null,
      };
    }

    const session = requireSession(request, reply);
    if (!session) {
      return;
    }

    return {
      enabled: true,
      user: session,
    };
  });

  app.get("/api/users/me/preferences", async (request, reply) => {
    if (!allowApiRouteRequest(request, reply)) {
      return;
    }

    const identity = resolvePreferencesIdentity(request, reply);
    if (!identity) {
      return;
    }

    return app.userPreferences.get(identity.userKey);
  });

  app.patch<{ Body: unknown }>("/api/users/me/preferences", async (request, reply) => {
    if (!allowApiRouteRequest(request, reply)) {
      return;
    }

    const identity = resolvePreferencesIdentity(request, reply);
    if (!identity) {
      return;
    }

    const parsed = userPreferencesPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "User preferences payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    return app.userPreferences.update(identity.userKey, parsed.data);
  });
}
