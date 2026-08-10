import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  AuthError,
  buildDevelopmentSessionUser,
  getPublicAuthConfig,
  isLegacyMobileJwtIssuanceAllowed,
  isAuthEnabled,
  requestEmailSignInCode,
  requireSession,
  signSessionToken,
  verifyEmailSignInCode,
  verifyGoogleCredential,
} from "../auth/authService";
import {
  authConfig as runtimeAuthConfig,
  env,
} from "../config/env";
import {
  getUserPreferences,
  updateUserPreferences,
} from "../data/userPreferencesStore";
import {
  devBypassSchema,
  emailSignInRequestSchema,
  emailSignInVerifySchema,
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

  app.post<{ Body: { credential?: string } }>("/api/auth/google", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) {
      return;
    }

    const credential = request.body?.credential;
    if (!credential) {
      return reply.code(400).send({
        message: "Google did not provide a credential to exchange.",
      });
    }

    try {
      const user = await verifyGoogleCredential(credential);
      const token = signSessionToken(user);

      return { token, user };
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }

      request.log.error({ err: error }, "Google authentication failed");
      return reply.code(500).send({
        message: "Google authentication failed unexpectedly.",
      });
    }
  });

  if (env.NODE_ENV !== "production") {
    app.post<{ Body: unknown }>("/api/auth/dev-bypass", async (request, reply) => {
      if (!allowAuthRouteRequest(request, reply)) {
        return;
      }

      if (!runtimeAuthConfig.enabled) {
        return reply.code(503).send({
          message: "Development sign-in is not available until auth is configured.",
        });
      }

      const parsed = devBypassSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Development sign-in payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const user = buildDevelopmentSessionUser(parsed.data.role);
      const token = signSessionToken(user);

      return { token, user };
    });
  }

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

  app.post<{ Body: unknown }>("/api/auth/email/verify", async (request, reply) => {
    if (!allowAuthEmailRouteRequest(request, reply)) {
      return;
    }

    const parsed = emailSignInVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Email verification payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (parsed.data.deviceId && !isLegacyMobileJwtIssuanceAllowed()) {
      return reply.code(426).send({
        error: "mobile_client_upgrade_required",
        message: "Update MECO Mission Control Mobile to continue signing in.",
        code: "mobile_client_upgrade_required",
      });
    }

    try {
      const user = verifyEmailSignInCode(parsed.data.email, parsed.data.code);
      const token = signSessionToken(user, { deviceId: parsed.data.deviceId });

      return { token, user };
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }

      request.log.error({ err: error }, "Email authentication failed");
      return reply.code(500).send({
        message: "Email authentication failed unexpectedly.",
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

    return getUserPreferences(identity.userKey);
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

    return updateUserPreferences(identity.userKey, parsed.data);
  });
}
