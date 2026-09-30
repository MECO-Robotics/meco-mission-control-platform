import { z } from "zod";
import { subsystemLayoutSchema, qaReassessmentSchema, taskDependencySchema, taskSchema, taskPatchSchema, subsystemSchema, subsystemPatchSchema, reportSchema, qaReportSchema, qaSubmitSchema, riskSchema, purchaseItemSchema, artifactSchema, qaRequestSchema, testResultSchema, domainReferenceSchema } from "../routes/routeSchemas";

export const BOOTSTRAP_CONTRACT_NAME = "meco-mission-control-platform-bootstrap";
export const BOOTSTRAP_CONTRACT_VERSION = 1;

const [taskDependencyOption, milestoneDependencyOption, partDependencyOption] = taskDependencySchema.options;
const dependencyRecordFields = { id: z.string(), createdAt: z.string() };
const taskDependencyRecordSchema = z.discriminatedUnion("kind", [
  taskDependencyOption.extend(dependencyRecordFields),
  milestoneDependencyOption.extend(dependencyRecordFields),
  partDependencyOption.extend(dependencyRecordFields),
]);

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
const projectTypeSchema = z.enum(["robot", "media", "outreach", "operations", "strategy", "training"]);
const workTypeSchema = z.object({ id: z.string(), projectType: projectTypeSchema, code: z.string(), name: z.string(), isActive: z.boolean() }).strict();
const responsibleGroupSchema = z.object({ id: z.string(), seasonId: z.string(), name: z.string(), projectIds: z.array(z.string()), memberIds: z.array(z.string()), isArchived: z.boolean() }).strict();
const vendorSchema = z.object({ id: z.string(), name: z.string(), website: z.string().nullable(), isArchived: z.boolean() }).strict();
const manufacturingProcessRecordSchema = z.object({ id: z.string(), code: z.string(), name: z.string(), isActive: z.boolean() }).strict();
const partInstanceLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stock"), location: z.string() }).strict(),
  z.object({ kind: z.literal("installed"), subsystemId: z.string(), mechanismId: z.string().nullable() }).strict(),
  z.object({ kind: z.literal("repair"), location: z.string() }).strict(),
  z.object({ kind: z.literal("retired"), location: z.string().nullable() }).strict(),
  z.object({ kind: z.literal("lost") }).strict(),
  z.object({ kind: z.literal("unlocated") }).strict(),
]);
const partInstanceBootstrapSchema = z.object({
  id: z.string(), partDefinitionId: z.string(), intendedSubsystemId: z.string().nullable(),
  intendedMechanismId: z.string().nullable(), location: partInstanceLocationSchema,
  readinessStatus: z.enum(["not-ready", "blocked", "qa", "ready"]).optional(),
  photoUrl: z.string().optional(), ...pmCadProvenanceRecordSchema.shape,
}).strict();
const materialBootstrapSchema = z.object({
  id: z.string(), name: z.string(), category: z.enum(["metal", "plastic", "filament", "electronics", "hardware", "consumable", "other"]),
  unit: z.string(), onHandQuantity: z.number(), reorderPoint: z.number(), location: z.string(), preferredVendorId: z.string().nullable(), notes: z.string(), photoUrl: z.string().optional(),
}).strict();
const partDefinitionBootstrapSchema = z.object({
  id: z.string(), seasonId: z.string(), activeSeasonIds: z.array(z.string()), name: z.string(), partNumber: z.string(), revision: z.string(), iteration: z.number(), isArchived: z.boolean(), isHardware: z.boolean().optional(), type: z.string(), defaultAcquisitionMethod: z.enum(["stock", "purchase-cots", "manufacture"]), materialId: z.string().nullable(), description: z.string(), photoUrl: z.string().optional(), ...pmCadProvenanceRecordSchema.shape,
}).strict();
const scheduleReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("meeting"), id: z.string() }).strict(),
  z.object({ kind: z.literal("event"), id: z.string() }).strict(),
  z.object({ kind: z.literal("milestone"), id: z.string() }).strict(),
]);
const manufacturingDetailsSchema = z.object({
  part: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("part-definition"), partDefinitionId: z.string() }).strict(),
    z.object({ kind: z.literal("provisional"), partNumber: z.string(), revision: z.string() }).strict(),
  ]),
  quantity: z.number().positive(),
  processId: z.string(),
  fulfillmentSource: z.enum(["in-house", "outsourced"]),
  material: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("inventory-material"), materialId: z.string() }).strict(),
    z.object({ kind: z.literal("specified-material"), name: z.string() }).strict(),
  ]),
  fileArtifactIds: z.array(z.string()),
  tolerances: z.array(z.string()),
  qaRequirements: z.array(z.string()),
  batchLabel: z.string().optional(),
}).strict();
const taskBootstrapSchema = z.object({
  id: z.string(), createdAt: z.string().optional(), serialNumber: z.number().optional(), serial: z.string().optional(),
  projectId: z.string(), workTypeId: z.string(), responsibleGroupId: z.string().nullable(), workstreamIds: z.array(z.string()),
  title: z.string(), summary: z.string(), photoUrl: z.string().optional(), subsystemIds: z.array(z.string()),
  mechanismIds: z.array(z.string()), partInstanceIds: z.array(z.string()), scheduleRefs: z.array(scheduleReferenceSchema),
  requestedById: z.string().nullable(), ownerId: z.string().nullable(), assigneeIds: z.array(z.string()), mentorId: z.string().nullable(),
  startDate: z.string(), dueDate: z.string(), priority: z.enum(["critical", "high", "medium", "low"]),
  status: taskSchema.shape.status, checklistItems: z.array(z.string()), estimatedHours: z.number(), actualHours: z.number(),
  requiresDocumentation: z.boolean(), manufacturingDetails: manufacturingDetailsSchema.nullable(),
  isBlocked: z.boolean(), isWaitingOnDependency: z.boolean(),
}).strict();
const artifactBootstrapSchema = artifactSchema.extend({ id: z.string(), targetRefs: z.array(domainReferenceSchema) }).strict();
const qaRequestBootstrapSchema = qaRequestSchema.extend({ id: z.string(), projectId: z.string(), targetRefs: z.array(domainReferenceSchema), createdAt: z.string(), status: z.literal("requested") }).strict();
const testResultBootstrapSchema = testResultSchema.extend({ id: z.string(), projectId: z.string(), targetRefs: z.array(domainReferenceSchema) }).strict();
const findingBootstrapSchema = z.object({ id: z.string(), targetRefs: z.array(domainReferenceSchema), taskId: z.string().nullable(), projectId: z.string(), title: z.string(), detail: z.string(), severity: z.enum(["critical", "high", "medium", "low"]), status: z.enum(["open", "accepted", "resolved"]), createdAt: z.string() }).passthrough();

export const bootstrapPayloadSchema = z
  .object({
    seasons: bootstrapCollectionSchema,
    projects: z.array(z.object({ id: z.string(), teamId: z.string(), seasonId: z.string(), name: z.string(), projectType: projectTypeSchema, description: z.string(), status: z.enum(["planned", "active", "paused", "complete"]) }).strict()),
    workTypes: z.array(workTypeSchema),
    responsibleGroups: z.array(responsibleGroupSchema),
    workstreams: bootstrapCollectionSchema,
    vendors: z.array(vendorSchema),
    members: bootstrapCollectionSchema,
    subsystems: z.array(pmCadProvenanceRecordSchema.extend({ id: z.string(), ...subsystemLayoutSchema.shape })),
    mechanisms: pmCadProvenanceCollectionSchema,
    materials: z.array(materialBootstrapSchema),
    artifacts: z.array(artifactBootstrapSchema),
    partDefinitions: z.array(partDefinitionBootstrapSchema),
    partInstances: z.array(partInstanceBootstrapSchema),
    milestones: bootstrapCollectionSchema,
    milestoneRequirements: bootstrapCollectionSchema,
    reports: z.array(qaReassessmentSchema.extend({ id: z.string(), reportType: z.enum(["QA", "MilestoneTest"]), targetRefs: z.array(domainReferenceSchema) }).passthrough()),
    qaRequests: z.array(qaRequestBootstrapSchema),
    qaFindings: z.array(findingBootstrapSchema),
    testResults: z.array(testResultBootstrapSchema),
    testFindings: z.array(findingBootstrapSchema),
    risks: z.array(riskSchema.extend({ id: z.string(), createdAt: z.string(), updatedAt: z.string(), resolvedAt: z.string().nullable() }).strict()),
    tasks: z.array(taskBootstrapSchema),
    taskDependencies: z.array(taskDependencyRecordSchema),
    workLogs: bootstrapCollectionSchema,
    meetings: bootstrapCollectionSchema,
    events: bootstrapCollectionSchema,
    manufacturingProcesses: z.array(manufacturingProcessRecordSchema),
    attendanceRecords: bootstrapCollectionSchema,
    purchaseItems: z.array(purchaseItemSchema.extend({ id: z.string() }).strict()),
    actions: bootstrapCollectionSchema,
    designIterations: bootstrapCollectionSchema.optional(),
  })
  .strict();

export const bootstrapContractDocument = {
  ...z.toJSONSchema(bootstrapPayloadSchema),
  $id: "https://contracts.meco.ai/platform/bootstrap-v1.schema.json",
  title: "MissionControlPlatformBootstrapContract",
  description: "Current bootstrap contract with target FRC domain identities and strict domain-owned collections.",
  x_contract: {
    contractName: BOOTSTRAP_CONTRACT_NAME,
    contractVersion: BOOTSTRAP_CONTRACT_VERSION,
    resource: "/api/bootstrap",
    migrationPolicy: "Prototype contracts are replaced in coordination with both clients; no legacy payload support.",
  },
  x_commands: Object.fromEntries(Object.entries({ task: taskSchema, taskPatch: taskPatchSchema, subsystem: subsystemSchema, subsystemPatch: subsystemPatchSchema, report: reportSchema, qaReport: qaReportSchema, qaSubmit: qaSubmitSchema, risk: riskSchema, purchaseItem: purchaseItemSchema, taskDependency: taskDependencySchema }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: "input" })])),
};

export function toBootstrapContractDocument() {
  return bootstrapContractDocument;
}
