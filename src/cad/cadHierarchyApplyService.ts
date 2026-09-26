import { applyMappingUpdates, type MappingUpdateInput } from "./cadMappingEngine";
import type { CadHierarchyApplyInput } from "./cadRouteSchemas";
import type { CadMappingSourceKind } from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";

type HierarchyDecision = MappingUpdateInput & {
  sourceKind: CadMappingSourceKind;
  sourceId: string;
  parentMechanismId?: string | null;
};

export async function applyHierarchyReviewDecisions(args: {
  store: CadStore;
  snapshotId: string;
  input: CadHierarchyApplyInput;
}) {
  const snapshot = await args.store.findSnapshot(args.snapshotId);
  if (!snapshot) {
    return null;
  }
  const [assemblies, cadParts, partInstances] = await Promise.all([
    args.store.listAssemblyNodes(snapshot.id),
    args.store.listPartDefinitions(snapshot.id),
    args.store.listPartInstances(snapshot.id),
  ]);
  const sourcesByKind = {
    ASSEMBLY_NODE: new Map(assemblies.map((assembly) => [assembly.sourceId, assembly] as const)),
    PART_DEFINITION: new Map(cadParts.map((part) => [part.sourceId, part] as const)),
    PART_INSTANCE: new Map(partInstances.map((part) => [part.sourceId, part] as const)),
  };
  const decisions = args.input.decisions ?? [];
  const normalized: HierarchyDecision[] = [
    ...[
      ...decisions.filter((decision) => !decision.sourceKind || decision.sourceKind === "ASSEMBLY_NODE"),
      ...decisions.filter((decision) => decision.sourceKind === "PART_DEFINITION" || decision.sourceKind === "PART_INSTANCE"),
    ].map((decision) => ({
      ...decision,
      sourceKind: decision.sourceKind ?? "ASSEMBLY_NODE" as const,
      sourceId: decision.sourceId ?? decision.nodeId,
    })),
    ...(args.input.assemblyDecisions ?? []).map((decision) => ({
      ...decision,
      sourceKind: "ASSEMBLY_NODE" as const,
    })),
    ...(args.input.partMatchConfirmations ?? []).map((confirmation) => ({
      ...confirmation,
      sourceKind: "PART_DEFINITION" as const,
      sourceId: confirmation.cadPartDefinitionSourceId,
      targetKind: "PART_DEFINITION" as const,
      targetId: confirmation.targetPartDefinitionId,
    })),
  ];
  const updates = normalized.map((decision): MappingUpdateInput => {
    let targetKind = decision.targetKind;
    let targetId = decision.targetId ?? null;
    if (decision.sourceKind === "ASSEMBLY_NODE") {
      if (targetKind === "COMPONENT_ASSEMBLY") {
        targetId = decision.parentMechanismId ?? targetId;
      }
    } else {
      if (decision.status === "REJECTED") {
        targetKind = "UNMAPPED";
      } else if (!["IGNORE", "REFERENCE_GEOMETRY", "UNMAPPED"].includes(targetKind)) {
        targetKind = "PART_DEFINITION";
      }
      if (targetKind !== "PART_DEFINITION") {
        targetId = null;
      }
    }
    return {
      sourceKind: decision.sourceKind,
      sourceId: sourcesByKind[decision.sourceKind].get(decision.sourceId)?.id ?? decision.sourceId,
      targetKind,
      targetId,
      confidence: decision.confidence ?? "MANUAL",
      status: decision.status ?? "CONFIRMED",
      applyToFuture: decision.applyToFuture,
      reviewedBy: args.input.reviewedBy ?? null,
      notes: decision.notes ?? null,
    };
  });
  return applyMappingUpdates({
    store: args.store,
    snapshot,
    updates,
    reviewedBy: args.input.reviewedBy ?? null,
  });
}
