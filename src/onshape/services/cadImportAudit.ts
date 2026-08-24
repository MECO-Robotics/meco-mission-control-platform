import { recordAuditAction } from "../../data/store";
import type { OnshapeRuntimeStore } from "../cadStore";
import type { CadGraphImportResult, OnshapeDocumentRef } from "../onshapeTypes";

function buildChangedFields(result: CadGraphImportResult) {
  return [
    "status",
    "actor",
    "sourceReference",
    "createdObjectCount",
    "updatedObjectCount",
    "deprecatedObjectCount",
    "warningCount",
    result.status === "failed" ? "failureStatus" : null,
  ].filter((field): field is string => Boolean(field));
}

function readObjectCounts(value: unknown, result: CadGraphImportResult) {
  const counts = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const readNumber = (key: string, fallback: number) =>
    typeof counts[key] === "number" ? counts[key] : fallback;

  return {
    assemblyNodes: readNumber("assemblyNodes", result.assemblyNodeCount),
    partDefinitions: readNumber("partDefinitions", result.partDefinitionCount),
    partInstances: readNumber("partInstances", result.partInstanceCount),
    created: readNumber("created", 0),
    updated: readNumber("updated", 0),
    deprecated: readNumber("deprecated", 0),
  };
}

export function recordCadImportAuditAction(args: {
  store: OnshapeRuntimeStore;
  documentRef: OnshapeDocumentRef;
  result: CadGraphImportResult;
  actorMemberId?: string | null;
}) {
  const importRun = args.store.findImportRun(args.result.importRunId);
  const sourceReference = {
    documentId: args.documentRef.documentId,
    workspaceId: args.documentRef.workspaceId,
    versionId: args.documentRef.versionId,
    microversionId: args.documentRef.microversionId,
    elementId: args.documentRef.elementId,
    referenceType: args.documentRef.referenceType,
    originalUrl: args.documentRef.originalUrl,
  };

  recordAuditAction({
    operation: "update",
    entityType: "onshape_sync_job",
    entityId: args.result.syncJobId || args.result.importRunId,
    entityLabel: args.documentRef.label,
    changedFields: buildChangedFields(args.result),
    projectId: args.documentRef.projectId,
    subsystemId: args.documentRef.subsystemId,
    actorMemberId: args.actorMemberId ?? null,
    memberIds: [args.actorMemberId ?? null],
    detailsJson: {
      syncJobId: args.result.syncJobId,
      importRunId: args.result.importRunId,
      status: args.result.status,
      failureStatus: args.result.status === "failed" ? args.result.stoppedReason ?? "failed" : null,
      actor: args.actorMemberId ?? null,
      sourceReference,
      objectCounts: readObjectCounts(importRun?.rawSummaryJson.objectChangeCounts, args.result),
      warningCount: args.result.warningCount,
      callsUsed: args.result.callsUsed,
    },
  });
}
