import { randomUUID } from "node:crypto";

import type { OnshapeRuntimeState } from "./cadStoreTypes";
import { clone, nowIso } from "./cadStoreUtils";
import type { OnshapeOAuthTokenSet } from "./onshapeTypes";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates(state: OnshapeRuntimeState) {
  const cutoff = Date.now() - OAUTH_STATE_TTL_MS;
  state.oauthStates = state.oauthStates.filter((item) => Date.parse(item.createdAt) >= cutoff);
}

export function buildCadOAuthStore(state: OnshapeRuntimeState) {
  let generation = 0;
  let refreshInFlight: Promise<OnshapeOAuthTokenSet> | null = null;
  return {
    refreshOAuthTokenSet(refresh: () => Promise<OnshapeOAuthTokenSet>) {
      if (refreshInFlight) return refreshInFlight;
      const startedGeneration = generation;
      const pending = Promise.resolve().then(refresh).then((tokenSet) => {
        if (generation !== startedGeneration) throw new Error("Onshape credentials changed while refreshing.");
        state.oauthTokenSet = clone(tokenSet);
        generation += 1;
        return clone(tokenSet);
      }).finally(() => {
        if (refreshInFlight === pending) refreshInFlight = null;
      });
      refreshInFlight = pending;
      return pending;
    },
    createOAuthState(input: { sessionKey: string }) {
      pruneExpiredStates(state);
      const item = { state: randomUUID(), createdAt: nowIso(), sessionKey: input.sessionKey };
      state.oauthStates.push(item);
      return clone(item);
    },
    consumeOAuthState(oauthState: string, input: { sessionKey: string }) {
      pruneExpiredStates(state);
      const index = state.oauthStates.findIndex(
        (item) => item.state === oauthState && item.sessionKey === input.sessionKey,
      );
      if (index < 0) {
        return false;
      }
      state.oauthStates.splice(index, 1);
      return true;
    },
    getOAuthTokenSet() {
      return state.oauthTokenSet ? clone(state.oauthTokenSet) : null;
    },
    setOAuthTokenSet(tokenSet: OnshapeOAuthTokenSet | null) {
      generation += 1;
      refreshInFlight = null;
      state.oauthTokenSet = tokenSet ? clone(tokenSet) : null;
      return state.oauthTokenSet ? clone(state.oauthTokenSet) : null;
    },
  };
}
