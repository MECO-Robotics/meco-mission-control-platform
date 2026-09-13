import { buildCadGraphStore } from "./cadStoreGraph";
import { buildCadOAuthStore } from "./cadStoreOAuth";
import { buildCadReferenceStore } from "./cadStoreRefs";
import { buildCadRequestStore } from "./cadStoreRequests";
import type { OnshapeRuntimeStore } from "./cadStoreTypes";
import { buildInitialState } from "./cadStoreUtils";

export type { OnshapeRuntimeStore } from "./cadStoreTypes";

export function createOnshapeRuntimeStore(): OnshapeRuntimeStore {
  const state = buildInitialState();
  const oauthStore = buildCadOAuthStore(state);
  return {
    ...buildCadReferenceStore(state),
    ...buildCadRequestStore(state),
    ...buildCadGraphStore(state),
    ...oauthStore,
    reset() {
      oauthStore.setOAuthTokenSet(null);
      Object.assign(state, buildInitialState());
    },
  };
}

const globalStore = createOnshapeRuntimeStore();

export function getOnshapeRuntimeStore() {
  return globalStore;
}

export function resetOnshapeRuntimeStore() {
  globalStore.reset();
}
