import type {
  CadAssemblyInferredType,
  CadImportOnshapeClient,
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  OnshapeAssemblyBomResponse,
  OnshapeDocumentMetadataResponse,
  OnshapeReference,
} from "./onshapeTypes";
import type { createOnshapeApiClient } from "./onshapeApiClient";

export const ONSHAPE_DOCUMENT_METADATA_REQUEST_HASH = "document-metadata:v1";
export const ONSHAPE_ASSEMBLY_BOM_REQUEST_HASH = "assembly-bom:v1";

type LowLevelClient = ReturnType<typeof createOnshapeApiClient>;

function referenceModePath(reference: OnshapeReference) {
  if (reference.workspaceId) {
    return `w/${reference.workspaceId}`;
  }
  if (reference.versionId) {
    return `v/${reference.versionId}`;
  }
  if (reference.microversionId) {
    return `m/${reference.microversionId}`;
  }
  return "unknown";
}

function readName(value: unknown, fallback: string) {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidate = record.name ?? record.documentName ?? record.elementName;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringFromAny(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function normalizeMetadata(raw: unknown, reference: OnshapeReference): OnshapeDocumentMetadataResponse {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    documentName: readName(record.document, readName(raw, "Onshape document")),
    elementName: readName(record.element, reference.elementId ?? "Linked assembly"),
    versionName: typeof record.versionName === "string" ? record.versionName : undefined,
    microversionId: reference.microversionId,
    raw: { payload: raw },
  };
}

function inferAssemblyType(isRoot: boolean): CadAssemblyInferredType {
  return isRoot ? "master_assembly" : "subassembly";
}

function nativeAssemblySourceId(id: string) {
  return `assembly:${id}`;
}

function nativePartDefinitionSourceId(item: Record<string, unknown>) {
  const partId = readString(item, "partId");
  const instanceId = readString(item, "id") ?? "unknown";
  const configuration = readString(item, "configuration") ?? "default";
  const documentId = readString(item, "documentId") ?? "unknown-document";
  const elementId = readString(item, "elementId") ?? "unknown-element";
  const microversionId = readString(item, "documentMicroversion") ?? readString(item, "microversionId") ?? "unknown-microversion";
  return `part:${documentId}:${elementId}:${microversionId}:${partId ?? instanceId}:${configuration}`;
}

function normalizeNativeOnshapeBom(raw: Record<string, unknown>, reference: OnshapeReference): OnshapeAssemblyBomResponse | null {
  const root = raw.rootAssembly;
  if (typeof root !== "object" || root === null) {
    return null;
  }

  const rootRecord = root as Record<string, unknown>;
  const rootId = readString(rootRecord, "id") ?? reference.elementId ?? reference.documentId;
  const rootSourceId = nativeAssemblySourceId(rootId);
  const instanceRecords = Array.isArray(rootRecord.instances)
    ? rootRecord.instances.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  const instanceById = new Map(
    instanceRecords
      .map((item) => [readString(item, "id"), item] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])),
  );
  const assemblyById = new Map(
    instanceRecords
      .filter((item) => readString(item, "type")?.toLowerCase() === "assembly")
      .map((item) => [readString(item, "id"), item] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])),
  );

  const assemblyPathById = new Map<string, string>([[rootId, `/${rootId}`]]);
  const assemblyNodes: NormalizedCadAssemblyNode[] = [
    {
      sourceId: rootSourceId,
      documentId: readString(rootRecord, "documentId") ?? reference.documentId,
      elementId: readString(rootRecord, "elementId") ?? reference.elementId,
      instanceId: rootId,
      instancePath: `/${rootId}`,
      name: readName(rootRecord, "Linked Onshape assembly"),
      inferredType: inferAssemblyType(true),
      metadata: { normalization: "native_onshape" },
    },
  ];
  const partDefinitionsBySourceId = new Map<string, NormalizedCadPartDefinition>();
  const partInstances: NormalizedCadPartInstance[] = [];

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

  function parentAssemblyFor(item: Record<string, unknown>) {
    const parentId = readString(item, "parentId");
    const parent = parentId ? instanceById.get(parentId) : undefined;
    if (parentId && parent && readString(parent, "type")?.toLowerCase() === "assembly") {
      return {
        sourceId: nativeAssemblySourceId(parentId),
        path: assemblyPathFor(parentId),
      };
    }
    return { sourceId: rootSourceId, path: `/${rootId}` };
  }

  for (const item of instanceRecords) {
    if (readString(item, "type")?.toLowerCase() !== "assembly") {
      continue;
    }
    const id = readString(item, "id");
    if (!id) {
      continue;
    }
    const parent = parentAssemblyFor(item);
    const instancePath = assemblyPathFor(id);
    assemblyNodes.push({
      sourceId: nativeAssemblySourceId(id),
      parentSourceId: parent.sourceId,
      documentId: readString(item, "documentId") ?? reference.documentId,
      elementId: readString(item, "elementId") ?? reference.elementId,
      instanceId: id,
      instancePath,
      name: readName(item, id),
      inferredType: inferAssemblyType(false),
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
    const partDefinitionSourceId = nativePartDefinitionSourceId(item);
    if (!partDefinitionsBySourceId.has(partDefinitionSourceId)) {
      partDefinitionsBySourceId.set(partDefinitionSourceId, {
        sourceId: partDefinitionSourceId,
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
      partDefinitionSourceId,
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

function readCellValue(row: Record<string, unknown>, keys: string[]) {
  const direct = readStringFromAny(row, keys);
  if (direct) {
    return direct;
  }

  const propertyContainers = [row.cells, row.columnIdToCell, row.values, row.properties];
  for (const container of propertyContainers) {
    if (typeof container !== "object" || container === null || Array.isArray(container)) {
      continue;
    }
    const value = readStringFromAny(container as Record<string, unknown>, keys);
    if (value) {
      return value;
    }
  }

  if (Array.isArray(row.cells)) {
    for (const cell of row.cells) {
      if (typeof cell !== "object" || cell === null) {
        continue;
      }
      const record = cell as Record<string, unknown>;
      const cellKey = readStringFromAny(record, ["columnId", "propertyId", "id", "name", "header"]);
      if (cellKey && keys.some((key) => key.toLowerCase() === cellKey.toLowerCase())) {
        return readStringFromAny(record, ["value", "displayValue", "text", "label", "name"]);
      }
    }
  }

  return undefined;
}

function readCellNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  const value = readCellValue(row, keys);
  return value && Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function normalizeBomTable(raw: Record<string, unknown>, reference: OnshapeReference): OnshapeAssemblyBomResponse | null {
  const bomTable = raw.bomTable;
  if (typeof bomTable !== "object" || bomTable === null) {
    return null;
  }

  const tableRecord = bomTable as Record<string, unknown>;
  const rowSource = tableRecord.rows ?? tableRecord.items ?? tableRecord.entries;
  if (!Array.isArray(rowSource)) {
    return null;
  }

  const rootSourceId = nativeAssemblySourceId(reference.elementId ?? reference.documentId);
  const assemblyNodes: NormalizedCadAssemblyNode[] = [
    {
      sourceId: rootSourceId,
      documentId: reference.documentId,
      elementId: reference.elementId,
      instanceId: reference.elementId,
      instancePath: `/${reference.elementId ?? reference.documentId}`,
      name: readName(tableRecord, "Linked Onshape assembly"),
      inferredType: "master_assembly",
      metadata: { normalization: "native_onshape_bom_table" },
    },
  ];
  const assemblySourceByItemNumber = new Map<string, string>();
  const partDefinitionsBySourceId = new Map<string, NormalizedCadPartDefinition>();
  const partInstances: NormalizedCadPartInstance[] = [];

  for (const rawRow of rowSource) {
    if (typeof rawRow !== "object" || rawRow === null) {
      continue;
    }
    const row = rawRow as Record<string, unknown>;
    const itemNumber = readCellValue(row, ["itemNumber", "item", "itemNo", "item_number"]);
    const rowType = readCellValue(row, ["type", "itemType", "elementType"])?.toLowerCase() ?? "";
    const documentId = readCellValue(row, ["documentId", "did"]) ?? reference.documentId;
    const elementId = readCellValue(row, ["elementId", "eid"]) ?? reference.elementId;
    const microversionId = readCellValue(row, ["documentMicroversion", "microversionId", "mvid"]);
    const rowId = readCellValue(row, ["id", "itemId", "instanceId", "occurrenceId"]) ?? itemNumber ?? `${partDefinitionsBySourceId.size + partInstances.length + 1}`;
    const parentItemNumber = itemNumber?.includes(".") ? itemNumber.split(".").slice(0, -1).join(".") : undefined;
    const parentAssemblySourceId =
      (parentItemNumber ? assemblySourceByItemNumber.get(parentItemNumber) : undefined) ?? rootSourceId;

    if (rowType.includes("assembly")) {
      const sourceId = nativeAssemblySourceId(rowId);
      if (itemNumber) {
        assemblySourceByItemNumber.set(itemNumber, sourceId);
      }
      assemblyNodes.push({
        sourceId,
        parentSourceId: parentAssemblySourceId,
        documentId,
        elementId,
        instanceId: rowId,
        instancePath: itemNumber ? `/${itemNumber}` : `/${rowId}`,
        name: readCellValue(row, ["name", "description", "partNumber"]) ?? rowId,
        inferredType: "subassembly",
        metadata: { normalization: "native_onshape_bom_table", itemNumber },
      });
      continue;
    }

    const partId = readCellValue(row, ["partId", "pid"]) ?? rowId;
    const configuration = readCellValue(row, ["configuration"]) ?? "default";
    const partDefinitionSourceId = `part:${documentId}:${elementId ?? "unknown-element"}:${microversionId ?? "unknown-microversion"}:${partId}:${configuration}`;
    if (!partDefinitionsBySourceId.has(partDefinitionSourceId)) {
      partDefinitionsBySourceId.set(partDefinitionSourceId, {
        sourceId: partDefinitionSourceId,
        documentId,
        elementId,
        partId,
        microversionId,
        name: readCellValue(row, ["name", "description", "partNumber"]) ?? partId,
        partNumber: readCellValue(row, ["partNumber", "part_number"]),
        material: readCellValue(row, ["material"]),
        configuration,
      });
    }
    partInstances.push({
      sourceId: `part-instance:${rowId}`,
      partDefinitionSourceId,
      parentAssemblySourceId,
      documentId,
      elementId,
      instanceId: rowId,
      partId,
      instancePath: itemNumber ? `/${itemNumber}` : `/${rowId}`,
      quantity: readCellNumber(row, ["quantity", "qty"]),
      configuration,
      metadata: { normalization: "native_onshape_bom_table", itemNumber },
    });
  }

  return {
    assemblyNodes,
    partDefinitions: [...partDefinitionsBySourceId.values()],
    partInstances,
    raw: { payload: raw },
  };
}

function normalizeBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Partial<OnshapeAssemblyBomResponse>;
    if (Array.isArray(record.assemblyNodes) && Array.isArray(record.partDefinitions) && Array.isArray(record.partInstances)) {
      return {
        assemblyNodes: record.assemblyNodes,
        partDefinitions: record.partDefinitions,
        partInstances: record.partInstances,
        raw: record.raw ?? { payload: raw },
      };
    }

    const native = normalizeNativeOnshapeBom(raw as Record<string, unknown>, reference);
    if (native) {
      return native;
    }

    const bomTable = normalizeBomTable(raw as Record<string, unknown>, reference);
    if (bomTable) {
      return bomTable;
    }
  }

  throw new Error("Onshape BOM payload was not recognized.");
}

export function createOnshapeCadClient(lowLevelClient: LowLevelClient): CadImportOnshapeClient {
  return {
    getCallsUsed: lowLevelClient.getCallsUsed,
    async fetchDocumentMetadata({ reference, importRunId, policy }) {
      const endpoint = `/api/v10/documents/${reference.documentId}`;
      const raw = await lowLevelClient.requestJson({
        endpoint,
        method: "GET",
        reference,
        requestHash: ONSHAPE_DOCUMENT_METADATA_REQUEST_HASH,
        importRunId,
        policy,
      });
      return normalizeMetadata(raw, reference);
    },
    async fetchAssemblyBom({ reference, importRunId, policy }) {
      if (!reference.elementId) {
        throw new Error("Onshape element ID is required for BOM sync.");
      }
      const modePath = referenceModePath(reference);
      const endpoint = `/api/v10/assemblies/d/${reference.documentId}/${modePath}/e/${reference.elementId}/bom`;
      const raw = await lowLevelClient.requestJson({
        endpoint,
        method: "GET",
        reference,
        requestHash: ONSHAPE_ASSEMBLY_BOM_REQUEST_HASH,
        importRunId,
        policy,
      });
      return normalizeBom(raw, reference);
    },
  };
}
