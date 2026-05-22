import type {
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  OnshapeAssemblyBomResponse,
  OnshapeReference,
} from "./onshapeTypes";

const fieldKeys = {
  name: ["name", "partName", "Part Name", "Name"],
  partNumber: ["partNumber", "part number", "Part Number", "partNo", "part no"],
  quantity: ["quantity", "qty", "Quantity", "Qty", "QTY"],
  material: ["material", "Material"],
  configuration: ["configuration", "Configuration"],
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrap(value: unknown): unknown {
  const wrapped = record(value);
  return wrapped
    ? wrapped.value ?? wrapped.displayValue ?? wrapped.computedValue ?? wrapped.name ?? value
    : value;
}

function key(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function bagField(value: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map(key));
  const bag = record(value);
  if (bag) {
    for (const fieldKey of keys) {
      const fieldValue = unwrap(bag[fieldKey]);
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "") {
        return fieldValue;
      }
    }
    return undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    const itemRecord = record(item);
    const label = itemRecord?.columnId ?? itemRecord?.propertyId ?? itemRecord?.key ??
      itemRecord?.name ?? itemRecord?.label ?? itemRecord?.header;
    if (typeof label === "string" && wanted.has(key(label))) {
      return unwrap(itemRecord?.value ?? itemRecord?.displayValue ?? item);
    }
  }
  return undefined;
}

function field(row: Record<string, unknown>, keys: string[]): unknown {
  const direct = bagField(row, keys);
  if (direct !== undefined) {
    return direct;
  }
  for (const bagKey of ["properties", "otherProperties", "values", "cells"]) {
    const nested = bagField(row[bagKey], keys);
    if (nested !== undefined && nested !== null && nested !== "") {
      return nested;
    }
  }
  return undefined;
}

function text(row: Record<string, unknown>, keys: string[]) {
  const value = field(row, keys);
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function number(row: Record<string, unknown>, keys: string[]) {
  const value = field(row, keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function nativeRows(raw: unknown) {
  const root = record(raw);
  const table = record(root?.bomTable);
  for (const candidate of [table?.items, table?.rows, root?.items, root?.rows]) {
    if (Array.isArray(candidate)) {
      return candidate.flatMap((item) => {
        const row = record(item);
        return row ? [row] : [];
      });
    }
  }
  return [];
}

function alreadyNormalized(raw: unknown): OnshapeAssemblyBomResponse | null {
  const bom = record(raw) as Partial<OnshapeAssemblyBomResponse> | null;
  return bom &&
    Array.isArray(bom.assemblyNodes) &&
    Array.isArray(bom.partDefinitions) &&
    Array.isArray(bom.partInstances)
    ? {
        assemblyNodes: bom.assemblyNodes,
        partDefinitions: bom.partDefinitions,
        partInstances: bom.partInstances,
        raw: bom.raw ?? { payload: raw },
      }
    : null;
}

function placeholderBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  const rootId = reference.elementId ?? reference.documentId;
  return {
    assemblyNodes: [
      {
        sourceId: `assembly:${rootId}`,
        documentId: reference.documentId,
        elementId: reference.elementId,
        instanceId: reference.elementId,
        instancePath: `/${rootId}`,
        name: "Linked Onshape assembly",
        inferredType: "master_assembly",
        metadata: { normalization: "placeholder" },
      },
    ],
    partDefinitions: [],
    partInstances: [],
    raw: { payload: raw },
  };
}

function rowSource(row: Record<string, unknown>) {
  return record(row.itemSource) ?? record(row.source) ?? record(row.partSource) ?? row;
}

function sourceIdentity(row: Record<string, unknown>, source: Record<string, unknown>, index: number) {
  return text(source, ["id", "instanceId", "occurrenceId"]) ??
    text(row, ["id", "itemId", "instanceId", "occurrenceId"]) ??
    String(index + 1);
}

function buildPart(row: Record<string, unknown>, reference: OnshapeReference, index: number) {
  const source = rowSource(row);
  const documentId = text(source, ["documentId"]) ?? reference.documentId;
  const elementId = text(source, ["elementId"]) ?? text(row, ["elementId"]) ?? reference.elementId;
  const partId = text(source, ["partId"]) ?? text(row, ["partId"]);
  const identity = sourceIdentity(row, source, index);
  const sourceId = `part:${documentId}:${elementId ?? "unknown"}:${partId ?? identity}`;
  const wvmType = text(source, ["wvmType"]);
  const wvmId = text(source, ["wvmId"]);
  const configuration = text(row, fieldKeys.configuration);
  const definition: NormalizedCadPartDefinition = {
    sourceId,
    documentId,
    elementId,
    partId,
    versionId: wvmType === "v" ? wvmId : text(source, ["versionId"]) ?? reference.versionId,
    microversionId: wvmType === "m" ? wvmId : text(source, ["microversionId"]) ?? reference.microversionId,
    name: text(row, fieldKeys.name) ?? partId ?? `Onshape BOM item ${index + 1}`,
    partNumber: text(row, fieldKeys.partNumber),
    material: text(row, fieldKeys.material),
    configuration,
    customProperties: Object.fromEntries(
      ["properties", "otherProperties", "values"].flatMap((keyName) =>
        row[keyName] === undefined ? [] : [[keyName, row[keyName]]],
      ),
    ),
  };
  return { definition, identity, sourceId };
}

export function normalizeOnshapeBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  const normalized = alreadyNormalized(raw);
  if (normalized) {
    return normalized;
  }

  const rows = nativeRows(raw);
  if (rows.length === 0) {
    return placeholderBom(raw, reference);
  }

  const rootId = reference.elementId ?? reference.documentId;
  const rootSourceId = `assembly:${rootId}`;
  const partDefinitions: NormalizedCadPartDefinition[] = [];
  const partInstances: NormalizedCadPartInstance[] = [];
  rows.forEach((row, index) => {
    const { definition, identity, sourceId } = buildPart(row, reference, index);
    partDefinitions.push(definition);
    partInstances.push({
      sourceId: `instance:${sourceId}:${identity}`,
      partDefinitionSourceId: sourceId,
      parentAssemblySourceId: rootSourceId,
      documentId: definition.documentId,
      elementId: definition.elementId,
      instanceId: identity,
      partId: definition.partId,
      instancePath: `/${rootId}/${identity}`,
      quantity: number(row, fieldKeys.quantity),
      configuration: definition.configuration,
      metadata: { normalization: "onshape-bom-table", rowIndex: index },
    });
  });

  const root = record(raw) ?? {};
  const table = record(root.bomTable) ?? {};
  return {
    assemblyNodes: [
      {
        sourceId: rootSourceId,
        documentId: reference.documentId,
        elementId: reference.elementId,
        instanceId: reference.elementId,
        instancePath: `/${rootId}`,
        name: text(table, ["name", "assemblyName", "elementName"]) ??
          text(root, ["name", "assemblyName", "elementName"]) ??
          "Linked Onshape assembly",
        inferredType: "master_assembly",
        metadata: { normalization: "onshape-bom-table" },
      },
    ],
    partDefinitions,
    partInstances,
    raw: { payload: raw },
  };
}
