import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getOnshapeRuntimeStore } from "./cadStore";
import { onshapeListQuerySchema } from "./onshapeRouteSchemas";

type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;

function readListQuery(query: unknown) {
  const parsed = onshapeListQuerySchema.safeParse(query ?? {});
  return parsed.success ? parsed.data : {};
}

function readRunSnapshotId(item: { rawSummaryJson: Record<string, unknown> }) {
  const snapshotId = item.rawSummaryJson.snapshotId;
  return typeof snapshotId === "string" ? snapshotId : null;
}

function buildSyncJobIssues(store: ReturnType<typeof getOnshapeRuntimeStore>, syncJobId: string) {
  const job = store.findSyncJob(syncJobId);
  if (!job) {
    return null;
  }

  const warnings = store.listWarnings({ importRunId: job.importRunId }).map((warning) => ({
    ...warning,
    syncJobId: job.id,
    type: "warning" as const,
  }));
  const error = job.errorMessage
    ? [{
        id: `${job.id}-error`,
        syncJobId: job.id,
        importRunId: job.importRunId,
        snapshotId: null,
        severity: "error" as const,
        type: "error" as const,
        code: "onshape_sync_failed",
        title: "Onshape sync failed",
        message: job.errorMessage,
        cadAssemblyNodeId: null,
        cadPartDefinitionId: null,
        cadPartInstanceId: null,
        metadataJson: {},
        createdAt: job.completedAt ?? job.startedAt,
      }]
    : [];
  return [...error, ...warnings];
}

export function registerOnshapeSyncJobRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.get("/api/onshape/sync-jobs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const query = readListQuery(request.query);
    return {
      items: getOnshapeRuntimeStore().listSyncJobs({
        documentRefId: query.documentRefId,
        status: query.status,
      }),
    };
  });

  app.get<{ Params: { syncJobId: string } }>("/api/onshape/sync-jobs/:syncJobId", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const store = getOnshapeRuntimeStore();
    const item = store.findSyncJob(request.params.syncJobId);
    if (!item) {
      return reply.code(404).send({ message: "Onshape sync job not found." });
    }

    const importRun = store.findImportRun(item.importRunId);
    const runSnapshotId = importRun ? readRunSnapshotId(importRun) : null;
    return {
      item,
      importRun,
      issues: buildSyncJobIssues(store, item.id) ?? [],
      snapshots: store.listSnapshots(item.onshapeDocumentRefId).filter(
        (snapshot) => snapshot.importRunId === item.importRunId || snapshot.id === runSnapshotId,
      ),
    };
  });

  app.get<{ Params: { syncJobId: string } }>(
    "/api/onshape/sync-jobs/:syncJobId/issues",
    async (request, reply) => {
      if (!requireApiSession(request, reply)) {
        return;
      }

      const query = readListQuery(request.query);
      const issues = buildSyncJobIssues(getOnshapeRuntimeStore(), request.params.syncJobId);
      if (!issues) {
        return reply.code(404).send({ message: "Onshape sync job not found." });
      }

      return {
        items: issues.filter((issue) => !query.severity || issue.severity === query.severity),
      };
    },
  );

  app.get("/api/onshape/warnings", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const query = readListQuery(request.query);
    const store = getOnshapeRuntimeStore();
    const syncJob = query.syncJobId ? store.findSyncJob(query.syncJobId) : null;
    if (query.syncJobId && !syncJob) {
      return reply.code(404).send({ message: "Onshape sync job not found." });
    }
    const importRunId = syncJob?.importRunId ?? query.importRunId;
    const items = store
      .listWarnings({ importRunId, snapshotId: query.snapshotId })
      .filter((warning) => !query.severity || warning.severity === query.severity);
    return { items };
  });
}
