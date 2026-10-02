import { existsSync, linkSync, readFileSync, unlinkSync } from "node:fs";
import { mkdir, rename as renameAsync, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { taskRecordTargetsSchema } from "../domain/taskTargets";
import type { PlatformSnapshot } from "../domain/types";
import { artifactSchema, materialSchema, partDefinitionSchema, partInstanceSchema, purchaseItemSchema, reportSchema, riskSchema, taskSchema, testResultSchema, subsystemSchema, milestoneSchema, meetingSchema } from "../routes/routeSchemas";

export const PLATFORM_SNAPSHOT_SCHEMA_VERSION = 1 as const;

const snapshotCollectionKeys = [
  "seasons", "projects", "workTypes", "responsibleGroups", "workstreams", "vendors", "members", "subsystems", "mechanisms",
  "materials", "artifacts", "partDefinitions", "partInstances", "tasks", "milestones",
  "milestoneRequirements", "taskDependencies", "qaReports", "qaRequests",
  "testResults", "qaFindings", "testFindings", "teamReports", "designIterations", "risks", "workLogs", "meetings",
  "attendanceRecords", "events", "manufacturingProcesses", "purchaseItems", "escalations", "actions",
] as const satisfies readonly (keyof PlatformSnapshot)[];
type UnvalidatedSnapshotKeys = Exclude<keyof PlatformSnapshot, (typeof snapshotCollectionKeys)[number] | "snapshotSchemaVersion">;
type AssertNever<T extends never> = T;
type _AssertAllSnapshotCollectionsAreListed = AssertNever<UnvalidatedSnapshotKeys>;

const optionalSnapshotCollectionKeys = new Set<keyof PlatformSnapshot>([
  "milestoneRequirements", "qaRequests", "actions",
]);
const rowSchemas: Partial<Record<keyof PlatformSnapshot, z.ZodType>> = {
  members: z.object({
    id: z.string(), name: z.string(), email: z.string(), photoUrl: z.string().optional(),
    role: z.enum(["student", "lead", "mentor", "admin", "external"]), elevated: z.boolean(), seasonId: z.string(),
    activeSeasonIds: z.array(z.string()).optional(), plannedWeeklyAttendanceHours: z.number().optional(),
    plannedAttendanceDays: z.array(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])).optional(),
    plannedAttendanceNotes: z.string().optional(),
  }).strict(),
  projects: z.object({ id: z.string(), teamId: z.string(), seasonId: z.string(), name: z.enum(["Robot", "Media", "Outreach", "Operations", "Strategy", "Training"]), projectType: z.enum(["robot", "media", "outreach", "operations", "strategy", "training"]), description: z.string(), status: z.enum(["planned", "active", "paused", "complete"]) }).strict(),
  responsibleGroups: z.object({ id: z.string(), seasonId: z.string(), name: z.string(), projectIds: z.array(z.string()), workTypeIds: z.array(z.string()).default([]), memberIds: z.array(z.string()), primaryMemberIds: z.array(z.string()).default([]), isArchived: z.boolean() }).strict(),
  tasks: taskSchema.passthrough().extend({ id: z.string() }),
  subsystems: subsystemSchema.extend({ id: z.string(), isCore: z.boolean() }).strict(),
  milestones: milestoneSchema.extend({ id: z.string(), seasonId: z.string().optional() }).strict(),
  meetings: meetingSchema.extend({ id: z.string(), rsvpsYes: z.number(), rsvpsMaybe: z.number(), openSignIns: z.number() }).strict(),
  artifacts: artifactSchema.extend({ id: z.string() }).strict(),
  materials: materialSchema.extend({ id: z.string() }).strict(),
  partDefinitions: partDefinitionSchema.extend({ id: z.string() }).strict(),
  partInstances: partInstanceSchema.extend({ id: z.string() }).strict(),
  purchaseItems: purchaseItemSchema.extend({ id: z.string() }).strict(),
  risks: riskSchema.extend({ id: z.string(), createdAt: z.string(), updatedAt: z.string(), resolvedAt: z.string().nullable() }).strict(),
  qaReports: reportSchema.options[0].extend({ id: z.string() }).strict(),
  teamReports: reportSchema.options[1].extend({ id: z.string() }).strict(),
  testResults: testResultSchema.extend({ id: z.string(), projectId: z.string(), targetRefs: z.array(z.object({ kind: z.string(), id: z.string() })) }).strict(),
  qaFindings: z.object({ id: z.string(), reportId: z.string().nullable(), targetRefs: z.array(z.object({ kind: z.string(), id: z.string() })), projectId: z.string(), title: z.string(), detail: z.string(), severity: z.enum(["critical", "high", "medium", "low"]), status: z.enum(["open", "in-progress", "resolved"]), createdAt: z.string(), updatedAt: z.string() }).strict(),
  testFindings: z.object({ id: z.string(), reportId: z.string().nullable(), testResultId: z.string(), targetRefs: z.array(z.object({ kind: z.string(), id: z.string() })), projectId: z.string(), title: z.string(), detail: z.string(), severity: z.enum(["critical", "high", "medium", "low"]), status: z.enum(["open", "in-progress", "resolved"]), createdAt: z.string(), updatedAt: z.string() }).strict(),
  designIterations: z.object({ id: z.string(), sourceType: z.enum(["qa", "test"]), findingId: z.string(), projectId: z.string(), targetRefs: z.array(z.object({ kind: z.string(), id: z.string() })), notes: z.string(), status: z.enum(["planned", "in-progress", "complete"]), createdAt: z.string(), updatedAt: z.string() }).strict(),
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
  const collectionsValid = snapshot.snapshotSchemaVersion === PLATFORM_SNAPSHOT_SCHEMA_VERSION && snapshotCollectionKeys.every((key) => {
    const collection = snapshot[key];
    if (optionalSnapshotCollectionKeys.has(key) && collection === undefined) return true;
    if (!Array.isArray(collection)) return false;
    const schema = rowSchemas[key];
    return collection.every((record) => typeof record === "object" && record !== null && !Array.isArray(record) && typeof (record as { id?: unknown }).id === "string" && (!schema || schema.safeParse(record).success));
  });
  if (!collectionsValid) return false;
  const projectNames = { robot: "Robot", media: "Media", outreach: "Outreach", operations: "Operations", strategy: "Strategy", training: "Training" } as const;
  const projects = snapshot.projects as PlatformSnapshot["projects"];
  const projectKeys = new Set<string>();
  for (const project of projects) {
    if (project.name !== projectNames[project.projectType]) return false;
    const key = `${project.seasonId}:${project.projectType}`;
    if (projectKeys.has(key)) return false;
    projectKeys.add(key);
  }
  const seasons = snapshot.seasons as PlatformSnapshot["seasons"];
  return seasons.every((season) => (["robot", "media", "outreach", "operations", "strategy", "training"] as const).every((type) => projectKeys.has(`${season.id}:${type}`)));
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
