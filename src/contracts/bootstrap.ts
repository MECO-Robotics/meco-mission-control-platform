import { z } from "zod";
import { subsystemLayoutSchema, taskDependencySchema, taskSchema, taskPatchSchema, subsystemSchema, subsystemPatchSchema, reportSchema, qaReportSchema, qaSubmitSchema, riskSchema, purchaseItemSchema, artifactSchema, qaRequestSchema, testResultSchema, domainReferenceSchema, manufacturingProcessCreateSchema, manufacturingProcessArchiveSchema } from "../routes/routeSchemas";

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
const projectNameSchema = z.enum(["Robot", "Media", "Outreach", "Operations", "Strategy", "Training"]);
const workTypeSchema = z.object({ id: z.string(), projectType: projectTypeSchema, code: z.string(), name: z.string(), isActive: z.boolean() }).strict();
const responsibleGroupSchema = z.object({ id: z.string(), seasonId: z.string(), name: z.string(), projectIds: z.array(z.string()), workTypeIds: z.array(z.string()), memberIds: z.array(z.string()), primaryMemberIds: z.array(z.string()), isArchived: z.boolean() }).strict();
const memberBootstrapSchema = z.object({ id: z.string() }).passthrough();
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
const qaRequestBootstrapSchema = qaRequestSchema.extend({ id: z.string(), projectId: z.string(), targetRefs: z.array(domainReferenceSchema), createdAt: z.string().datetime({ offset: true }), status: z.enum(["requested", "in-review", "complete", "cancelled"]) }).strict();
const testResultBootstrapSchema = testResultSchema.extend({ id: z.string(), projectId: z.string(), targetRefs: z.array(domainReferenceSchema) }).strict();
const findingBootstrapSchema = z.object({ id: z.string(), reportId: z.string().nullable(), targetRefs: z.array(domainReferenceSchema), projectId: z.string(), title: z.string(), detail: z.string(), severity: z.enum(["critical", "high", "medium", "low"]), status: z.enum(["open", "in-progress", "resolved"]), createdAt: z.string(), updatedAt: z.string() }).strict();
const scheduleIdentitySchema = z.object({ id: z.string(), title: z.string(), startAt: z.string(), endAt: z.string().nullable() });
const meetingBootstrapSchema = scheduleIdentitySchema.extend({ meetingType: z.string().optional(), seasonId: z.string().optional(), projectIds: z.array(z.string()).optional(), location: z.string().optional(), description: z.string().optional(), rsvpsYes: z.number(), rsvpsMaybe: z.number(), openSignIns: z.number() }).passthrough();
const eventBootstrapSchema = scheduleIdentitySchema.extend({ seasonId: z.string(), projectIds: z.array(z.string()), eventType: z.string(), location: z.string().optional(), description: z.string().optional() }).passthrough();
const milestoneBootstrapSchema = scheduleIdentitySchema.extend({ seasonId: z.string().optional(), type: z.string(), status: z.enum(["planned", "active", "complete"]), readinessStatus: z.enum(["not-ready", "blocked", "qa", "ready"]), isExternal: z.boolean(), description: z.string(), projectIds: z.array(z.string()), photoUrl: z.string().optional() }).passthrough();
const milestoneRequirementBootstrapSchema = z.object({
  id: z.string(),
  milestoneId: z.string(),
  targetRefs: z.array(domainReferenceSchema),
  conditionType: z.enum(["iteration", "workflow-state", "custom"]),
  conditionValue: z.string(),
  required: z.boolean(),
  sortOrder: z.number(),
  notes: z.string(),
}).strict();

export const bootstrapPayloadSchema = z
  .object({
    seasons: bootstrapCollectionSchema,
    projects: z.array(z.object({ id: z.string(), teamId: z.string(), seasonId: z.string(), name: projectNameSchema, projectType: projectTypeSchema, description: z.string(), status: z.enum(["planned", "active", "paused", "complete"]) }).strict()),
    workTypes: z.array(workTypeSchema),
    responsibleGroups: z.array(responsibleGroupSchema),
    workstreams: bootstrapCollectionSchema,
    vendors: z.array(vendorSchema),
    members: z.array(memberBootstrapSchema),
    subsystems: z.array(pmCadProvenanceRecordSchema.extend({ id: z.string(), ...subsystemLayoutSchema.shape })),
    mechanisms: pmCadProvenanceCollectionSchema,
    materials: z.array(materialBootstrapSchema),
    artifacts: z.array(artifactBootstrapSchema),
    partDefinitions: z.array(partDefinitionBootstrapSchema),
    partInstances: z.array(partInstanceBootstrapSchema),
    milestones: z.array(milestoneBootstrapSchema),
    milestoneRequirements: z.array(milestoneRequirementBootstrapSchema),
    reports: z.array(z.union([reportSchema.options[0].extend({ id: z.string() }), reportSchema.options[1].extend({ id: z.string() })])),
    qaRequests: z.array(qaRequestBootstrapSchema),
    qaFindings: z.array(findingBootstrapSchema),
    testResults: z.array(testResultBootstrapSchema),
    testFindings: z.array(findingBootstrapSchema.extend({ testResultId: z.string() }).strict()),
    risks: z.array(riskSchema.extend({ id: z.string(), createdAt: z.string(), updatedAt: z.string(), resolvedAt: z.string().nullable() }).strict()),
    tasks: z.array(taskBootstrapSchema),
    taskDependencies: z.array(taskDependencyRecordSchema),
    workLogs: bootstrapCollectionSchema,
    meetings: z.array(meetingBootstrapSchema),
    events: z.array(eventBootstrapSchema),
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
  x_commands: Object.fromEntries(Object.entries({ task: taskSchema, taskPatch: taskPatchSchema, subsystem: subsystemSchema, subsystemPatch: subsystemPatchSchema, report: reportSchema, qaReport: qaReportSchema, qaSubmit: qaSubmitSchema, risk: riskSchema, purchaseItem: purchaseItemSchema, taskDependency: taskDependencySchema, manufacturingProcessCreate: manufacturingProcessCreateSchema, manufacturingProcessArchive: manufacturingProcessArchiveSchema }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: "input" })])),
};

export function toBootstrapContractDocument() {
  return bootstrapContractDocument;
}
