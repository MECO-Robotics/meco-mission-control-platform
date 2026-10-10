import { AsyncLocalStorage } from "node:async_hooks";
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

const runtimeContext = new AsyncLocalStorage<OnshapeRuntimeStore>();
let defaultStore: OnshapeRuntimeStore | undefined;

export function runWithOnshapeRuntimeStore<T>(store: OnshapeRuntimeStore, run: () => T): T {
  return runtimeContext.run(store, run);
}

export function getOnshapeRuntimeStore() {
  return runtimeContext.getStore() ?? (defaultStore ??= createOnshapeRuntimeStore());
}

export function resetOnshapeRuntimeStore() {
  getOnshapeRuntimeStore().reset();
}
