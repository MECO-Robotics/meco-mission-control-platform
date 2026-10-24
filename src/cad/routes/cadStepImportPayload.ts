import type { FastifyRequest } from "fastify";

import { cadStepUploadConfig } from "../../config/env";
import { CadImportError } from "../cadImportService";
import { cadStepImportJsonSchema } from "../cadRouteSchemas";
import { assertValidStepUpload, formatStepUploadLimit } from "../validation/stepUploadValidation";

const maxStepUploadBytes = cadStepUploadConfig.maxBytes;

interface StepImportPayload {
  fileName: string;
  fileText: string;
  label?: string;
  projectId?: string | null;
  seasonId?: string | null;
  requestedBy?: string | null;
  allowPlaceholder?: boolean;
  originalFileBytes: Buffer;
  optimizedModel?: { filename: string; contentType: string; bytes: Buffer };
}

function isMultipartFileTooLargeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

async function consumeMultipartFile(part: { toBuffer?: () => Promise<Buffer> }) {
  if (part.toBuffer) {
    await part.toBuffer();
  }
}

function optionalMultipartField(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalMultipartBoolean(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  return trimmed;
}

export async function readStepImportPayload(request: FastifyRequest): Promise<StepImportPayload> {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const parsed = cadStepImportJsonSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new CadImportError("STEP import payload is invalid.");
    }
    assertValidStepUpload({ fileName: parsed.data.fileName, fileText: parsed.data.fileText, maxBytes: maxStepUploadBytes });
    return { ...parsed.data, originalFileBytes: Buffer.from(parsed.data.fileText, "utf8") };
  }

  const multipartRequest = request as FastifyRequest & {
    parts: (options?: unknown) => AsyncIterable<{
      type: "file" | "field";
      fieldname: string;
      filename: string;
      mimetype?: string;
      value?: unknown;
      toBuffer?: () => Promise<Buffer>;
    }>;
  };

  try {
    const fields: Record<string, string> = {};
    let fileName: string | null = null;
    let mimeType: string | undefined;
    let fileText: string | null = null;
    let originalFileBytes: Buffer | null = null;
    let optimizedModel: { filename: string; contentType: string; bytes: Buffer } | undefined;

    for await (const part of multipartRequest.parts({ limits: { fileSize: maxStepUploadBytes, files: 2 } })) {
      if (part.type === "field") {
        if (typeof part.value === "string") {
          fields[part.fieldname] = part.value;
        }
        continue;
      }
      if (!part.toBuffer) {
        await consumeMultipartFile(part);
        continue;
      }
      const buffer = await part.toBuffer();
      if (part.fieldname === "file") {
        mimeType = part.mimetype;
        fileName = part.filename;
        fileText = buffer.toString("utf8");
        originalFileBytes = buffer;
      } else if (part.fieldname === "optimizedModel") {
        optimizedModel = { filename: part.filename, contentType: part.mimetype ?? "", bytes: buffer };
      }
    }

    if (!fileName || fileText === null) {
      throw new CadImportError("STEP import requires a file.");
    }

    const parsed = cadStepImportJsonSchema.safeParse({
      fileName,
      fileText,
      label: optionalMultipartField(fields.label),
      projectId: optionalMultipartField(fields.projectId),
      seasonId: optionalMultipartField(fields.seasonId),
      requestedBy: optionalMultipartField(fields.requestedBy),
      allowPlaceholder: optionalMultipartBoolean(fields.allowPlaceholder),
    });
    if (!parsed.success) {
      throw new CadImportError("STEP import payload is invalid.");
    }
    assertValidStepUpload({ fileName: parsed.data.fileName, fileText: parsed.data.fileText, mimeType, maxBytes: maxStepUploadBytes });
    return {
      ...parsed.data,
      originalFileBytes: originalFileBytes ?? Buffer.from(parsed.data.fileText, "utf8"),
      optimizedModel,
    };
  } catch (error) {
    if (isMultipartFileTooLargeError(error)) {
      throw new CadImportError(
        `STEP file is larger than the ${formatStepUploadLimit(maxStepUploadBytes)} upload limit. Export a smaller assembly or ask an admin to raise CAD_STEP_UPLOAD_MAX_BYTES.`,
        413,
      );
    }
    throw error;
  }
}
