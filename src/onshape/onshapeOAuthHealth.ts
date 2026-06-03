import { onshapeConfig } from "../config/env";
import type { getOnshapeRuntimeStore } from "./cadStore";
import {
  isOnshapeOAuthClientConfigured,
  isOnshapeOAuthRefreshConfigured,
} from "./onshapeOAuth";
import type { OnshapeOAuthConnectionHealth, OnshapeOAuthTokenSet } from "./onshapeTypes";

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
