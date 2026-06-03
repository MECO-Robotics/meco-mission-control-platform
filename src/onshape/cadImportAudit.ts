import { recordAuditAction } from "../data/store";
import type { OnshapeRuntimeStore } from "./cadStore";
import type { CadGraphImportResult, OnshapeDocumentRef } from "./onshapeTypes";

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

export function recordCadImportAuditAction(args: {
  store: OnshapeRuntimeStore;
  documentRef: OnshapeDocumentRef;
  result: CadGraphImportResult;
  actorMemberId?: string | null;
}) {
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
      objectCounts: {
        assemblyNodes: args.result.assemblyNodeCount,
        partDefinitions: args.result.partDefinitionCount,
        partInstances: args.result.partInstanceCount,
        created: args.result.assemblyNodeCount + args.result.partDefinitionCount + args.result.partInstanceCount,
        updated: 0,
        deprecated: 0,
      },
      warningCount: args.result.warningCount,
      callsUsed: args.result.callsUsed,
    },
  });
}
