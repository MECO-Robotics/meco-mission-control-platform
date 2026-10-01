import { z } from "zod";
import { taskTargetsSchema } from "../domain/taskTargets";

export const domainReferenceSchema = z.object({
  kind: z.enum(["project", "workstream", "responsible-group", "task", "subsystem", "mechanism", "part-definition", "part-instance", "material", "vendor", "manufacturing-details", "purchase-item", "meeting", "event", "milestone", "qa-request", "test-result", "report", "artifact", "qa-finding", "test-finding", "task-dependency", "risk", "design-iteration"]),
  id: z.string().trim().min(1),
}).strict();

const plannedAttendanceDaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const devBypassSchema = z.object({
  role: z.enum(["student", "mentor"]).default("student"),
}).strict();

const memberFieldsSchema = z.object({
  name: z.string().trim().min(2),
  email: z.union([z.literal(""), z.string().trim().email()]),
  photoUrl: z.string().trim(),
  role: z.enum(["student", "lead", "mentor", "admin", "external"]),
  classYear: z.enum(["freshman", "sophomore", "junior", "senior"]).nullable().optional(),
  elevated: z.boolean(),
  seasonId: z.string().trim().min(1).optional(),
  activeSeasonIds: z.array(z.string().trim().min(1)).optional(),
  plannedWeeklyAttendanceHours: z.coerce.number().min(0).max(80),
  plannedAttendanceDays: z.array(plannedAttendanceDaySchema),
  plannedAttendanceNotes: z.string().trim(),
});

const responsibleGroupFieldsSchema = z.object({
  seasonId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  projectIds: z.array(z.string().trim().min(1)),
  memberIds: z.array(z.string().trim().min(1)),
  isArchived: z.boolean().optional(),
});
export const responsibleGroupSchema = responsibleGroupFieldsSchema;
export const responsibleGroupPatchSchema = responsibleGroupFieldsSchema.partial();

export const memberSchema = memberFieldsSchema.extend({
  email: memberFieldsSchema.shape.email.default(""),
  photoUrl: memberFieldsSchema.shape.photoUrl.default(""),
  elevated: memberFieldsSchema.shape.elevated.default(false),
  plannedWeeklyAttendanceHours: memberFieldsSchema.shape.plannedWeeklyAttendanceHours.default(0),
  plannedAttendanceDays: memberFieldsSchema.shape.plannedAttendanceDays.default([]),
  plannedAttendanceNotes: memberFieldsSchema.shape.plannedAttendanceNotes.default(""),
});

export const memberPatchSchema = memberFieldsSchema.partial();

export const profilePatchSchema = memberPatchSchema.pick({ name: true, email: true, photoUrl: true }).strict();

export const seasonSchema = z.object({
  name: z.string().trim().min(2),
  type: z.enum(["season", "offseason", "initiative"]).default("season"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

const projectFieldsSchema = z.object({
  seasonId: z.string().trim().min(1),
  name: z.enum(["Robot", "Media", "Outreach", "Operations", "Strategy", "Training"]),
  projectType: z.enum(["robot", "media", "outreach", "operations", "strategy", "training"]),
  description: z.string().trim(),
  status: z.enum(["planned", "active", "paused", "complete"]),
});

export const projectSchema = projectFieldsSchema.extend({
  projectType: projectFieldsSchema.shape.projectType.default("robot"),
  description: projectFieldsSchema.shape.description.default(""),
  status: projectFieldsSchema.shape.status.default("active"),
});

export const projectPatchSchema = projectFieldsSchema.pick({ name: true, description: true, status: true }).partial();

const taskFieldsSchema = z.object({
  ...taskTargetsSchema.partial().shape,
  projectId: z.string().trim().min(1).optional(),
  workTypeId: z.string().trim().min(1),
  responsibleGroupId: z.string().trim().min(1).nullable().optional(),
  requestedById: z.string().trim().min(1).nullable().optional(),
  scheduleRefs: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("meeting"), id: z.string().trim().min(1) }).strict(),
    z.object({ kind: z.literal("event"), id: z.string().trim().min(1) }).strict(),
    z.object({ kind: z.literal("milestone"), id: z.string().trim().min(1) }).strict(),
  ])).optional(),
  manufacturingDetails: z.object({
    part: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("part-definition"), partDefinitionId: z.string().trim().min(1) }).strict(),
      z.object({ kind: z.literal("provisional"), partNumber: z.string().trim().min(1), revision: z.string().trim().min(1) }).strict(),
    ]),
    quantity: z.coerce.number().positive(),
    processId: z.string().trim().min(1),
    fulfillmentSource: z.enum(["in-house", "outsourced"]),
    material: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("inventory-material"), materialId: z.string().trim().min(1) }).strict(),
      z.object({ kind: z.literal("specified-material"), name: z.string().trim().min(1) }).strict(),
    ]),
    fileArtifactIds: z.array(z.string().trim().min(1)),
    tolerances: z.array(z.string().trim().min(1)),
    qaRequirements: z.array(z.string().trim().min(1)),
    batchLabel: z.string().trim().min(1).optional(),
  }).strict().nullable().optional(),
  title: z.string().trim().min(3),
  summary: z.string().trim().min(3),
  photoUrl: z.string().trim(),
  ownerId: z.string().trim().min(1).nullable(),
  assigneeIds: z.array(z.string().trim().min(1)),
  mentorId: z.string().trim().min(1).nullable(),
  startDate: z.string().date().optional(),
  dueDate: z.string().date(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["not-started", "in-progress", "waiting-for-qa", "complete"]),
  estimatedHours: z.coerce.number().min(0),
  checklistItems: z.array(z.string().trim().min(1)),
  requiresDocumentation: z.boolean(),
}).strict();

export const taskSchema = taskFieldsSchema.extend({
  responsibleGroupId: taskFieldsSchema.shape.responsibleGroupId.default(null),
  requestedById: taskFieldsSchema.shape.requestedById.default(null),
  scheduleRefs: taskFieldsSchema.shape.scheduleRefs.default([]),
  manufacturingDetails: taskFieldsSchema.shape.manufacturingDetails.default(null),
  photoUrl: taskFieldsSchema.shape.photoUrl.default(""),
  assigneeIds: taskFieldsSchema.shape.assigneeIds.default([]),
  checklistItems: taskFieldsSchema.shape.checklistItems.default([]),
  requiresDocumentation: taskFieldsSchema.shape.requiresDocumentation.default(false),
});

export const taskPatchSchema = taskFieldsSchema.partial();
export const taskClaimSchema = z.object({
  start: z.boolean().optional().default(false),
});
export const taskReassignSchema = z.object({
  ownerId: z.string().trim().min(1).nullable(),
});

const milestoneFieldsSchema = z.object({
  title: z.string().trim().min(2),
  type: z.enum([
    "practice",
    "competition",
    "deadline",
    "internal-review",
    "demo",
  ]),
  status: z.enum(["planned", "active", "complete"]),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1).nullable(),
  isExternal: z.boolean(),
  description: z.string().trim(),
  projectIds: z.array(z.string().trim().min(1)),
  photoUrl: z.string().trim(),
});

export const milestoneSchema = milestoneFieldsSchema.extend({
  status: milestoneFieldsSchema.shape.status.default("planned"),
  isExternal: milestoneFieldsSchema.shape.isExternal.default(false),
  description: milestoneFieldsSchema.shape.description.default(""),
  projectIds: milestoneFieldsSchema.shape.projectIds.default([]),
  photoUrl: milestoneFieldsSchema.shape.photoUrl.default(""),
});

export const milestonePatchSchema = milestoneFieldsSchema.partial();

const meetingTypeSchema = z.enum(["general", "build", "review", "outreach", "competition", "other"]);

const meetingFieldsSchema = z.object({
  title: z.string().trim().min(2),
  meetingType: meetingTypeSchema,
  seasonId: z.string().trim().min(1).optional(),
  projectIds: z.array(z.string().trim().min(1)),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1).nullable().optional(),
  location: z.string().trim(),
  description: z.string().trim(),
});

export const meetingSchema = meetingFieldsSchema.extend({
  meetingType: meetingFieldsSchema.shape.meetingType.default("general"),
  projectIds: meetingFieldsSchema.shape.projectIds.default([]),
  location: meetingFieldsSchema.shape.location.default(""),
  description: meetingFieldsSchema.shape.description.default(""),
});

export const meetingPatchSchema = meetingFieldsSchema.partial();

export const qaReportSchema = z.object({
  reportType: z.literal("qa"),
  projectId: z.string().trim().min(1),
  targetRefs: z.array(domainReferenceSchema),
  createdByMemberId: z.string().trim().min(1).nullable(),
  participantIds: z.array(z.string().trim().min(1)),
  mentorId: z.string().trim().min(1).nullable(),
  requestedById: z.string().trim().min(1).nullable(),
  result: z.enum(["pass", "minor-fix", "iteration-worthy"]),
  summary: z.string().trim(),
  notes: z.string().trim(),
  evidenceNotes: z.string().trim().optional(),
  photoUrl: z.string().trim().optional(),
  createdAt: z.string().datetime({ offset: true }),
  status: z.enum(["draft", "submitted", "reviewed"]),
  reviewedById: z.string().trim().min(1).nullable(),
  reviewedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const qaSubmitSchema = qaReportSchema.extend({
  followUpTaskTitle: z.string().trim().optional(),
});

export const qaRequestSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  targetRefs: z.array(domainReferenceSchema),
  subject: z.string().trim().min(2),
  mentorId: z.string().trim().min(1).nullable().optional(),
  requestedById: z.string().trim().min(1).nullable().optional(),
});

export const testResultSchema = z.object({
  projectId: z.string().trim().min(1),
  targetRefs: z.array(domainReferenceSchema),
  title: z.string().trim().min(2),
  status: z.enum(["pass", "fail", "blocked"]),
}).strict();

export const userPreferencesPatchSchema = z.object({
  taskSubteamIds: z
    .array(z.enum(["programming", "mechanical", "electrical", "media-marketing", "business", "scouting"]))
    .optional(),
  themeMode: z.enum(["light", "dark"]).nullable().optional(),
});

export const auditExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  seasonId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().refine(
  (query) => !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to),
  {
    message: "from must be on or before to.",
    path: ["from"],
  },
);

const reportBaseSchema = z.object({
  projectId: z.string().trim().min(1),
  targetRefs: z.array(domainReferenceSchema),
  createdByMemberId: z.string().trim().min(1).nullable(),
  participantIds: z.array(z.string().trim().min(1)),
  mentorId: z.string().trim().min(1).nullable(),
  requestedById: z.string().trim().min(1).nullable(),
  summary: z.string().trim(),
  notes: z.string().trim(),
  evidenceNotes: z.string().trim().optional(),
  photoUrl: z.string().trim().optional(),
  createdAt: z.string().datetime({ offset: true }),
  status: z.enum(["draft", "submitted", "reviewed"]),
});
export const reportSchema = z.discriminatedUnion("reportType", [
  reportBaseSchema.extend({ reportType: z.literal("qa"), result: z.enum(["pass", "minor-fix", "iteration-worthy"]), reviewedById: z.string().trim().min(1).nullable(), reviewedAt: z.string().datetime({ offset: true }).nullable() }).strict(),
  reportBaseSchema.extend({ reportType: z.enum(["practice", "competition", "review"]), result: z.string().trim().nullable() }).strict(),
]);

export const reportFindingSchema = z.object({
  reportId: z.string().trim().min(1),
  targetRefs: z.array(domainReferenceSchema),
  issueType: z.string().trim().min(1),
  severity: z.enum(["high", "medium", "low"]),
  notes: z.string().trim().default(""),
  spawnedTaskId: z.string().trim().min(1).nullable(),
  spawnedIterationId: z.string().trim().min(1).nullable(),
  spawnedRiskId: z.string().trim().min(1).nullable(),
});

const taskDependencyFields = {
  taskId: z.string().trim().min(1),
  refId: z.string().trim().min(1),
  dependencyType: z.enum(["hard", "soft"]),
};
const dependencyTaskStateSchema = z.enum(["not-started", "in-progress", "waiting-for-qa", "complete"]);
const dependencyReadinessStateSchema = z.enum(["not-ready", "blocked", "qa", "ready"]);
export const taskDependencySchema = z.discriminatedUnion("kind", [
  z.object({ ...taskDependencyFields, kind: z.literal("task"), requiredState: dependencyTaskStateSchema }).strict(),
  z.object({ ...taskDependencyFields, kind: z.literal("milestone"), requiredState: dependencyReadinessStateSchema }).strict(),
  z.object({ ...taskDependencyFields, kind: z.literal("part-instance"), requiredCondition: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("physical-location"), value: z.enum(["stock", "installed", "repair", "retired", "lost", "unlocated"]) }).strict(),
    z.object({ kind: z.literal("derived-readiness"), value: dependencyReadinessStateSchema }).strict(),
  ]) }).strict(),
]);
export const taskDependencyPatchSchema = z.object({
  ...taskDependencyFields,
  kind: z.enum(["task", "milestone", "part-instance"]),
  requiredState: z.union([dependencyTaskStateSchema, dependencyReadinessStateSchema]).optional(),
  requiredCondition: z.object({ kind: z.string(), value: z.string() }).strict().optional(),
}).strict().partial();

export const riskSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(2),
  detail: z.string().trim().min(2),
  category: z.enum(["dependency", "design", "manufacturing", "supply", "schedule", "qa", "inventory", "other"]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]).default("open"),
  blocksWork: z.boolean().default(false),
  source: z.union([
    z.object({ kind: z.literal("manual") }).strict(),
    z.object({ kind: z.enum(["task", "task-dependency", "qa-finding", "test-finding", "qa-request", "test-result", "report", "event", "milestone", "manufacturing-details", "part-instance", "material"]), id: z.string().trim().min(1) }).strict(),
  ]),
  relatedTargets: z.array(z.object({
    kind: z.enum(["project", "workstream", "responsible-group", "task", "subsystem", "mechanism", "part-definition", "part-instance", "material", "vendor", "manufacturing-details", "purchase-item", "meeting", "event", "milestone", "qa-request", "test-result", "report", "artifact", "qa-finding", "test-finding", "task-dependency", "risk", "design-iteration"]),
    id: z.string().trim().min(1),
  }).strict()),
  mitigationTaskId: z.string().trim().min(1).nullable().optional(),
  ownerGroupId: z.string().trim().min(1).nullable().optional(),
}).strict();

export const riskPatchSchema = riskSchema.partial().extend({
  status: z.enum(["open", "mitigating", "accepted", "resolved"]).optional(),
  blocksWork: z.boolean().optional(),
});

const iterationSchema = z.coerce.number().int().min(1);
const pmCadSourceSchema = z.enum(["manual", "step", "onshape"]);
const pmCadImportSourceSchema = z.enum([
  "MANUAL",
  "STEP_UPLOAD",
  "ONSHAPE_API",
  "ONSHAPE_BOM_CSV",
  "MANUAL_BOM_CSV",
]);
const pmCadProvenanceSchema = {
  cadSource: pmCadSourceSchema.optional(),
  cadImportSource: pmCadImportSourceSchema.optional(),
  cadEditedAfterImport: z.boolean().optional(),
  cadSourceLabel: z.string().trim().min(1).optional(),
  cadUpdatedAt: z.string().datetime({ offset: true }).nullable().optional(),
};

const workstreamFieldsSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().trim().min(3),
  isArchived: z.boolean(),
});

export const workstreamSchema = workstreamFieldsSchema.extend({
  isArchived: workstreamFieldsSchema.shape.isArchived.default(false),
});

export const workstreamPatchSchema = workstreamFieldsSchema.partial();

export const subsystemLayoutSchema = z.object({
  layoutX: z.number().min(0).max(1).nullable().optional(),
  layoutY: z.number().min(0).max(1).nullable().optional(),
  layoutZone: z.enum(["front", "rear", "left", "right", "center", "top", "unplaced"]).nullable().optional(),
  layoutView: z.literal("top").nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
});

const subsystemFieldsSchema = z.object({
  ...subsystemLayoutSchema.shape,
  ...pmCadProvenanceSchema,
  projectId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2),
  serialAlias: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,8}$/)
    .optional(),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().trim().min(3),
  photoUrl: z.string().trim(),
  iteration: iterationSchema,
  isArchived: z.boolean(),
  parentSubsystemId: z.string().trim().min(1).nullable().optional(),
  responsibleEngineerId: z.string().trim().min(1).nullable(),
  mentorIds: z.array(z.string().trim().min(1)),
}).strict();

export const subsystemSchema = subsystemFieldsSchema.extend({
  photoUrl: subsystemFieldsSchema.shape.photoUrl.default(""),
  isArchived: subsystemFieldsSchema.shape.isArchived.default(false),
  mentorIds: subsystemFieldsSchema.shape.mentorIds.default([]),
  iteration: subsystemFieldsSchema.shape.iteration.default(1),
});

export const subsystemPatchSchema = subsystemFieldsSchema.partial();

const mechanismFieldsSchema = z.object({
  ...pmCadProvenanceSchema,
  subsystemId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  description: z.string().trim().min(3),
  googleSheetsUrl: z.string().trim(),
  photoUrl: z.string().trim(),
  iteration: iterationSchema,
  isArchived: z.boolean(),
});

export const mechanismSchema = mechanismFieldsSchema.extend({
  googleSheetsUrl: mechanismFieldsSchema.shape.googleSheetsUrl.default(""),
  photoUrl: mechanismFieldsSchema.shape.photoUrl.default(""),
  isArchived: mechanismFieldsSchema.shape.isArchived.default(false),
  iteration: mechanismFieldsSchema.shape.iteration.default(1),
});

export const mechanismPatchSchema = mechanismFieldsSchema.partial();

const acquisitionContext = {
  subsystemId: z.string().trim().min(1),
  workTypeId: z.string().trim().min(1),
  ownerId: z.string().trim().min(1),
  mentorId: z.string().trim().min(1),
  dueDate: z.string().date(),
};

const partAcquisitionSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stock") }).strict(),
  z.object({ method: z.literal("manufacture"), ...acquisitionContext, fulfillmentSource: z.enum(["in-house", "outsourced"]).default("in-house") }).strict(),
  z.object({ method: z.literal("purchase-cots"), ...acquisitionContext }).strict(),
]);

const partDefinitionFieldsSchema = z.object({
  ...pmCadProvenanceSchema,
  seasonId: z.string().trim().min(1).optional(),
  activeSeasonIds: z.array(z.string().trim().min(1)).optional(),
  name: z.string().trim().min(2),
  // When omitted/blank, the platform assigns the next available part number.
  partNumber: z.string().trim(),
  isHardware: z.boolean(),
  revision: z.string().trim().min(1),
  iteration: iterationSchema,
  isArchived: z.boolean(),
  type: z.string().trim().min(1),
  defaultAcquisitionMethod: z.enum(["stock", "purchase-cots", "manufacture"]),
  materialId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim(),
  photoUrl: z.string().trim(),
});

export const partDefinitionSchema = partDefinitionFieldsSchema.extend({
  partNumber: partDefinitionFieldsSchema.shape.partNumber.default(""),
  isHardware: partDefinitionFieldsSchema.shape.isHardware.default(false),
  isArchived: partDefinitionFieldsSchema.shape.isArchived.default(false),
  description: partDefinitionFieldsSchema.shape.description.default(""),
  photoUrl: partDefinitionFieldsSchema.shape.photoUrl.default(""),
  iteration: partDefinitionFieldsSchema.shape.iteration.default(1),
  acquisition: partAcquisitionSchema.optional(),
});

export const partDefinitionPatchSchema = partDefinitionFieldsSchema.partial().extend({
  partNumber: partDefinitionFieldsSchema.shape.partNumber.min(1).optional(),
});

const partInstanceFieldsSchema = z.object({
  ...pmCadProvenanceSchema,
  partDefinitionId: z.string().trim().min(1),
  intendedSubsystemId: z.string().trim().min(1).nullable(),
  intendedMechanismId: z.string().trim().min(1).nullable(),
  location: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("stock"), location: z.string().trim().min(1) }).strict(),
    z.object({ kind: z.literal("installed"), subsystemId: z.string().trim().min(1), mechanismId: z.string().trim().min(1).nullable() }).strict(),
    z.object({ kind: z.literal("repair"), location: z.string().trim().min(1) }).strict(),
    z.object({ kind: z.literal("retired"), location: z.string().trim().nullable() }).strict(),
    z.object({ kind: z.literal("lost") }).strict(),
    z.object({ kind: z.literal("unlocated") }).strict(),
  ]),
  photoUrl: z.string().trim(),
});

export const partInstanceSchema = partInstanceFieldsSchema.extend({
  photoUrl: partInstanceFieldsSchema.shape.photoUrl.default(""),
});

export const partInstancePatchSchema = partInstanceFieldsSchema.partial();

const purchaseItemFieldsSchema = z.object({
  taskId: z.string().trim().min(1),
  kind: z.enum(["cots-goods", "manufacturing-service"]),
  title: z.string().trim().min(3),
  partDefinitionId: z.string().trim().min(1).nullable(),
  materialId: z.string().trim().min(1).nullable(),
  quantity: z.coerce.number().min(1),
  quotes: z.array(z.object({ id: z.string().trim().min(1), vendorId: z.string().trim().min(1), reference: z.string().nullable(), amount: z.object({ amount: z.number().nonnegative(), currency: z.string().nullable() }).nullable(), url: z.string().optional(), expiresAt: z.string().nullable().optional(), quotedAt: z.string().nullable() }).strict()),
  selectedQuoteId: z.string().trim().min(1).nullable(),
  approvalStatus: z.enum(["pending", "approved", "rejected"]),
  approvedById: z.string().trim().min(1).nullable(),
  approvedAt: z.string().nullable(),
  purchaseOrderNumber: z.string().nullable(),
  orderStatus: z.enum(["not-ordered", "ordered", "shipped", "delivered", "cancelled"]),
  finalCost: z.object({ amount: z.number().nonnegative(), currency: z.string().nullable() }).nullable(),
  expectedDeliveryDate: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  orderedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
}).strict();

export const purchaseItemSchema = purchaseItemFieldsSchema;

export const manufacturingProcessCreateSchema = z.object({
  code: z.string().trim().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1),
}).strict();
export const manufacturingProcessArchiveSchema = z.object({ isActive: z.literal(false) }).strict();

export const purchaseItemPatchSchema = purchaseItemFieldsSchema.partial();

export const purchaseApprovalSchema = z.object({
  approvalStatus: z.enum(["approved", "rejected"]),
}).strict();

export const purchaseTransitionSchema = z.object({
  orderStatus: z.enum(["ordered", "shipped", "delivered", "cancelled"]),
  finalCost: z.object({ amount: z.number().nonnegative(), currency: z.string().nullable() }).nullable().optional(),
}).strict();

const materialFieldsSchema = z.object({
  name: z.string().trim().min(2),
  category: z.enum([
    "metal",
    "plastic",
    "filament",
    "electronics",
    "hardware",
    "consumable",
    "other",
  ]),
  unit: z.string().trim().min(1),
  onHandQuantity: z.coerce.number().min(0),
  reorderPoint: z.coerce.number().min(0),
  location: z.string().trim().min(1),
  preferredVendorId: z.string().trim().min(1).nullable(),
  notes: z.string().trim(),
});

export const materialSchema = materialFieldsSchema.extend({
  notes: materialFieldsSchema.shape.notes.default(""),
});

export const materialPatchSchema = materialFieldsSchema.partial();

const artifactFieldsSchema = z.object({
  projectId: z.string().trim().min(1),
  targetRefs: z.array(domainReferenceSchema).default([]),
  kind: z.enum(["document", "evidence", "media", "other"]),
  title: z.string().trim().min(2),
  summary: z.string().trim(),
  status: z.enum(["draft", "in-review", "published", "archived"]),
  uri: z.string().trim(),
  updatedAt: z.string().trim().min(1).optional(),
});

export const artifactSchema = artifactFieldsSchema.extend({
  summary: artifactFieldsSchema.shape.summary.default(""),
  status: artifactFieldsSchema.shape.status.default("draft"),
  uri: artifactFieldsSchema.shape.uri.default(""),
});

export const artifactPatchSchema = artifactFieldsSchema.partial().extend({
  targetRefs: z.array(domainReferenceSchema).optional(),
});

export const mediaUploadRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.coerce.number().int().positive().max(500 * 1024 * 1024),
});

const workLogFieldsSchema = z.object({
  taskId: z.string().trim().min(1),
  date: z.string().date(),
  hours: z.coerce.number().min(0.5),
  participantIds: z.array(z.string().trim().min(1)).min(1),
  notes: z.string().trim(),
  photoUrl: z.string().trim(),
});

export const workLogSchema = workLogFieldsSchema.extend({
  notes: workLogFieldsSchema.shape.notes.default(""),
  photoUrl: workLogFieldsSchema.shape.photoUrl.default(""),
});

export const workLogPatchSchema = workLogFieldsSchema.partial();

export const tutorialSessionResetSchema = z.object({
  mode: z.enum(["session", "baseline"]).default("session"),
});

export const paginatedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().optional(),
});
