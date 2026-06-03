import { CadImportError } from "./cadImportService";

const defaultStepUploadMaxBytes = 250 * 1024 * 1024;
const acceptedStepExtensions = [".step", ".stp"] as const;
const acceptedStepMimeTypes = new Set([
  "application/octet-stream",
  "application/step",
  "application/x-step",
  "model/step",
  "text/plain",
]);

export function formatStepUploadLimit(bytes: number) {
  const mib = bytes / (1024 * 1024);
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`;
}

function normalizedStepExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  return acceptedStepExtensions.find((extension) => normalized.endsWith(extension)) ?? null;
}

export function assertStepUploadFilename(filename: string) {
  if (!normalizedStepExtension(filename)) {
    throw new CadImportError("STEP uploads must use a .step or .stp file.");
  }
}

export function assertStepUploadMimeType(mimeType: string | undefined) {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized || acceptedStepMimeTypes.has(normalized)) {
    return;
  }
  throw new CadImportError("STEP uploads must use a STEP file MIME type.");
}

function looksLikeStepExchangeFile(fileText: string) {
  const normalized = fileText.trim().toUpperCase();
  return (
    normalized.startsWith("ISO-10303-21;") &&
    normalized.includes("DATA;") &&
    normalized.includes("ENDSEC;") &&
    normalized.endsWith("END-ISO-10303-21;")
  );
}

function looksLikeJsonFixture(fileText: string) {
  const trimmed = fileText.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function assertStepUploadFileText(fileText: string) {
  if (!looksLikeStepExchangeFile(fileText) && !looksLikeJsonFixture(fileText)) {
    throw new CadImportError("STEP upload could not be read. Export a STEP AP203/AP214/AP242 file and try again.", 422);
  }
}

export function assertStepUploadSize(fileText: string, maxBytes = defaultStepUploadMaxBytes) {
  if (Buffer.byteLength(fileText, "utf8") > maxBytes) {
    throw new CadImportError(
      `STEP file is larger than the ${formatStepUploadLimit(maxBytes)} upload limit. Export a smaller assembly or ask an admin to raise CAD_STEP_UPLOAD_MAX_BYTES.`,
      413,
    );
  }
}

export function assertValidStepUpload(input: {
  fileName: string;
  fileText: string;
  mimeType?: string;
  maxBytes?: number;
}) {
  assertStepUploadFilename(input.fileName);
  assertStepUploadMimeType(input.mimeType);
  assertStepUploadSize(input.fileText, input.maxBytes);
  assertStepUploadFileText(input.fileText);
}
