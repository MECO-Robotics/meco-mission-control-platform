import { z } from "zod";
import { taskTargetsSchema } from "../domain/taskTargets";


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
  elevated: z.boolean(),
  disciplineId: z.string().trim().min(1).nullable().optional(),
  seasonId: z.string().trim().min(1).optional(),
  activeSeasonIds: z.array(z.string().trim().min(1)).optional(),
  plannedWeeklyAttendanceHours: z.coerce.number().min(0).max(80),
  plannedAttendanceDays: z.array(plannedAttendanceDaySchema),
  plannedAttendanceNotes: z.string().trim(),
});

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
  name: z.string().trim().min(2),
  projectType: z.enum(["robot", "operations", "outreach", "other"]),
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
  title: z.string().trim().min(3),
  workType: z.enum(["Design", "Manufacturing", "Assembly", "Electrical/Wiring", "Programming", "Testing", "Driving"]).optional(),
  responsibleGroup: z.enum(["Mechanical", "Electrical", "Programming"]).nullable().optional(),
  summary: z.string().trim().min(3),
  disciplineId: z.string().min(1),
  targetMilestoneId: z.string().trim().min(1).nullable(),
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
  linkedManufacturingIds: z.array(z.string().trim().min(1)),
  linkedPurchaseIds: z.array(z.string().trim().min(1)),
  requiresDocumentation: z.boolean(),
  documentationLinked: z.boolean(),
}).strict();

export const taskSchema = taskFieldsSchema.extend({
  photoUrl: taskFieldsSchema.shape.photoUrl.default(""),
  assigneeIds: taskFieldsSchema.shape.assigneeIds.default([]),
  checklistItems: taskFieldsSchema.shape.checklistItems.default([]),
  linkedManufacturingIds: taskFieldsSchema.shape.linkedManufacturingIds.default([]),
  linkedPurchaseIds: taskFieldsSchema.shape.linkedPurchaseIds.default([]),
  requiresDocumentation: taskFieldsSchema.shape.requiresDocumentation.default(false),
  documentationLinked: taskFieldsSchema.shape.documentationLinked.default(false),
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
  status: z.enum(["not ready", "blocked", "qa", "ready"]),
  startDateTime: z.string().trim().min(1),
  endDateTime: z.string().trim().min(1).nullable(),
  isExternal: z.boolean(),
  description: z.string().trim(),
  projectIds: z.array(z.string().trim().min(1)),
  photoUrl: z.string().trim(),
});

export const milestoneSchema = milestoneFieldsSchema.extend({
  status: milestoneFieldsSchema.shape.status.default("not ready"),
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
  startDateTime: z.string().trim().min(1),
  endDateTime: z.string().trim().min(1).nullable().optional(),
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

export const qaReassessmentSchema = z.object({
  targetRiskId: z.string().trim().min(1).nullable().optional(),
  proposedRiskSeverity: z.enum(["high", "medium", "low"]).nullable().optional(),
  proposedRiskStatus: z.enum(["partial-mitigation", "full-mitigation"]).nullable().optional(),
});

export const qaReportSchema = z.object({
  ...qaReassessmentSchema.shape,
  taskId: z.string().trim().min(1),
  participantIds: z.array(z.string().trim().min(1)).min(1),
  result: z.enum(["pass", "minor-fix", "iteration-worthy"]),
  mentorApproved: z.boolean().default(false),
  notes: z.string().trim().default(""),
  photoUrl: z.string().trim().default(""),
  reviewedAt: z.string().date(),
}).strict();

export const qaSubmitSchema = qaReportSchema.extend({
  evidenceNotes: z.string().trim().default(""),
  followUpTaskTitle: z.string().trim().optional(),
  qaRequestId: z.string().trim().min(1).nullable().optional(),
});

export const qaRequestSchema = z.object({
  taskId: z.string().trim().min(1).nullable().optional(),
  subject: z.string().trim().min(2),
  mentorId: z.string().trim().min(1),
  requestedById: z.string().trim().min(1).nullable().optional(),
});

export const testResultSchema = z.object({
  milestoneId: z.string().trim().min(1),
  title: z.string().trim().min(2),
  status: z.enum(["pass", "fail", "blocked"]),
  findings: z.array(z.string().trim().min(1)).default([]),
  photoUrl: z.string().trim().default(""),
});

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

export const reportSchema = z.object({
  ...qaReassessmentSchema.shape,
  reportType: z.enum(["QA", "MilestoneTest"]),
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1).nullable(),
  milestoneId: z.string().trim().min(1).nullable(),
  workstreamId: z.string().trim().min(1).nullable(),
  createdByMemberId: z.string().trim().min(1).nullable(),
  result: z.string().trim().min(1),
  summary: z.string().trim().default(""),
  notes: z.string().trim().default(""),
  photoUrl: z.string().trim().default(""),
  createdAt: z.string().trim().min(1),
  participantIds: z.array(z.string().trim().min(1)).optional(),
  mentorApproved: z.boolean().optional(),
  reviewedAt: z.string().date().optional(),
  title: z.string().trim().min(1).optional(),
  status: z.enum(["pass", "fail", "blocked"]).optional(),
  findings: z.array(z.string().trim().min(1)).optional(),
}).strict();

export const reportFindingSchema = z.object({
  reportId: z.string().trim().min(1),
  mechanismId: z.string().trim().min(1).nullable(),
  partInstanceId: z.string().trim().min(1).nullable(),
  artifactInstanceId: z.string().trim().min(1).nullable(),
  issueType: z.string().trim().min(1),
  severity: z.enum(["high", "medium", "low"]),
  notes: z.string().trim().default(""),
  spawnedTaskId: z.string().trim().min(1).nullable(),
  spawnedIterationId: z.string().trim().min(1).nullable(),
  spawnedRiskId: z.string().trim().min(1).nullable(),
});

const taskDependencyFields = {
  workItemId: z.string().trim().min(1),
  sourceType: z.enum(["task", "manufacturing"]),
  refId: z.string().trim().min(1),
  dependencyType: z.enum(["hard", "soft"]),
};
const dependencyTaskStateSchema = z.enum(["not-started", "in-progress", "waiting-for-qa", "complete"]);
const dependencyReadinessStateSchema = z.enum(["not ready", "blocked", "qa", "ready"]);
export const taskDependencySchema = z.discriminatedUnion("kind", [
  z.object({ ...taskDependencyFields, kind: z.literal("work_item"), refType: z.enum(["task", "manufacturing"]), requiredState: dependencyTaskStateSchema }).strict(),
  z.object({ ...taskDependencyFields, kind: z.literal("milestone"), requiredState: dependencyReadinessStateSchema }).strict(),
  z.object({ ...taskDependencyFields, kind: z.literal("part_instance"), requiredState: dependencyReadinessStateSchema }).strict(),
]);
export const taskDependencyPatchSchema = z.object({
  ...taskDependencyFields,
  kind: z.enum(["work_item", "milestone", "part_instance"]),
  refType: z.enum(["task", "manufacturing"]).optional(),
  requiredState: z.union([dependencyTaskStateSchema, dependencyReadinessStateSchema]),
}).strict().partial();

const taskBlockerFieldsSchema = z.object({
  issueType: z.enum(["external", "lost-part", "broken-part", "lost-tool", "broken-tool",
    "design-issue", "shipping-delay", "manufacturing-unavailable", "qa-failed", "other"]).optional(),
  blockedTaskId: z.string().trim().min(1),
  blockerType: z.enum([
    "task",
    "milestone",
    "workstream",
    "mechanism",
    "part_instance",
    "artifact_instance",
    "external",
  ]),
  blockerId: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "resolved"]),
  createdByMemberId: z.string().trim().min(1).nullable().optional(),
});

export const taskBlockerSchema = taskBlockerFieldsSchema.extend({
  status: taskBlockerFieldsSchema.shape.status.default("open"),
}).strict();
export const taskBlockerPatchSchema = taskBlockerFieldsSchema.partial();

export const riskSchema = z.object({
  title: z.string().trim().min(2),
  detail: z.string().trim().min(2),
  severity: z.enum(["high", "medium", "low"]),
  sourceType: z.enum(["qa-report", "test-result"]),
  sourceId: z.string().trim().min(1),
  attachmentType: z.enum(["project", "workstream", "mechanism", "part-instance"]),
  attachmentId: z.string().trim().min(1),
  mitigationTaskId: z.string().trim().min(1).nullable().optional(),
});

export const riskPatchSchema = riskSchema.partial();

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
  risks: z.array(z.string().trim().min(1)),
}).strict();

export const subsystemSchema = subsystemFieldsSchema.extend({
  photoUrl: subsystemFieldsSchema.shape.photoUrl.default(""),
  isArchived: subsystemFieldsSchema.shape.isArchived.default(false),
  mentorIds: subsystemFieldsSchema.shape.mentorIds.default([]),
  risks: subsystemFieldsSchema.shape.risks.default([]),
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
  disciplineId: z.string().trim().min(1),
  ownerId: z.string().trim().min(1),
  mentorId: z.string().trim().min(1),
  dueDate: z.string().date(),
};

const partAcquisitionSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stock") }).strict(),
  z.object({ method: z.literal("manufacture"), ...acquisitionContext }).strict(),
  z.object({ method: z.literal("purchase"), ...acquisitionContext }).strict(),
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
  source: z.string().trim().min(1),
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
  subsystemId: z.string().trim().min(1),
  mechanismId: z.string().trim().min(1).nullable().optional(),
  partDefinitionId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  quantity: z.coerce.number().min(1),
  trackIndividually: z.boolean(),
  status: z.enum(["not ready", "blocked", "qa", "ready"]),
  photoUrl: z.string().trim(),
});

export const partInstanceSchema = partInstanceFieldsSchema.extend({
  trackIndividually: partInstanceFieldsSchema.shape.trackIndividually.default(false),
  photoUrl: partInstanceFieldsSchema.shape.photoUrl.default(""),
});

export const partInstancePatchSchema = partInstanceFieldsSchema.partial();

const purchaseItemFieldsSchema = z.object({
  title: z.string().trim().min(3),
  subsystemId: z.string().min(1),
  requestedById: z.string().trim().min(1).nullable(),
  partDefinitionId: z.string().trim().min(1).nullable().optional(),
  quantity: z.coerce.number().min(1),
  vendor: z.string().trim().min(2),
  linkLabel: z.string().trim().min(2),
  estimatedCost: z.coerce.number().min(0),
  finalCost: z.coerce.number().min(0).optional(),
  approvedByMentor: z.boolean(),
  status: z.enum(["requested", "approved", "purchased", "shipped", "delivered"]),
});

export const purchaseItemSchema = purchaseItemFieldsSchema.extend({
  approvedByMentor: purchaseItemFieldsSchema.shape.approvedByMentor.default(false),
});

export const purchaseItemPatchSchema = purchaseItemFieldsSchema.partial();

export const purchaseApprovalSchema = z.object({
  approved: z.boolean(),
}).strict();

export const purchaseTransitionSchema = z.object({
  status: z.enum(["purchased", "shipped", "delivered"]),
  finalCost: z.coerce.number().min(0).optional(),
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
  vendor: z.string().trim().min(1),
  notes: z.string().trim(),
});

export const materialSchema = materialFieldsSchema.extend({
  notes: materialFieldsSchema.shape.notes.default(""),
});

export const materialPatchSchema = materialFieldsSchema.partial();

const artifactFieldsSchema = z.object({
  projectId: z.string().trim().min(1),
  workstreamId: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(["document", "nontechnical"]),
  title: z.string().trim().min(2),
  summary: z.string().trim(),
  status: z.enum(["draft", "in-review", "published"]),
  link: z.string().trim(),
  isArchived: z.boolean(),
  updatedAt: z.string().trim().min(1).optional(),
});

export const artifactSchema = artifactFieldsSchema.extend({
  summary: artifactFieldsSchema.shape.summary.default(""),
  status: artifactFieldsSchema.shape.status.default("draft"),
  link: artifactFieldsSchema.shape.link.default(""),
  isArchived: artifactFieldsSchema.shape.isArchived.default(false),
});

export const artifactPatchSchema = artifactFieldsSchema.partial();

export const mediaUploadRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.coerce.number().int().positive().max(500 * 1024 * 1024),
});

const manufacturingItemFieldsSchema = z.object({
  title: z.string().trim().min(3),
  responsibleGroup: z.enum(["Mechanical", "Electrical", "Programming"]).nullable().optional(),
  subsystemId: z.string().min(1),
  requestedById: z.string().trim().min(1).nullable(),
  process: z.enum(["3d-print", "cnc", "fabrication"]),
  dueDate: z.string().date(),
  material: z.string().trim().min(2),
  materialId: z.string().trim().min(1).nullable().optional(),
  partDefinitionId: z.string().trim().min(1).nullable().optional(),
  partInstanceId: z.string().trim().min(1).nullable().optional(),
  partInstanceIds: z.array(z.string().trim().min(1)).optional(),
  quantity: z.coerce.number().min(1),
  status: z.enum(["requested", "approved", "in-progress", "qa", "complete"]),
  mentorReviewed: z.boolean(),
  inHouse: z.boolean(),
  batchLabel: z.string().trim().min(1).optional(),
});

export const manufacturingItemSchema = manufacturingItemFieldsSchema.extend({
  mentorReviewed: manufacturingItemFieldsSchema.shape.mentorReviewed.default(false),
  inHouse: manufacturingItemFieldsSchema.shape.inHouse.default(true),
});

export const manufacturingItemPatchSchema = manufacturingItemFieldsSchema.partial();

export const manufacturingReviewSchema = z.object({
  reviewed: z.boolean(),
}).strict();

export const manufacturingTransitionSchema = z.object({
  status: z.enum(["in-progress", "qa", "complete"]),
}).strict();

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
