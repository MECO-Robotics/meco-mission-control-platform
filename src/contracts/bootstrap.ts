import { z } from "zod";
import { subsystemLayoutSchema, qaReassessmentSchema, taskDependencySchema, taskSchema, taskPatchSchema, subsystemSchema, subsystemPatchSchema, reportSchema, qaReportSchema, taskBlockerSchema } from "../routes/routeSchemas";

export const BOOTSTRAP_CONTRACT_NAME = "meco-mission-control-platform-bootstrap";
export const BOOTSTRAP_CONTRACT_VERSION = 1;

const bootstrapCollectionSchema = z.array(z.record(z.string(), z.unknown()));
const pmCadSourceValues = ["manual", "step", "onshape"] as const;
const pmCadImportSourceValues = [
  "MANUAL",
  "STEP_UPLOAD",
  "ONSHAPE_API",
  "ONSHAPE_BOM_CSV",
  "MANUAL_BOM_CSV",
] as const;
const pmCadProvenanceRecordSchema = z
  .object({
    cadSource: z.enum(pmCadSourceValues),
    cadImportSource: z.enum(pmCadImportSourceValues),
    cadEditedAfterImport: z.boolean(),
    cadSourceLabel: z.string().optional(),
    cadUpdatedAt: z.string().nullable().optional(),
  })
  .passthrough();
const pmCadProvenanceCollectionSchema = z.array(pmCadProvenanceRecordSchema);

export const bootstrapPayloadSchema = z
  .object({
    seasons: bootstrapCollectionSchema,
    projects: bootstrapCollectionSchema,
    workstreams: bootstrapCollectionSchema,
    members: bootstrapCollectionSchema,
    subsystems: z.array(pmCadProvenanceRecordSchema.extend({ id: z.string(), ...subsystemLayoutSchema.shape })),
    disciplines: bootstrapCollectionSchema,
    mechanisms: pmCadProvenanceCollectionSchema,
    materials: bootstrapCollectionSchema,
    artifacts: bootstrapCollectionSchema,
    partDefinitions: pmCadProvenanceCollectionSchema,
    partInstances: pmCadProvenanceCollectionSchema,
    milestones: bootstrapCollectionSchema,
    milestoneRequirements: bootstrapCollectionSchema,
    reports: z.array(qaReassessmentSchema.extend({ id: z.string(), reportType: z.enum(["QA", "MilestoneTest"]) }).passthrough()),
    reportFindings: bootstrapCollectionSchema,
    qaReports: z.array(qaReassessmentSchema.extend({ id: z.string(), taskId: z.string(), mentorApproved: z.boolean(), reviewedAt: z.string() }).passthrough()),
    qaRequests: bootstrapCollectionSchema,
    testResults: bootstrapCollectionSchema,
    risks: bootstrapCollectionSchema,
    tasks: z.array(z.object({ id: z.string(), status: taskSchema.shape.status, checklistItems: z.array(z.string()), blockers: z.array(z.string()), isBlocked: z.boolean(), isWaitingOnDependency: z.boolean() }).passthrough()),
    taskDependencies: z.array(taskDependencySchema.extend({ id: z.string(), createdAt: z.string() })),
    taskBlockers: bootstrapCollectionSchema,
    workLogs: bootstrapCollectionSchema,
    meetings: bootstrapCollectionSchema,
    attendanceRecords: bootstrapCollectionSchema,
    manufacturingItems: bootstrapCollectionSchema,
    purchaseItems: bootstrapCollectionSchema,
    qaReviews: bootstrapCollectionSchema,
    escalations: bootstrapCollectionSchema,
    actions: bootstrapCollectionSchema,
    favoriteViews: bootstrapCollectionSchema,
    designIterations: bootstrapCollectionSchema.optional(),
  })
  .strict();

export const bootstrapContractDocument = {
  ...z.toJSONSchema(bootstrapPayloadSchema),
  $id: "https://contracts.meco.ai/platform/bootstrap-v1.schema.json",
  title: "MissionControlPlatformBootstrapContract",
  description: "Current bootstrap contract. Task/dependency and QA/layout records are validated; remaining collections retain collection-shape agreement.",
  x_contract: {
    contractName: BOOTSTRAP_CONTRACT_NAME,
    contractVersion: BOOTSTRAP_CONTRACT_VERSION,
    resource: "/api/bootstrap",
    migrationPolicy: "Prototype contracts are replaced in coordination with both clients; no legacy payload support.",
  },
  x_commands: Object.fromEntries(Object.entries({ task: taskSchema, taskPatch: taskPatchSchema, subsystem: subsystemSchema, subsystemPatch: subsystemPatchSchema, report: reportSchema, qaReport: qaReportSchema, taskDependency: taskDependencySchema, taskBlocker: taskBlockerSchema }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: "input" })])),
};

export function toBootstrapContractDocument() {
  return bootstrapContractDocument;
}
