import type {
  CadAssemblyNode,
  CadImportRun,
  CadImportWarning,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  OnshapeApiBudget,
  OnshapeApiCacheEntry,
  OnshapeApiRequestLog,
  OnshapeDocumentRef,
  OnshapeOAuthTokenSet,
  OnshapeReference,
  OnshapeSyncJob,
  OnshapeUrlParseResult,
  SyncLevel,
} from "./onshapeTypes";

export interface OnshapeRuntimeState {
  documentRefs: OnshapeDocumentRef[];
  importRuns: CadImportRun[];
  syncJobs: OnshapeSyncJob[];
  requestLogs: OnshapeApiRequestLog[];
  cacheEntries: OnshapeApiCacheEntry[];
  snapshots: CadSnapshot[];
  assemblyNodes: CadAssemblyNode[];
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
  warnings: CadImportWarning[];
  budget: OnshapeApiBudget;
  oauthTokenSet: OnshapeOAuthTokenSet | null;
  oauthStates: Array<{ state: string; createdAt: string; sessionKey: string }>;
}

export interface OnshapeRuntimeStore {
  createDocumentRef(input: {
    label: string;
    parsed: OnshapeUrlParseResult;
    originalUrl?: string;
    createdBy?: string | null;
    projectId?: string | null;
    seasonId?: string | null;
    subsystemId?: string | null;
    mechanismId?: string | null;
  }): OnshapeDocumentRef;
  listDocumentRefs(): OnshapeDocumentRef[];
  findDocumentRef(id: string): OnshapeDocumentRef | null;
  createImportRun(input: {
    documentRefId: string;
    syncLevel: SyncLevel;
    requestedBy?: string | null;
    callsEstimated?: number | null;
  }): CadImportRun;
  updateImportRun(id: string, patch: Partial<Omit<CadImportRun, "id" | "createdAt">>): CadImportRun | null;
  findImportRun(id: string): CadImportRun | null;
  listImportRuns(documentRefId?: string): CadImportRun[];
  createSyncJob(input: {
    importRunId: string;
    documentRef: OnshapeDocumentRef;
    actor?: string | null;
  }): OnshapeSyncJob;
  updateSyncJob(id: string, patch: Partial<Omit<OnshapeSyncJob, "id" | "importRunId" | "onshapeDocumentRefId" | "sourceReferenceJson" | "createdAt">>): OnshapeSyncJob | null;
  findSyncJob(id: string): OnshapeSyncJob | null;
  findSyncJobByImportRunId(importRunId: string): OnshapeSyncJob | null;
  listSyncJobs(filter?: { documentRefId?: string; status?: OnshapeSyncJob["status"] }): OnshapeSyncJob[];
  appendRequestLog(input: Omit<OnshapeApiRequestLog, "id">): OnshapeApiRequestLog;
  listRequestLogs(importRunId?: string): OnshapeApiRequestLog[];
  findCacheEntry(cacheKey: string): OnshapeApiCacheEntry | null;
  listCacheEntries(): OnshapeApiCacheEntry[];
  writeCacheEntry(input: Omit<OnshapeApiCacheEntry, "id" | "createdAt" | "documentId" | "workspaceId" | "versionId" | "microversionId" | "elementId"> & {
    reference: Partial<OnshapeReference>;
  }): OnshapeApiCacheEntry;
  upsertSnapshot(input: {
    documentRef: OnshapeDocumentRef;
    importRunId: string;
    label: string;
    createdBy?: string | null;
    source?: CadSnapshot["source"];
    notes?: string | null;
  }): CadSnapshot;
  findSnapshot(id: string): CadSnapshot | null;
  listSnapshots(documentRefId?: string): CadSnapshot[];
  upsertAssemblyNodes(snapshotId: string, nodes: NormalizedCadAssemblyNode[]): Map<string, CadAssemblyNode>;
  upsertPartDefinitions(snapshotId: string, parts: NormalizedCadPartDefinition[]): Map<string, CadPartDefinition>;
  upsertPartInstances(
    snapshotId: string,
    parts: NormalizedCadPartInstance[],
    partDefinitionsBySourceId: Map<string, CadPartDefinition>,
    assemblyNodesBySourceId: Map<string, CadAssemblyNode>,
  ): CadPartInstance[];
  listAssemblyNodes(snapshotId?: string): CadAssemblyNode[];
  listPartDefinitions(snapshotId?: string): CadPartDefinition[];
  listPartInstances(snapshotId?: string): CadPartInstance[];
  appendWarning(input: Omit<CadImportWarning, "id" | "createdAt">): CadImportWarning;
  listWarnings(filter?: { importRunId?: string; snapshotId?: string }): CadImportWarning[];
  getBudget(): OnshapeApiBudget;
  recordApiCall(count: number, rateLimitRemaining?: number | null): OnshapeApiBudget;
  createOAuthState(input: { sessionKey: string }): { state: string; createdAt: string; sessionKey: string };
  consumeOAuthState(state: string, input: { sessionKey: string }): boolean;
  getOAuthTokenSet(): OnshapeOAuthTokenSet | null;
  refreshOAuthTokenSet(refresh: () => Promise<OnshapeOAuthTokenSet>): Promise<OnshapeOAuthTokenSet>;
  setOAuthTokenSet(tokenSet: OnshapeOAuthTokenSet | null): OnshapeOAuthTokenSet | null;
  reset(): void;
}
