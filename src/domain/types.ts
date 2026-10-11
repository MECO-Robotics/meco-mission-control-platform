import type { TaskTargets } from "./taskTargets";

export type MemberRole = "student" | "lead" | "mentor" | "admin" | "external";
export type MilestoneType =
  | "practice"
  | "competition"
  | "deadline"
  | "internal-review"
  | "demo";
export type DisciplineCode =
  | "design"
  | "manufacturing"
  | "assembly"
  | "electrical"
  | "programming"
  | "testing"
  | "planning"
  | "communications"
  | "finance"
  | "research"
  | "documentation"
  | "engagement"
  | "presentation"
  | "media_production"
  | "partnerships"
  | "game_analysis"
  | "scouting"
  | "data_analysis"
  | "risk_review"
  | "curriculum"
  | "instruction"
  | "practice"
  | "assessment"
  | "photography"
  | "video"
  | "graphics"
  | "writing"
  | "web"
  | "social_media";
export type TaskStatus =
  | "not-started"
  | "in-progress"
  | "waiting-for-qa"
  | "complete";
export type ReadinessStatus = "not-ready" | "blocked" | "qa" | "ready";

export type ScheduleReference =
  | { kind: "meeting"; id: string }
  | { kind: "event"; id: string }
  | { kind: "milestone"; id: string };

export type ManufacturedPartRef =
  | { kind: "part-definition"; partDefinitionId: string }
  | { kind: "provisional"; partNumber: string; revision: string };
export type MaterialRequirement =
  | { kind: "inventory-material"; materialId: string }
  | { kind: "specified-material"; name: string };
export type FulfillmentSource = "in-house" | "outsourced";
export interface ManufacturingDetails {
  part: ManufacturedPartRef;
  quantity: number;
  processId: string;
  fulfillmentSource: FulfillmentSource;
  material: MaterialRequirement;
  fileArtifactIds: string[];
  tolerances: string[];
  qaRequirements: string[];
  batchLabel?: string;
}

export type MilestoneStatus = "planned" | "active" | "complete";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type MaterialCategory =
  | "metal"
  | "plastic"
  | "filament"
  | "electronics"
  | "hardware"
  | "consumable"
  | "other";
export type ArtifactKind = "document" | "evidence" | "media" | "other";
export type ArtifactStatus = "draft" | "in-review" | "published" | "archived";
export type PurchaseStatus =
  | "requested"
  | "approved"
  | "purchased"
  | "shipped"
  | "delivered";
export type PmCadSource = "manual" | "step" | "onshape";
export type PmCadImportSource = "MANUAL" | "STEP_UPLOAD" | "ONSHAPE_API" | "ONSHAPE_BOM_CSV" | "MANUAL_BOM_CSV";

export interface PmCadProvenance {
  cadSource?: PmCadSource;
  cadImportSource?: PmCadImportSource;
  cadEditedAfterImport?: boolean;
  cadSourceLabel?: string;
  cadUpdatedAt?: string | null;
}
export type QaResult = "pass" | "minor-fix" | "iteration-worthy";
export type SeasonType = "season" | "offseason" | "initiative";
export type ProjectType = "robot" | "media" | "outreach" | "operations" | "strategy" | "training";
export type CanonicalProjectName = "Robot" | "Media" | "Outreach" | "Operations" | "Strategy" | "Training";
export type ProjectStatus = "planned" | "active" | "paused" | "complete";
export type TestResultStatus = "pass" | "fail" | "blocked";
export type RiskSeverity = "critical" | "high" | "medium" | "low";
export type RiskAttachmentType = "project" | "workstream" | "mechanism" | "part-instance";
export type FindingStatus = "open" | "in-progress" | "resolved";
export type FindingSourceType = "qa" | "test";
export type IterationStatus = "planned" | "in-progress" | "complete";
export type ReportType = "qa" | "practice" | "competition" | "review";
export type TaskDependencyKind = "task" | "milestone" | "part-instance";
export type TaskDependencyType = "hard" | "soft";
export const DEFAULT_PROJECT_TEAM_ID = "default-team";
export type PlannedAttendanceDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type MeetingType = "general" | "build" | "review" | "outreach" | "competition" | "other";
export type AuditActionOperation = "create" | "update" | "delete";

export interface AuditAction {
  id: string;
  timestamp: string;
  operation: AuditActionOperation;
  entityType: string;
  entityId: string;
  entityLabel: string;
  message: string;
  changedFields: string[];
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  detailsJson?: Record<string, unknown>;
  requestId: string | null;
  projectId: string | null;
  projectIds?: string[];
  taskId: string | null;
  subsystemId: string | null;
  actorMemberId: string | null;
  memberIds: string[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  role: MemberRole;
  elevated: boolean;
  seasonId: string;
  activeSeasonIds?: string[];
  plannedWeeklyAttendanceHours?: number;
  plannedAttendanceDays?: PlannedAttendanceDay[];
  plannedAttendanceNotes?: string;
}

export interface Subsystem extends PmCadProvenance {
  layoutX?: number | null;
  layoutY?: number | null;
  layoutZone?: "front" | "rear" | "left" | "right" | "center" | "top" | "unplaced" | null;
  layoutView?: "top" | null;
  sortOrder?: number | null;
  id: string;
  projectId: string;
  name: string;
  serialAlias?: string;
  color?: string;
  description: string;
  photoUrl?: string;
  iteration: number;
  isArchived: boolean;
  isCore: boolean;
  parentSubsystemId: string | null;
  responsibleEngineerId: string | null;
  mentorIds: string[];
}

// Static task work-type catalog entries; distinct from Member responsibility.
export interface Discipline {
  id: string;
  code: DisciplineCode;
  name: string;
}

export interface WorkType {
  id: string;
  projectType: ProjectType;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ResponsibleGroup {
  id: string;
  seasonId: string;
  name: string;
  projectIds: string[];
  workTypeIds: string[];
  memberIds: string[];
  primaryMemberIds: string[];
  isArchived: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  website: string | null;
  isArchived: boolean;
}

export interface ManufacturingProcessRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface Mechanism extends PmCadProvenance {
  id: string;
  subsystemId: string;
  name: string;
  description: string;
  googleSheetsUrl?: string;
  photoUrl?: string;
  iteration: number;
  isArchived: boolean;
}

export interface PartDefinition extends PmCadProvenance {
  id: string;
  seasonId: string;
  activeSeasonIds?: string[];
  name: string;
  partNumber: string;
  isHardware?: boolean;
  revision: string;
  iteration: number;
  isArchived: boolean;
  type: string;
  defaultAcquisitionMethod: AcquisitionMethod;
  materialId: string | null;
  description: string;
  photoUrl?: string;
}

export type PartInstanceLocation =
  | { kind: "stock"; location: string }
  | { kind: "installed"; subsystemId: string; mechanismId: string | null }
  | { kind: "repair"; location: string }
  | { kind: "retired"; location: string | null }
  | { kind: "lost" }
  | { kind: "unlocated" };

export interface PartInstance extends PmCadProvenance {
  id: string;
  partDefinitionId: string;
  intendedSubsystemId: string | null;
  intendedMechanismId: string | null;
  location: PartInstanceLocation;
  photoUrl?: string;
}

export type PartInstanceView = PartInstance & { readinessStatus: ReadinessStatus };

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: string;
  onHandQuantity: number;
  reorderPoint: number;
  location: string;
  preferredVendorId: string | null;
  notes: string;
}

export interface Artifact {
  id: string;
  projectId: string;
  targetRefs: DomainReference[];
  kind: ArtifactKind;
  title: string;
  summary: string;
  status: ArtifactStatus;
  uri: string;
  updatedAt: string;
}

export interface Task extends TaskTargets {
  id: string;
  createdAt?: string;
  serialNumber?: number;
  serial?: string;
  projectId: string;
  workTypeId: string;
  responsibleGroupId: string | null;
  requestedById: string | null;
  scheduleRefs: ScheduleReference[];
  manufacturingDetails: ManufacturingDetails | null;
  title: string;
  summary: string;
  photoUrl?: string;
  ownerId: string | null;
  assigneeIds: string[];
  mentorId: string | null;
  startDate: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  checklistItems: string[];
  isBlocked?: boolean;
  isWaitingOnDependency?: boolean;
  estimatedHours: number;
  actualHours: number;
  requiresDocumentation: boolean;
}

export interface WorkLog {
  id: string;
  taskId: string;
  date: string;
  hours: number;
  participantIds: string[];
  notes: string;
  photoUrl?: string;
  createdById?: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  meetingType?: MeetingType;
  seasonId?: string;
  projectIds?: string[];
  startAt: string;
  endAt: string | null;
  location?: string;
  description?: string;
  rsvpsYes: number;
  rsvpsMaybe: number;
  openSignIns: number;
}

export interface ScheduleEvent {
  id: string;
  seasonId: string;
  projectIds: string[];
  title: string;
  description: string;
  startAt: string;
  endAt: string | null;
  location: string;
  eventType: "competition" | "practice" | "outreach" | "other";
}

export interface Milestone {
  id: string;
  // Required in the milestone model, optional for legacy seeds.
  seasonId?: string;
  title: string;
  type: MilestoneType;
  startAt: string;
  endAt: string | null;
  isExternal: boolean;
  description: string;
  projectIds: string[];
  status: MilestoneStatus;
  photoUrl?: string;
}

export type MilestoneView = Milestone & { readinessStatus: ReadinessStatus };

export type MilestoneRequirementConditionType = "iteration" | "workflow-state" | "custom";

// Generalized milestone requirements: "What condition must be true by this milestone?"
export interface MilestoneRequirement {
  id: string;
  milestoneId: string;
  targetRefs: DomainReference[];
  conditionType: MilestoneRequirementConditionType;
  // Stored as a compact string so we can iterate on semantics without migrations in the seed store.
  // Examples: "iteration>=2", "state=COMPLETE", "state=QA_PASSED", "in_scope"
  conditionValue: string;
  required: boolean;
  sortOrder: number;
  notes: string;
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  date: string;
  totalHours: number;
}

export interface ReportBase {
  id: string;
  projectId: string;
  targetRefs: DomainReference[];
  createdByMemberId: string | null;
  participantIds: string[];
  mentorId: string | null;
  requestedById: string | null;
  summary: string;
  notes: string;
  evidenceNotes?: string;
  photoUrl?: string;
  createdAt: string;
  status: "draft" | "submitted" | "reviewed";
}

export interface QaReport extends ReportBase {
  reportType: "qa";
  result: QaResult;
  reviewedById: string | null;
  reviewedAt: string | null;
}

export interface TeamReport extends ReportBase {
  reportType: "practice" | "competition" | "review";
  result: string | null;
}

export type QaDomainReport = QaReport;
export type Report = QaReport | TeamReport;

export interface ReportFinding {
  id: string;
  reportId: string;
  targetRefs: DomainReference[];
  issueType: string;
  severity: RiskSeverity;
  notes: string;
  spawnedTaskId: string | null;
  spawnedIterationId: string | null;
  spawnedRiskId: string | null;
  title?: string;
  detail?: string;
  status?: "open" | "resolved";
  createdAt?: string;
  updatedAt?: string;
}

export type TaskDependency =
  | {
  id: string;
  taskId: string;
  kind: "task";
  refId: string;
  requiredState: TaskStatus;
  dependencyType: TaskDependencyType;
  createdAt: string;
}
  | {
  id: string;
  taskId: string;
  kind: "milestone";
  refId: string;
  requiredState: ReadinessStatus;
  dependencyType: TaskDependencyType;
  createdAt: string;
}
  | {
  id: string;
  taskId: string;
  kind: "part-instance";
  refId: string;
  requiredCondition:
    | { kind: "physical-location"; value: PartInstanceLocation["kind"] }
    | { kind: "derived-readiness"; value: ReadinessStatus };
  dependencyType: TaskDependencyType;
  createdAt: string;
};

export type AcquisitionMethod = "stock" | "purchase-cots" | "manufacture";
export type PurchaseKind = "cots-goods" | "manufacturing-service";
export type PurchaseApprovalStatus = "pending" | "approved" | "rejected";
export type PurchaseOrderStatus = "not-ordered" | "ordered" | "shipped" | "delivered" | "cancelled";
export interface Money { amount: number; currency: string | null }
export interface PurchaseQuote {
  id: string;
  vendorId: string;
  reference: string | null;
  amount: Money | null;
  url?: string;
  expiresAt?: string | null;
  quotedAt: string | null;
}
export interface PurchaseItem {
  id: string;
  taskId: string;
  kind: PurchaseKind;
  partDefinitionId: string | null;
  materialId: string | null;
  title: string;
  quantity: number;
  quotes: PurchaseQuote[];
  selectedQuoteId: string | null;
  approvalStatus: PurchaseApprovalStatus;
  approvedById: string | null;
  approvedAt: string | null;
  purchaseOrderNumber: string | null;
  orderStatus: PurchaseOrderStatus;
  finalCost: Money | null;
  expectedDeliveryDate: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  orderedAt: string | null;
  deliveredAt: string | null;
}

export interface Season {
  id: string;
  name: string;
  type: SeasonType;
  startDate: string;
  endDate: string;
}

export interface Project {
  id: string;
  teamId: string;
  seasonId: string;
  name: string;
  projectType: ProjectType;
  description: string;
  status: ProjectStatus;
}

export interface Workstream {
  id: string;
  projectId: string;
  name: string;
  color?: string;
  description: string;
  isArchived: boolean;
}

export interface QaRequest {
  id: string;
  projectId: string;
  targetRefs: DomainReference[];
  subject: string;
  mentorId: string | null;
  requestedById: string | null;
  createdAt: string;
  status: "requested" | "in-review" | "complete" | "cancelled";
}

export interface TestResult {
  id: string;
  projectId: string;
  targetRefs: DomainReference[];
  title: string;
  status: TestResultStatus;
}

interface FindingRecordBase {
  id: string;
  targetRefs: DomainReference[];
  projectId: string;
  title: string;
  detail: string;
  severity: RiskSeverity;
  status: FindingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QaFinding extends FindingRecordBase {
  reportId: string | null;
}

export interface TestFinding extends FindingRecordBase {
  reportId: string | null;
  testResultId: string;
}

export interface DesignIteration {
  id: string;
  sourceType: FindingSourceType;
  findingId: string;
  projectId: string;
  targetRefs: DomainReference[];
  notes: string;
  status: IterationStatus;
  createdAt: string;
  updatedAt: string;
}

export type RiskStatus = "open" | "in-progress" | "blocked" | "resolved";
export type RiskCategory = "help" | "dependency" | "design" | "manufacturing" | "supply" | "schedule" | "qa" | "inventory" | "other";
export type DomainReference =
  | { kind: "project" | "workstream" | "responsible-group" | "task" | "subsystem" | "mechanism" | "part-definition" | "part-instance" | "material" | "vendor" | "manufacturing-details" | "purchase-item" | "meeting" | "event" | "milestone" | "qa-request" | "test-result" | "report" | "artifact" | "qa-finding" | "test-finding" | "task-dependency" | "risk" | "design-iteration"; id: string };
export type RiskSource = { kind: "manual" } | { kind: "task" | "task-dependency" | "qa-finding" | "test-finding" | "qa-request" | "test-result" | "report" | "event" | "milestone" | "manufacturing-details" | "part-instance" | "material"; id: string };
export interface Risk {
  createdByMemberId?: string | null;
  id: string;
  projectId: string;
  title: string;
  detail: string;
  severity: RiskSeverity;
  category: RiskCategory;
  status: RiskStatus;
  blocksWork: boolean;
  source: RiskSource;
  relatedTargets: DomainReference[];
  mitigationTaskId: string | null;
  ownerGroupId: string | null;
  ownerMemberId: string | null;
  mitigationDueDate: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface Escalation {
  title: string;
  detail: string;
  severity: "high" | "medium";
}

export type SlackChannelKey =
  | "build"
  | "meetingPlansRecaps"
  | "programming"
  | "scoutingStrategy"
  | "transportationAttendance";

export interface SlackHomeChannel {
  key: SlackChannelKey;
  name: string;
  slackChannelId: string | null;
  visible: boolean;
}

export interface SlackHomeAlert {
  id: string;
  channelKey: SlackChannelKey;
  channelName: string;
  slackMessageTs: string;
  authorName: string;
  text: string;
  mentionedHandles: string[];
  postedAt: string;
  read: boolean;
}

export interface SlackHomeTodo {
  id: string;
  text: string;
  assigneeLabel: string | null;
  complete: boolean;
}

export interface SlackHomeMeetingRecap {
  id: string;
  channelKey: SlackChannelKey;
  channelName: string;
  slackMessageTs: string;
  authorName: string;
  text: string;
  postedAt: string;
  todos: SlackHomeTodo[];
}

export interface SlackHomeSummaryMessage {
  id: string;
  authorName: string;
  text: string;
  postedAt: string;
  replyCount: number;
}

export interface SlackHomeSummary {
  id: string;
  channelKey: SlackChannelKey;
  channelName: string;
  title: string;
  summary: string;
  messageCount: number;
  updatedAt: string;
  sourceMessages: SlackHomeSummaryMessage[];
}

export interface SlackHomeResponse {
  slackEnabled: boolean;
  slackConnected: boolean;
  slackError: string | null;
  userEmail: string | null;
  alertUsergroupHandles: string[];
  channels: SlackHomeChannel[];
  unreadAlerts: SlackHomeAlert[];
  meetingRecap: SlackHomeMeetingRecap | null;
  summaries: SlackHomeSummary[];
}

export interface PlatformSnapshot {
  snapshotSchemaVersion: 1;
  seasons: Season[];
  projects: Project[];
  workTypes: WorkType[];
  responsibleGroups: ResponsibleGroup[];
  workstreams: Workstream[];
  vendors: Vendor[];
  members: Member[];
  subsystems: Subsystem[];
  mechanisms: Mechanism[];
  materials: Material[];
  artifacts: Artifact[];
  partDefinitions: PartDefinition[];
  partInstances: PartInstance[];
  tasks: Task[];
  milestones: Milestone[];
  // Optional for legacy snapshots; normalized in the store on load.
  milestoneRequirements?: MilestoneRequirement[];
  taskDependencies: TaskDependency[];
  qaReports: QaReport[];
  teamReports: TeamReport[];
  qaRequests?: QaRequest[];
  testResults: TestResult[];
  qaFindings: QaFinding[];
  testFindings: TestFinding[];
  designIterations: DesignIteration[];
  risks: Risk[];
  workLogs: WorkLog[];
  meetings: Meeting[];
  events: ScheduleEvent[];
  attendanceRecords: AttendanceRecord[];
  manufacturingProcesses: ManufacturingProcessRecord[];
  purchaseItems: PurchaseItem[];
  escalations: Escalation[];
  actions?: AuditAction[];
}

export type ReadonlyData<T> = T extends object
  ? { readonly [Key in keyof T]: ReadonlyData<T[Key]> }
  : T;

export type SnapshotView = ReadonlyData<PlatformSnapshot>;
