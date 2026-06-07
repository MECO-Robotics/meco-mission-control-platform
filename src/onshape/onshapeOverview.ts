import { onshapeConfig } from "../config/env";
import { getOnshapeRuntimeStore } from "./cadStore";
import { getOAuthStatus } from "./onshapeOAuthHealth";

export function getOnshapeOverview() {
  const store = getOnshapeRuntimeStore();
  const snapshots = store.listSnapshots();
  const latestSnapshot = snapshots[0] ?? null;
  return {
    connection: {
      authMode: "oauth",
      baseUrl: onshapeConfig.baseUrl,
      configured: onshapeConfig.enabled,
      credentialReference: onshapeConfig.credentialReference,
      oauth: getOAuthStatus(store),
      lastError: null,
    },
    documentRefs: store.listDocumentRefs(),
    importRuns: store.listImportRuns(),
    syncJobs: store.listSyncJobs(),
    snapshots,
    latestSnapshot,
    assemblyNodes: latestSnapshot ? store.listAssemblyNodes(latestSnapshot.id) : [],
    partDefinitions: latestSnapshot ? store.listPartDefinitions(latestSnapshot.id) : [],
    partInstances: latestSnapshot ? store.listPartInstances(latestSnapshot.id) : [],
    warnings: store.listWarnings(),
    budget: store.getBudget(),
  };
}
