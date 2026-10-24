import type { FastifyInstance, FastifyReply } from "fastify";

import { buildCadHierarchyReview } from "../cadHierarchyReviewService";
import { readGroupInstancesQuery, readImportRunListQuery, readSnapshotListQuery } from "./cadRouteQueries";
import type { RequireApiSession } from "./cadRouteTypes";
import { registerCadSnapshotActionRoutes } from "./cadSnapshotActionRoutes";
import { buildTree, groupedSnapshotMappings, snapshotMappings } from "./cadSnapshotViewService";

export function registerCadSnapshotRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.get<{ Querystring: { projectId?: string; seasonId?: string } }>("/api/cad/optimized-preview", async (request, reply) => {
    if (!requireApiSession(request, reply)) return;
    if (!app.cadStore.findLatestOptimizedPreview) {
      return reply.code(503).send({ message: "CAD file storage is unavailable." });
    }
    const file = await app.cadStore.findLatestOptimizedPreview({
      projectId: request.query.projectId || undefined,
      seasonId: request.query.seasonId || undefined,
    });
    if (!file) return reply.code(404).send({ message: "No optimized CAD preview is available for this project." });
    return reply
      .header("Content-Type", file.optimizedContentType)
      .header("Content-Length", file.optimizedSizeBytes)
      .header("Cache-Control", "private, no-store")
      .header("X-CAD-Source-Name", encodeURIComponent(file.originalFilename))
      .send(Buffer.from(file.optimizedContents));
  });

  app.get<{ Params: { assetId: string } }>("/api/cad/assets/:assetId/source", async (request, reply) => {
    if (!requireApiSession(request, reply)) return;
    if (!app.cadStore.findUploadedFile) {
      return reply.code(503).send({ message: "CAD file storage is unavailable." });
    }
    const file = await app.cadStore.findUploadedFile(request.params.assetId);
    if (!file) return reply.code(404).send({ message: "The uploaded CAD source was not found." });
    const filename = file.originalFilename.replace(/[\r\n"\\]/g, "_");
    return reply
      .header("Content-Type", file.originalContentType)
      .header("Content-Length", file.originalSizeBytes)
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("Cache-Control", "private, no-store")
      .send(Buffer.from(file.originalContents));
  });

  app.get("/api/cad/import-runs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    try {
      return { items: await app.cadStore.listImportRuns(readImportRunListQuery(request.query)) };
    } catch (error) {
      return handleCadQueryError(error, reply);
    }
  });

  app.get<{ Params: { importRunId: string } }>("/api/cad/import-runs/:importRunId", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = app.cadStore;
    const item = await store.findImportRun(request.params.importRunId);
    if (!item) {
      return reply.code(404).send({ message: "CAD import run was not found." });
    }
    const snapshot = (await store.listSnapshots()).find((candidate) => candidate.importRunId === item.id) ?? null;
    return { item, snapshot, warnings: await store.listWarnings({ importRunId: item.id }) };
  });

  app.get("/api/cad/snapshots", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    try {
      return { items: await app.cadStore.listSnapshots(readSnapshotListQuery(request.query)) };
    } catch (error) {
      return handleCadQueryError(error, reply);
    }
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = app.cadStore;
    const item = await store.findSnapshot(request.params.snapshotId);
    if (!item) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    const importRun = await store.findImportRun(item.importRunId);
    const rawSummaryJson = importRun?.rawSummaryJson ?? {};
    return {
      item,
      summary: {
        assemblyCount: (await store.listAssemblyNodes(item.id)).length,
        partDefinitionCount: (await store.listPartDefinitions(item.id)).length,
        partInstanceCount: (await store.listPartInstances(item.id)).length,
        mappingCount: (await store.listSnapshotMappings(item.id)).length,
        warningCount: (await store.listWarnings({ snapshotId: item.id })).length,
        originalFilename: importRun?.originalFilename ?? null,
        importRunCreatedAt: importRun?.createdAt ?? null,
        configuredParserMode: rawSummaryJson.configuredParserMode ?? rawSummaryJson.parserMode ?? null,
        actualParserVersion: rawSummaryJson.actualParserVersion ?? rawSummaryJson.parserVersion ?? importRun?.parserVersion ?? null,
        parserUsedPlaceholder: rawSummaryJson.parserUsedPlaceholder === true,
        ...rawSummaryJson,
        rawStats: rawSummaryJson,
      },
    };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/tree", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = app.cadStore;
    if (!(await store.findSnapshot(request.params.snapshotId))) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return buildTree(store, request.params.snapshotId, readGroupInstancesQuery(request.query));
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/mappings", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = app.cadStore;
    if (!(await store.findSnapshot(request.params.snapshotId))) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return {
      items: readGroupInstancesQuery(request.query)
        ? await groupedSnapshotMappings(store, request.params.snapshotId)
        : await snapshotMappings(store, request.params.snapshotId),
    };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/hierarchy-review", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const review = await buildCadHierarchyReview({ store: app.cadStore, snapshotId: request.params.snapshotId });
    return review ?? reply.code(404).send({ message: "CAD snapshot was not found." });
  });

  registerCadSnapshotActionRoutes(app, requireApiSession);
}

function handleCadQueryError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error && "statusCode" in error) {
    const statusCode = (error as Error & { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") {
      return reply.code(statusCode).send({ message: error.message });
    }
  }
  throw error;
}
