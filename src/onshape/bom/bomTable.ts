import type {
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  OnshapeAssemblyBomResponse,
  OnshapeReference,
} from "../onshapeTypes";
import {
  asRecord,
  fieldKeys,
  readNumber,
  readString,
  recordArray,
  type NativeBomRecord,
} from "./fields";

function rowsFromBomTable(raw: NativeBomRecord) {
  const table = asRecord(raw.bomTable);
  for (const candidate of [table?.items, table?.rows, raw.items, raw.rows]) {
    if (Array.isArray(candidate)) {
      return recordArray(candidate);
    }
  }
  return [];
}

function rowSource(row: NativeBomRecord) {
  return asRecord(row.itemSource) ?? asRecord(row.source) ?? asRecord(row.partSource) ?? row;
}

function sourceIdentity(row: NativeBomRecord, source: NativeBomRecord, index: number) {
  return readString(source, ["id", "instanceId", "occurrenceId"]) ??
    readString(row, ["id", "itemId", "instanceId", "occurrenceId"]) ??
    String(index + 1);
}

function wvmIdentity(source: NativeBomRecord, reference: OnshapeReference) {
  const wvmType = readString(source, "wvmType");
  const wvmId = readString(source, "wvmId");
  return {
    versionId: wvmType === "v" ? wvmId : readString(source, "versionId") ?? reference.versionId,
    microversionId: wvmType === "m" ? wvmId : readString(source, "microversionId") ?? reference.microversionId,
  };
}

function customProperties(row: NativeBomRecord) {
  return Object.fromEntries(
    ["properties", "otherProperties", "values"].flatMap((keyName) =>
      row[keyName] === undefined ? [] : [[keyName, row[keyName]]],
    ),
  );
}

function buildPart(row: NativeBomRecord, reference: OnshapeReference, index: number) {
  const source = rowSource(row);
  const documentId = readString(source, "documentId") ?? reference.documentId;
  const elementId = readString(source, "elementId") ?? readString(row, "elementId") ?? reference.elementId;
  const partId = readString(source, "partId") ?? readString(row, "partId");
  const identity = sourceIdentity(row, source, index);
  const sourceWvm = wvmIdentity(source, reference);
  const versionId = sourceWvm.versionId;
  const microversionId = readString(row, ["documentMicroversion", "microversionId", "mvid"]) ?? sourceWvm.microversionId;
  const configuration = readString(row, fieldKeys.configuration);
  const wvmScope = versionId ?? microversionId ?? "unknown-wvm";
  const sourceId = `part:${documentId}:${elementId ?? "unknown-element"}:${wvmScope}:${partId ?? identity}:${configuration ?? "default"}`;
  const definition: NormalizedCadPartDefinition = {
    sourceId,
    documentId,
    elementId,
    partId,
    versionId,
    microversionId,
    name: readString(row, fieldKeys.name) ?? partId ?? `Onshape BOM item ${index + 1}`,
    partNumber: readString(row, fieldKeys.partNumber),
    material: readString(row, fieldKeys.material),
    configuration,
    customProperties: customProperties(row),
  };
  return { definition, identity, sourceId };
}

export function normalizeBomTable(raw: NativeBomRecord, reference: OnshapeReference): OnshapeAssemblyBomResponse | null {
  const rows = rowsFromBomTable(raw);
  if (rows.length === 0) {
    return null;
  }

  const rootId = reference.elementId ?? reference.documentId;
  const rootSourceId = `assembly:${rootId}`;
  const table = asRecord(raw.bomTable) ?? {};
  const assemblyNodes: NormalizedCadAssemblyNode[] = [
    {
      sourceId: rootSourceId,
      documentId: reference.documentId,
      elementId: reference.elementId,
      instanceId: reference.elementId,
      instancePath: `/${rootId}`,
      name: readString(table, ["name", "assemblyName", "elementName"]) ??
        readString(raw, ["name", "assemblyName", "elementName"]) ??
        "Linked Onshape assembly",
      inferredType: "master_assembly",
      metadata: { normalization: "native_onshape_bom_table" },
    },
  ];
  const assemblySourceByItemNumber = new Map<string, string>();
  const partDefinitions: NormalizedCadPartDefinition[] = [];
  const partInstances: NormalizedCadPartInstance[] = [];
  rows.forEach((row, index) => {
    const itemNumber = readString(row, ["itemNumber", "item", "itemNo", "item_number"]);
    const rowType = readString(row, ["type", "itemType", "elementType"])?.toLowerCase() ?? "";
    const parentItemNumber = itemNumber?.includes(".") ? itemNumber.split(".").slice(0, -1).join(".") : undefined;
    const parentAssemblySourceId =
      (parentItemNumber ? assemblySourceByItemNumber.get(parentItemNumber) : undefined) ?? rootSourceId;

    if (rowType.includes("assembly")) {
      const source = rowSource(row);
      const identity = sourceIdentity(row, source, index);
      const sourceId = `assembly:${identity}`;
      if (itemNumber) {
        assemblySourceByItemNumber.set(itemNumber, sourceId);
      }
      assemblyNodes.push({
        sourceId,
        parentSourceId: parentAssemblySourceId,
        documentId: readString(source, "documentId") ?? readString(row, "documentId") ?? reference.documentId,
        elementId: readString(source, "elementId") ?? readString(row, "elementId") ?? reference.elementId,
        instanceId: identity,
        instancePath: itemNumber ? `/${itemNumber}` : `/${rootId}/${identity}`,
        name: readString(row, fieldKeys.name) ?? identity,
        inferredType: "subassembly",
        metadata: { normalization: "native_onshape_bom_table", itemNumber, rowIndex: index },
      });
      return;
    }

    const { definition, identity, sourceId } = buildPart(row, reference, index);
    partDefinitions.push(definition);
    partInstances.push({
      sourceId: `instance:${sourceId}:${identity}`,
      partDefinitionSourceId: sourceId,
      parentAssemblySourceId,
      documentId: definition.documentId,
      elementId: definition.elementId,
      instanceId: identity,
      partId: definition.partId,
      instancePath: itemNumber ? `/${itemNumber}` : `/${rootId}/${identity}`,
      quantity: readNumber(row, fieldKeys.quantity),
      configuration: definition.configuration,
      metadata: { normalization: "native_onshape_bom_table", itemNumber, rowIndex: index },
    });
  });

  return {
    assemblyNodes,
    partDefinitions,
    partInstances,
    raw: { payload: raw },
  };
}
