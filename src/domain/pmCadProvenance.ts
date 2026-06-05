import type { PmCadImportSource, PmCadProvenance, PmCadSource } from "./types";

const PM_CAD_IMPORT_SOURCES = new Set<string>([
  "MANUAL",
  "STEP_UPLOAD",
  "ONSHAPE_API",
  "ONSHAPE_BOM_CSV",
  "MANUAL_BOM_CSV",
]);

function normalizedCadImportToken(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") ?? "";
}

export function cadImportSourceFromText(value: string | null | undefined): PmCadImportSource {
  const normalized = normalizedCadImportToken(value);
  if (normalized === "STEP" || normalized === "STEP_UPLOAD" || normalized === "STP") {
    return "STEP_UPLOAD";
  }
  if (
    normalized === "ONSHAPE" ||
    normalized === "ONSHAPE_API" ||
    normalized === "ONSHAPE_BOM" ||
    normalized === "ONSHAPE_BOM_CSV"
  ) {
    return normalized === "ONSHAPE_BOM_CSV" ? "ONSHAPE_BOM_CSV" : "ONSHAPE_API";
  }
  if (normalized === "MANUAL_BOM_CSV") {
    return "MANUAL_BOM_CSV";
  }
  return "MANUAL";
}

export function normalizePmCadImportSource(
  value: string | null | undefined,
  fallbackValue: string | null | undefined,
): PmCadImportSource {
  const normalized = normalizedCadImportToken(value);
  if (PM_CAD_IMPORT_SOURCES.has(normalized)) {
    return normalized as PmCadImportSource;
  }
  return cadImportSourceFromText(fallbackValue ?? value);
}

function cadSourceFromImportSource(cadImportSource: PmCadImportSource): PmCadSource {
  if (cadImportSource === "STEP_UPLOAD") {
    return "step";
  }
  if (cadImportSource === "ONSHAPE_API" || cadImportSource === "ONSHAPE_BOM_CSV") {
    return "onshape";
  }
  return "manual";
}

function cadSourceLabelFromImportSource(cadImportSource: PmCadImportSource) {
  if (cadImportSource === "STEP_UPLOAD") {
    return "STEP";
  }
  if (cadImportSource === "ONSHAPE_API" || cadImportSource === "ONSHAPE_BOM_CSV") {
    return "Onshape";
  }
  return "Manual";
}

export function normalizePmCadProvenance<T extends Partial<PmCadProvenance> & { source?: string }>(
  input: T,
) {
  const cadImportSource = normalizePmCadImportSource(
    input.cadImportSource,
    input.source ?? input.cadSource,
  );
  return {
    ...input,
    cadSource: input.cadSource ?? cadSourceFromImportSource(cadImportSource),
    cadImportSource,
    cadEditedAfterImport: input.cadEditedAfterImport ?? false,
    cadSourceLabel: input.cadSourceLabel ?? cadSourceLabelFromImportSource(cadImportSource),
    cadUpdatedAt: input.cadUpdatedAt ?? null,
  };
}

export function markPmCadEditedAfterImport(
  current: Partial<PmCadProvenance> & { source?: string },
  input: Partial<PmCadProvenance> & { source?: string },
) {
  if (input.cadEditedAfterImport !== undefined) {
    return input.cadEditedAfterImport;
  }

  const currentImportSource = normalizePmCadImportSource(
    current.cadImportSource,
    current.source ?? current.cadSource,
  );
  if (input.cadImportSource !== undefined) {
    const nextImportSource = normalizePmCadImportSource(
      input.cadImportSource,
      input.source ?? input.cadSource,
    );
    if (nextImportSource !== currentImportSource) {
      return false;
    }
  }

  return currentImportSource !== "MANUAL" && currentImportSource !== "MANUAL_BOM_CSV"
    ? true
    : current.cadEditedAfterImport ?? false;
}
