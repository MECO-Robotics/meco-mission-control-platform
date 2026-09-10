import type { OnshapeReference } from "./onshapeTypes";
import type { OnshapeRuntimeState } from "./cadStoreTypes";
import type { OnshapeDocumentRef, OnshapeSyncJob } from "./onshapeTypes";
import { clone, nextId, nowIso } from "./cadStoreUtils";

export function buildCadRequestStore(state: OnshapeRuntimeState) {
  return {
    createImportRun(input: {
      documentRefId: string;
      syncLevel: import("./onshapeTypes").SyncLevel;
      requestedBy?: string | null;
      callsEstimated?: number | null;
    }) {
      const timestamp = nowIso();
      const run = {
        id: nextId("cad-import", state.importRuns.map((item) => item.id)),
        onshapeDocumentRefId: input.documentRefId,
        syncLevel: input.syncLevel,
        status: "running" as const,
        startedAt: timestamp,
        completedAt: null,
        requestedBy: input.requestedBy ?? null,
        callsEstimated: input.callsEstimated ?? null,
        callsUsed: 0,
        stoppedReason: null,
        errorMessage: null,
        rawSummaryJson: {},
        createdAt: timestamp,
      };
      state.importRuns.push(run);
      return clone(run);
    },
    updateImportRun(id: string, patch: Partial<Omit<import("./onshapeTypes").CadImportRun, "id" | "createdAt">>) {
      const run = state.importRuns.find((item) => item.id === id);
      if (!run) {
        return null;
      }
      Object.assign(run, patch);
      return clone(run);
    },
    findImportRun(id: string) {
      const found = state.importRuns.find((item) => item.id === id);
      return found ? clone(found) : null;
    },
    listImportRuns(documentRefId?: string) {
      return clone(
        state.importRuns
          .filter((run) => !documentRefId || run.onshapeDocumentRefId === documentRefId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    createSyncJob(input: {
      importRunId: string;
      documentRef: OnshapeDocumentRef;
      actor?: string | null;
    }): OnshapeSyncJob {
      const timestamp = nowIso();
      const sourceReferenceJson: Record<string, unknown> = {
        documentId: input.documentRef.documentId,
        workspaceId: input.documentRef.workspaceId ?? null,
        versionId: input.documentRef.versionId ?? null,
        microversionId: input.documentRef.microversionId ?? null,
        elementId: input.documentRef.elementId ?? null,
        referenceType: input.documentRef.referenceType,
        originalUrl: input.documentRef.originalUrl,
        label: input.documentRef.label,
      };
      const job: OnshapeSyncJob = {
        id: nextId("onshape-sync-job", state.syncJobs.map((item) => item.id)),
        importRunId: input.importRunId,
        onshapeDocumentRefId: input.documentRef.id,
        status: "running",
        startedAt: timestamp,
        completedAt: null,
        actor: input.actor ?? null,
        sourceReferenceJson,
        summaryJson: {},
        errorMessage: null,
        createdAt: timestamp,
      };
      state.syncJobs.push(job);
      return clone(job);
    },
    updateSyncJob(id: string, patch: Partial<Omit<OnshapeSyncJob, "id" | "importRunId" | "onshapeDocumentRefId" | "sourceReferenceJson" | "createdAt">>) {
      const job = state.syncJobs.find((item) => item.id === id);
      if (!job) {
        return null;
      }
      Object.assign(job, patch);
      return clone(job);
    },
    findSyncJob(id: string) {
      const found = state.syncJobs.find((item) => item.id === id);
      return found ? clone(found) : null;
    },
    findSyncJobByImportRunId(importRunId: string) {
      const found = state.syncJobs.find((item) => item.importRunId === importRunId);
      return found ? clone(found) : null;
    },
    listSyncJobs(filter?: { documentRefId?: string; status?: OnshapeSyncJob["status"] }) {
      return clone(
        state.syncJobs
          .filter((job) =>
            (!filter?.documentRefId || job.onshapeDocumentRefId === filter.documentRefId) &&
            (!filter?.status || job.status === filter.status))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    appendRequestLog(input: Omit<import("./onshapeTypes").OnshapeApiRequestLog, "id">) {
      const log = {
        ...input,
        id: nextId("onshape-request", state.requestLogs.map((item) => item.id)),
      };
      state.requestLogs.push(log);
      return clone(log);
    },
    listRequestLogs(importRunId?: string) {
      return clone(state.requestLogs.filter((log) => !importRunId || log.importRunId === importRunId));
    },
    findCacheEntry(cacheKey: string) {
      const found = state.cacheEntries.find((entry) => entry.cacheKey === cacheKey);
      return found ? clone(found) : null;
    },
    listCacheEntries() {
      return clone(state.cacheEntries);
    },
    writeCacheEntry(input: Omit<import("./onshapeTypes").OnshapeApiCacheEntry, "id" | "createdAt" | "documentId" | "workspaceId" | "versionId" | "microversionId" | "elementId"> & {
      reference: Partial<OnshapeReference>;
    }) {
      const existing = state.cacheEntries.find((entry) => entry.cacheKey === input.cacheKey);
      const nextEntry = {
        id: existing?.id ?? nextId("onshape-cache", state.cacheEntries.map((entry) => entry.id)),
        cacheKey: input.cacheKey,
        endpoint: input.endpoint,
        method: input.method,
        requestHash: input.requestHash,
        responseJson: clone(input.responseJson),
        responseHeadersJson: clone(input.responseHeadersJson),
        documentId: input.reference.documentId ?? null,
        workspaceId: input.reference.workspaceId ?? null,
        versionId: input.reference.versionId ?? null,
        microversionId: input.reference.microversionId ?? null,
        elementId: input.reference.elementId ?? null,
        immutable: input.immutable,
        createdAt: nowIso(),
        expiresAt: input.expiresAt,
      };
      if (existing) {
        Object.assign(existing, nextEntry);
      } else {
        state.cacheEntries.push(nextEntry);
      }
      return clone(nextEntry);
    },
    getBudget() {
      return clone(state.budget);
    },
    recordApiCall(count: number, rateLimitRemaining?: number | null) {
      state.budget.callsUsedToday += count;
      state.budget.callsUsedThisMonth += count;
      state.budget.callsUsedThisYear += count;
      state.budget.lastRateLimitRemaining = rateLimitRemaining ?? state.budget.lastRateLimitRemaining;
      state.budget.updatedAt = nowIso();
      return clone(state.budget);
    },
  };
}
