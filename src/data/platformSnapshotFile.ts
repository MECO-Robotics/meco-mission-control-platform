import { existsSync, linkSync, readFileSync, unlinkSync } from "node:fs";
import { mkdir, rename as renameAsync, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { taskRecordTargetsSchema } from "../domain/taskTargets";
import type { PlatformSnapshot } from "../domain/types";
import { artifactSchema, materialSchema, partDefinitionSchema, partInstanceSchema, purchaseItemSchema, qaReportSchema, riskSchema, taskSchema, testResultSchema } from "../routes/routeSchemas";

export const PLATFORM_SNAPSHOT_SCHEMA_VERSION = 2 as const;

const snapshotCollectionKeys = [
  "seasons", "projects", "workTypes", "responsibleGroups", "workstreams", "vendors", "members", "subsystems", "mechanisms",
  "materials", "artifacts", "partDefinitions", "partInstances", "tasks", "milestones",
  "milestoneRequirements", "taskDependencies", "qaReports", "qaRequests",
  "testResults", "qaFindings", "testFindings", "designIterations", "risks", "workLogs", "meetings",
  "attendanceRecords", "events", "manufacturingProcesses", "purchaseItems", "qaReviews", "escalations", "actions",
] as const satisfies readonly (keyof PlatformSnapshot)[];
type UnvalidatedSnapshotKeys = Exclude<keyof PlatformSnapshot, (typeof snapshotCollectionKeys)[number] | "snapshotSchemaVersion">;
type AssertNever<T extends never> = T;
type _AssertAllSnapshotCollectionsAreListed = AssertNever<UnvalidatedSnapshotKeys>;

const optionalSnapshotCollectionKeys = new Set<keyof PlatformSnapshot>([
  "milestoneRequirements", "qaRequests", "actions",
]);
const rowSchemas: Partial<Record<keyof PlatformSnapshot, z.ZodType>> = {
  tasks: taskSchema.passthrough().extend({ id: z.string() }),
  artifacts: artifactSchema.extend({ id: z.string() }).strict(),
  materials: materialSchema.extend({ id: z.string() }).strict(),
  partDefinitions: partDefinitionSchema.extend({ id: z.string() }).strict(),
  partInstances: partInstanceSchema.extend({ id: z.string() }).strict(),
  purchaseItems: purchaseItemSchema.extend({ id: z.string() }).strict(),
  risks: riskSchema.extend({ id: z.string(), createdAt: z.string(), updatedAt: z.string(), resolvedAt: z.string().nullable() }).strict(),
  qaReports: qaReportSchema.extend({
    id: z.string(), targetRefs: z.array(z.object({ kind: z.string(), id: z.string() })),
    evidenceNotes: z.string().optional(), qaRequestId: z.string().nullable().optional(),
    mentorId: z.string().nullable().optional(), requestedById: z.string().nullable().optional(),
    targetRiskId: z.string().nullable().optional(), proposedRiskSeverity: z.string().nullable().optional(),
    proposedRiskStatus: z.string().nullable().optional(),
  }).passthrough(),
  testResults: testResultSchema.extend({ id: z.string(), projectId: z.string(), targetRefs: z.array(z.object({ kind: z.string(), id: z.string() })) }).strict(),
};

export class IncompatibleSnapshotError extends Error {
  constructor(readonly reportedVersion: unknown, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IncompatibleSnapshotError";
  }
}

function looksLikePlatformSnapshot(value: unknown): value is PlatformSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const snapshot = value as Partial<Record<keyof PlatformSnapshot, unknown>>;
  return snapshot.snapshotSchemaVersion === PLATFORM_SNAPSHOT_SCHEMA_VERSION && snapshotCollectionKeys.every((key) => {
    const collection = snapshot[key];
    if (optionalSnapshotCollectionKeys.has(key) && collection === undefined) return true;
    if (!Array.isArray(collection)) return false;
    const schema = rowSchemas[key];
    return collection.every((record) => typeof record === "object" && record !== null && !Array.isArray(record) && typeof (record as { id?: unknown }).id === "string" && (!schema || schema.safeParse(record).success));
  });
}

export function loadPlatformSnapshotFile(path: string): PlatformSnapshot | null {
  if (!existsSync(path)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new IncompatibleSnapshotError("unknown", `Platform snapshot at ${path} is not valid JSON.`, { cause: error });
  }

  const version = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).snapshotSchemaVersion
    : undefined;
  if (version !== PLATFORM_SNAPSHOT_SCHEMA_VERSION) {
    throw new IncompatibleSnapshotError(version ?? "missing/unknown", `Platform snapshot schema ${String(version ?? "missing/unknown")} is incompatible with supported schema ${PLATFORM_SNAPSHOT_SCHEMA_VERSION}.`);
  }
  if (!looksLikePlatformSnapshot(parsed)) {
    throw new IncompatibleSnapshotError(version, `Platform snapshot at ${path} does not match schema ${PLATFORM_SNAPSHOT_SCHEMA_VERSION}.`);
  }
  if (!parsed.tasks.every((task) => taskRecordTargetsSchema.safeParse(task).success)) {
    throw new IncompatibleSnapshotError(version, `Platform snapshot at ${path} contains unsupported Task targets.`);
  }
  return parsed;
}

function archivePath(path: string, suffix: string) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const base = `${path}.${suffix}-${timestamp}`;
  let candidate = `${base}.json`;
  let index = 1;
  while (existsSync(candidate)) candidate = `${base}-${index++}.json`;
  return candidate;
}

export function archivePlatformSnapshotFile(path: string, suffix = "reset") {
  if (!existsSync(path)) return null;
  const archive = archivePath(path, suffix);
  linkSync(path, archive);
  unlinkSync(path);
  return archive;
}

export function loadOrArchiveIncompatibleSnapshot(path: string): PlatformSnapshot | null {
  try {
    return loadPlatformSnapshotFile(path);
  } catch (error) {
    if (!(error instanceof IncompatibleSnapshotError)) throw error;
    const archivedPath = archivePlatformSnapshotFile(path, `incompatible-v${String(error.reportedVersion).replace(/[^a-zA-Z0-9_-]/g, "-")}`);
    if (!archivedPath) throw error;
    console.error(`${error.message} Archived unchanged at ${archivedPath}. Startup is continuing with a clean canonical seed; run npm run snapshot:reset to reset it explicitly.`);
    return null;
  }
}

export function assertSnapshotTaskTargets(snapshot: Pick<PlatformSnapshot, "tasks">) {
  if (!snapshot.tasks.every((task) => taskRecordTargetsSchema.safeParse(task).success)) {
    throw new Error("Unsupported task targets in platform snapshot. Stop the app and run npm run snapshot:reset to archive it and bootstrap canonical development state.");
  }
}

export async function savePlatformSnapshotFile(path: string, snapshot: PlatformSnapshot) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await renameAsync(temporaryPath, path);
}
