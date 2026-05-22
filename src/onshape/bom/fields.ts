export type NativeBomRecord = Record<string, unknown>;

export const fieldKeys = {
  name: ["name", "partName", "Part Name", "Name"],
  partNumber: ["partNumber", "part number", "Part Number", "partNo", "part no"],
  quantity: ["quantity", "qty", "Quantity", "Qty", "QTY"],
  material: ["material", "Material"],
  configuration: ["configuration", "Configuration"],
};

export function asRecord(value: unknown): NativeBomRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as NativeBomRecord)
    : null;
}

export function recordArray(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => {
    const found = asRecord(item);
    return found ? [found] : [];
  }) : [];
}

function unwrap(value: unknown): unknown {
  const wrapped = asRecord(value);
  return wrapped
    ? wrapped.value ?? wrapped.displayValue ?? wrapped.computedValue ?? wrapped.name ?? value
    : value;
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readFromBag(value: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map(normalizedKey));
  const bag = asRecord(value);
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
    const itemRecord = asRecord(item);
    const label = itemRecord?.columnId ?? itemRecord?.propertyId ?? itemRecord?.key ??
      itemRecord?.name ?? itemRecord?.label ?? itemRecord?.header;
    if (typeof label === "string" && wanted.has(normalizedKey(label))) {
      return unwrap(itemRecord?.value ?? itemRecord?.displayValue ?? item);
    }
  }
  return undefined;
}

export function readField(row: NativeBomRecord, keys: string[]): unknown {
  const direct = readFromBag(row, keys);
  if (direct !== undefined) {
    return direct;
  }
  for (const bagKey of ["properties", "otherProperties", "values", "cells"]) {
    const nested = readFromBag(row[bagKey], keys);
    if (nested !== undefined && nested !== null && nested !== "") {
      return nested;
    }
  }
  return undefined;
}

export function readString(row: NativeBomRecord, keys: string | string[]) {
  const value = readField(row, Array.isArray(keys) ? keys : [keys]);
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

export function readNumber(row: NativeBomRecord, keys: string | string[]) {
  const value = readField(row, Array.isArray(keys) ? keys : [keys]);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function readBoolean(row: NativeBomRecord, keys: string | string[]) {
  const value = readField(row, Array.isArray(keys) ? keys : [keys]);
  return typeof value === "boolean" ? value : undefined;
}

export function readName(value: unknown, fallback: string) {
  const record = asRecord(value);
  if (!record) {
    return fallback;
  }
  return readString(record, ["name", "documentName", "elementName"]) ?? fallback;
}
