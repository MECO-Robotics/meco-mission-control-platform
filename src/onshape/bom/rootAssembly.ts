import type {
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  OnshapeAssemblyBomResponse,
  OnshapeReference,
} from "../onshapeTypes";
import { asRecord, readBoolean, readName, readNumber, readString, recordArray, type NativeBomRecord } from "./fields";

const assemblySourceId = (id: string) => `assembly:${id}`;

function partDefinitionSourceId(item: NativeBomRecord) {
  const partId = readString(item, "partId");
  const instanceId = readString(item, "id") ?? "unknown";
  const configuration = readString(item, "configuration") ?? "default";
  const documentId = readString(item, "documentId") ?? "unknown-document";
  const elementId = readString(item, "elementId") ?? "unknown-element";
  const microversionId = readString(item, "documentMicroversion") ?? readString(item, "microversionId") ?? "unknown-microversion";
  return `part:${documentId}:${elementId}:${microversionId}:${partId ?? instanceId}:${configuration}`;
}

export function normalizeRootAssemblyBom(
  raw: NativeBomRecord,
  reference: OnshapeReference,
): OnshapeAssemblyBomResponse | null {
  const rootRecord = asRecord(raw.rootAssembly);
  if (!rootRecord) {
    return null;
  }

  const rootId = readString(rootRecord, "id") ?? reference.elementId ?? reference.documentId;
  const rootSourceId = assemblySourceId(rootId);
  const instanceRecords = recordArray(rootRecord.instances);
  const instanceById = new Map(
    instanceRecords
      .map((item) => [readString(item, "id"), item] as const)
      .filter((entry): entry is [string, NativeBomRecord] => Boolean(entry[0])),
  );
  const assemblyById = new Map(
    instanceRecords
      .filter((item) => readString(item, "type")?.toLowerCase() === "assembly")
      .map((item) => [readString(item, "id"), item] as const)
      .filter((entry): entry is [string, NativeBomRecord] => Boolean(entry[0])),
  );
  const assemblyPathById = new Map<string, string>([[rootId, `/${rootId}`]]);

  function assemblyPathFor(id: string, seen = new Set<string>()): string {
    const existing = assemblyPathById.get(id);
    if (existing) {
      return existing;
    }
    if (seen.has(id)) {
      return `/${id}`;
    }
    seen.add(id);
    const item = assemblyById.get(id);
    const parentId = item ? readString(item, "parentId") : undefined;
    const parentPath = parentId && assemblyById.has(parentId) ? assemblyPathFor(parentId, seen) : `/${rootId}`;
    const path = `${parentPath}/${id}`;
    assemblyPathById.set(id, path);
    return path;
  }

  function parentAssemblyFor(item: NativeBomRecord) {
    const parentId = readString(item, "parentId");
    const parent = parentId ? instanceById.get(parentId) : undefined;
    if (parentId && parent && readString(parent, "type")?.toLowerCase() === "assembly") {
      return { sourceId: assemblySourceId(parentId), path: assemblyPathFor(parentId) };
    }
    return { sourceId: rootSourceId, path: `/${rootId}` };
  }

  const assemblyNodes: NormalizedCadAssemblyNode[] = [
    {
      sourceId: rootSourceId,
      documentId: readString(rootRecord, "documentId") ?? reference.documentId,
      elementId: readString(rootRecord, "elementId") ?? reference.elementId,
      instanceId: rootId,
      instancePath: `/${rootId}`,
      name: readName(rootRecord, "Linked Onshape assembly"),
      inferredType: "master_assembly",
      metadata: { normalization: "native_onshape" },
    },
  ];
  const partDefinitionsBySourceId = new Map<string, NormalizedCadPartDefinition>();
  const partInstances: NormalizedCadPartInstance[] = [];

  for (const item of instanceRecords) {
    if (readString(item, "type")?.toLowerCase() !== "assembly") {
      continue;
    }
    const id = readString(item, "id");
    if (!id) {
      continue;
    }
    assemblyNodes.push({
      sourceId: assemblySourceId(id),
      parentSourceId: parentAssemblyFor(item).sourceId,
      documentId: readString(item, "documentId") ?? reference.documentId,
      elementId: readString(item, "elementId") ?? reference.elementId,
      instanceId: id,
      instancePath: assemblyPathFor(id),
      name: readName(item, id),
      inferredType: "subassembly",
      metadata: { normalization: "native_onshape" },
    });
  }

  for (const item of instanceRecords) {
    if (readString(item, "type")?.toLowerCase() !== "part") {
      continue;
    }
    const id = readString(item, "id");
    if (!id) {
      continue;
    }
    const parent = parentAssemblyFor(item);
    const definitionSourceId = partDefinitionSourceId(item);
    if (!partDefinitionsBySourceId.has(definitionSourceId)) {
      partDefinitionsBySourceId.set(definitionSourceId, {
        sourceId: definitionSourceId,
        documentId: readString(item, "documentId") ?? reference.documentId,
        elementId: readString(item, "elementId") ?? reference.elementId,
        partId: readString(item, "partId"),
        microversionId: readString(item, "documentMicroversion") ?? readString(item, "microversionId"),
        name: readName(item, id),
        partNumber: readString(item, "partNumber"),
        material: readString(item, "material"),
        mass: readNumber(item, "mass"),
        configuration: readString(item, "configuration"),
      });
    }
    partInstances.push({
      sourceId: `part-instance:${id}`,
      partDefinitionSourceId: definitionSourceId,
      parentAssemblySourceId: parent.sourceId,
      documentId: readString(item, "documentId") ?? reference.documentId,
      elementId: readString(item, "elementId") ?? reference.elementId,
      instanceId: id,
      partId: readString(item, "partId"),
      instancePath: `${parent.path}/${id}`,
      suppressed: readBoolean(item, "suppressed"),
      configuration: readString(item, "configuration"),
      transform: item.transform,
      metadata: { normalization: "native_onshape" },
    });
  }

  return {
    assemblyNodes,
    partDefinitions: [...partDefinitionsBySourceId.values()],
    partInstances,
    raw: { payload: raw },
  };
}
