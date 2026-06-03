import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getSessionFromRequest, isAuthEnabled } from "../auth/authService";
import { onshapeConfig } from "../config/env";
import { getOnshapeRuntimeStore } from "./cadStore";
import {
  buildOnshapeOAuthAuthorizationUrl,
  exchangeOnshapeOAuthCode,
  isOnshapeOAuthClientConfigured,
  isOnshapeOAuthRefreshConfigured,
  refreshOnshapeOAuthToken,
} from "./onshapeOAuth";
import type { OnshapeOAuthConnectionHealth, OnshapeOAuthTokenSet } from "./onshapeTypes";

type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;

const ONSHAPE_OAUTH_SESSION_COOKIE = "meco_onshape_oauth_session";
const ONSHAPE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

function getOAuthConfig() {
  return {
    clientId: onshapeConfig.oauthClientId,
    clientSecret: onshapeConfig.oauthClientSecret,
    redirectUri: onshapeConfig.oauthRedirectUri,
    authorizationUrl: onshapeConfig.oauthAuthorizationUrl,
    tokenUrl: onshapeConfig.oauthTokenUrl,
    scopes: onshapeConfig.oauthScopes,
  };
}

function readCookieValue(request: FastifyRequest, name: string) {
  const header = request.headers.cookie;
  const cookieHeader = Array.isArray(header) ? header.join(";") : (header ?? "");
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function buildOAuthSessionCookie(sessionKey: string) {
  const secureAttribute = onshapeConfig.oauthRedirectUri?.startsWith("https://") ? "Secure" : "";
  return [
    `${ONSHAPE_OAUTH_SESSION_COOKIE}=${encodeURIComponent(sessionKey)}`,
    "Path=/api/onshape/oauth/callback",
    `Max-Age=${ONSHAPE_OAUTH_STATE_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    secureAttribute,
  ].filter(Boolean).join("; ");
}

function buildExpiredOAuthSessionCookie() {
  return `${ONSHAPE_OAUTH_SESSION_COOKIE}=; Path=/api/onshape/oauth/callback; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function resolveOAuthCallbackSessionKey(request: FastifyRequest, reply: FastifyReply) {
  const sessionKey = readCookieValue(request, ONSHAPE_OAUTH_SESSION_COOKIE);
  if (sessionKey) {
    return sessionKey;
  }

  reply.code(400).send({
    message: "Onshape OAuth session state is missing or expired. Start the connection again in the same browser session.",
  });
  return null;
}

function requireOnshapeOAuthCredentialPermission(request: FastifyRequest, reply: FastifyReply) {
  if (!isAuthEnabled()) {
    return true;
  }

  const session = getSessionFromRequest(request);
  if (session?.role === "lead" || session?.role === "mentor" || session?.role === "admin") {
    return true;
  }

  reply.code(403).send({
    message: "Onshape OAuth credential updates are restricted to leads, mentors, and admins.",
  });
  return false;
}

export function getOAuthStatus(store: ReturnType<typeof getOnshapeRuntimeStore>) {
  const health = getOAuthConnectionHealth(store);
  return {
    clientConfigured: health.clientConfigured,
    connected: health.connected,
    connectionState: health.connectionState,
    authorizationUrlAvailable: health.authorizationUrlAvailable,
    scopes: health.scopes,
    tokenExpiresAt: health.tokenExpiresAt,
    credentialSource: health.credentialSource,
  };
}

function readExpiryState(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) {
    return "connected";
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return "expired";
  }

  return expiresAtMs <= nowMs ? "expired" : "connected";
}

function buildTokenMetadata(tokenSet: OnshapeOAuthTokenSet | null) {
  const envConnected = Boolean(onshapeConfig.oauthAccessToken || onshapeConfig.oauthRefreshToken);
  if (tokenSet) {
    return {
      credentialSource: "runtime" as const,
      tokenExpiresAt: tokenSet.expiresAt,
      tokenReceivedAt: tokenSet.receivedAt,
      hasRefreshToken: Boolean(tokenSet.refreshToken),
      hasToken: true,
    };
  }

  return {
    credentialSource: envConnected ? "env" as const : "none" as const,
    tokenExpiresAt: onshapeConfig.oauthTokenExpiresAt ?? null,
    tokenReceivedAt: null,
    hasRefreshToken: Boolean(onshapeConfig.oauthRefreshToken),
    hasToken: envConnected,
  };
}

export function getOAuthConnectionHealth(
  store: ReturnType<typeof getOnshapeRuntimeStore>,
  nowMs = Date.now(),
): OnshapeOAuthConnectionHealth {
  const tokenSet = store.getOAuthTokenSet();
  const tokenMetadata = buildTokenMetadata(tokenSet);
  const clientConfigured = isOnshapeOAuthClientConfigured(getOAuthConfig());
  const refreshAvailable =
    tokenMetadata.hasRefreshToken && isOnshapeOAuthRefreshConfigured(getOAuthConfig());
  const connectionState = tokenMetadata.hasToken
    ? readExpiryState(tokenMetadata.tokenExpiresAt, nowMs)
    : "disconnected";

  return {
    clientConfigured,
    connected: connectionState === "connected",
    connectionState,
    authorizationUrlAvailable: clientConfigured,
    scopes: onshapeConfig.oauthScopes,
    tokenExpiresAt: tokenMetadata.tokenExpiresAt,
    tokenReceivedAt: tokenMetadata.tokenReceivedAt,
    credentialSource: tokenMetadata.credentialSource,
    hasRefreshToken: tokenMetadata.hasRefreshToken,
    refreshAvailable,
    reconnectAction: {
      type: "start_oauth",
      method: "POST",
      url: "/api/onshape/oauth/authorization-url",
      available: clientConfigured,
    },
  };
}

export function registerOnshapeOAuthRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.get("/api/onshape/oauth/health", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    return { item: getOAuthConnectionHealth(getOnshapeRuntimeStore()) };
  });

  app.post("/api/onshape/oauth/authorization-url", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    if (!requireOnshapeOAuthCredentialPermission(request, reply)) {
      return;
    }

    const config = getOAuthConfig();
    if (!isOnshapeOAuthClientConfigured(config)) {
      return reply.code(409).send({
        message: "Onshape OAuth client ID, client secret, and redirect URI are not configured.",
      });
    }

    const sessionKey = randomUUID();
    const { state } = getOnshapeRuntimeStore().createOAuthState({ sessionKey });
    reply.header("Set-Cookie", buildOAuthSessionCookie(sessionKey));
    return {
      authorizationUrl: buildOnshapeOAuthAuthorizationUrl({
        authorizationUrl: config.authorizationUrl,
        clientId: config.clientId!,
        redirectUri: config.redirectUri!,
        scopes: config.scopes,
        state,
      }).toString(),
      state,
    };
  });

  app.get("/api/onshape/oauth/callback", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const code = typeof query.code === "string" ? query.code : null;
    const state = typeof query.state === "string" ? query.state : null;
    if (!code || !state) {
      return reply
        .header("Set-Cookie", buildExpiredOAuthSessionCookie())
        .code(400)
        .send({ message: "Onshape OAuth callback requires code and state." });
    }

    const sessionKey = resolveOAuthCallbackSessionKey(request, reply);
    if (!sessionKey) {
      return;
    }

    const store = getOnshapeRuntimeStore();
    if (!store.consumeOAuthState(state, { sessionKey })) {
      return reply
        .header("Set-Cookie", buildExpiredOAuthSessionCookie())
        .code(400)
        .send({ message: "Onshape OAuth state is invalid, expired, or belongs to a different browser session." });
    }

    const tokenSet = await exchangeOnshapeOAuthCode({ config: getOAuthConfig(), code });
    store.setOAuthTokenSet(tokenSet);
    return reply
      .header("Set-Cookie", buildExpiredOAuthSessionCookie())
      .type("text/html")
      .send(
        "<!doctype html><title>Onshape connected</title><p>Onshape OAuth connection complete. You can close this tab and return to Mission Control.</p>",
      );
  });

  app.post("/api/onshape/oauth/refresh", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    if (!requireOnshapeOAuthCredentialPermission(request, reply)) {
      return;
    }

    const config = getOAuthConfig();
    if (!isOnshapeOAuthRefreshConfigured(config)) {
      return reply.code(409).send({
        message: "Onshape OAuth client ID and client secret are required to refresh tokens.",
      });
    }

    const store = getOnshapeRuntimeStore();
    const refreshToken = store.getOAuthTokenSet()?.refreshToken ?? onshapeConfig.oauthRefreshToken;
    if (!refreshToken) {
      return reply.code(409).send({ message: "No Onshape OAuth refresh token is available." });
    }

    const tokenSet = await refreshOnshapeOAuthToken({ config, refreshToken });
    store.setOAuthTokenSet(tokenSet);
    return { item: { connected: true, tokenExpiresAt: tokenSet.expiresAt } };
  });
}
