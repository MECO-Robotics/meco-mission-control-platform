import type {
  Artifact,
  Material,
  Mechanism,
  Meeting,
  Member,
  Milestone,
  PartDefinition,
  PartInstance,
  Project,
  ResponsibleGroup,
  PurchaseItem,
  QaReport,
  QaRequest,
  Report,
  ReportFinding,
  Risk,
  Season,
  Subsystem,
  Task,
  TaskDependency,
  TestResult,
  WorkLog,
  Workstream,
} from "../domain/types";

// Store commands share entity fields; only generated fields and defaults differ.
type OptionalFields<T, Keys extends keyof T> = Omit<T, Keys> & Partial<Pick<T, Keys>>;

export type TaskInput = OptionalFields<
  Omit<
    Task,
    | "id"
    | "createdAt"
    | "serialNumber"
    | "serial"
    | "isBlocked"
    | "isWaitingOnDependency"
    | "actualHours"
  >,
  "checklistItems" | "responsibleGroupId" | "requestedById" | "scheduleRefs" | "manufacturingDetails"
>;

export type WorkLogInput = Omit<WorkLog, "id">;

export type MemberInput = OptionalFields<
  Omit<Member, "id">,
  "email" | "elevated" | "seasonId"
>;

export type ResponsibleGroupInput = Omit<ResponsibleGroup, "id" | "isArchived"> & Partial<Pick<ResponsibleGroup, "isArchived">>;

export type MeetingInput = Omit<
  Meeting,
  | "id"
  | "rsvpsYes"
  | "rsvpsMaybe"
  | "openSignIns"
>;

export type SeasonInput = Omit<Season, "id">;

export type ProjectInput = OptionalFields<
  Omit<Project, "id">,
  "teamId" | "description" | "status"
>;

export type PurchaseItemInput = Omit<PurchaseItem, "id">;


export type MaterialInput = Omit<Material, "id">;

export type ArtifactInput = Omit<Artifact, "id" | "targetRefs"> & { targetRefs?: Artifact["targetRefs"] };

export type WorkstreamInput = OptionalFields<Omit<Workstream, "id">, "isArchived">;

export type SubsystemInput = OptionalFields<
  Omit<Subsystem, "id" | "isCore">,
  "iteration" | "isArchived"
>;

export type MechanismInput = OptionalFields<
  Omit<Mechanism, "id">,
  "iteration" | "isArchived"
>;

export type PartDefinitionInput = OptionalFields<
  Omit<PartDefinition, "id">,
  "seasonId" | "iteration" | "isArchived"
>;

export type PartInstanceInput = Omit<PartInstance, "id">;

export type MilestoneInput = Pick<
  Milestone,
  | "title"
  | "type"
  | "startAt"
  | "endAt"
  | "isExternal"
  | "description"
  | "projectIds"
  | "photoUrl"
> & Partial<Pick<Milestone, "status">>;

export type QaReportInput = Omit<QaReport, "id" | "projectId" | "createdByMemberId" | "summary" | "status" | "reviewedById" | "createdAt" | "reportType"> & { projectId: string; createdByMemberId?: string | null; summary?: string; status?: QaReport["status"]; reviewedById?: string | null; createdAt?: string };

export type QaRequestInput = OptionalFields<
  Omit<QaRequest, "id" | "createdAt" | "status">,
  "requestedById" | "projectId" | "targetRefs" | "mentorId"
>;

export type TestResultInput = Omit<TestResult, "id" | "targetRefs" | "projectId"> & { targetRefs: TestResult["targetRefs"]; projectId?: string };

export type ReportInput = Report extends infer Value
  ? Value extends Report
    ? Omit<Value, "id">
    : never
  : never;

export type ReportFindingInput = Pick<
  ReportFinding,
  | "reportId"
  | "targetRefs"
  | "issueType"
  | "severity"
  | "notes"
  | "spawnedTaskId"
  | "spawnedIterationId"
  | "spawnedRiskId"
>;

export type TaskDependencyInput = TaskDependency extends infer Dependency
  ? Dependency extends TaskDependency
    ? Omit<Dependency, "id" | "createdAt">
    : never
  : never;


export type RiskInput = Omit<Risk, "id" | "createdAt" | "updatedAt" | "resolvedAt"> & {
  resolvedAt?: string | null;
};
