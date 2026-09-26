import type {
  Artifact,
  ManufacturingItem,
  Material,
  Mechanism,
  Meeting,
  Member,
  Milestone,
  PartDefinition,
  PartInstance,
  Project,
  PurchaseItem,
  QaReport,
  QaRequest,
  Report,
  ReportFinding,
  Risk,
  Season,
  Subsystem,
  Task,
  TaskBlocker,
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
    | "blockers"
    | "isBlocked"
    | "isWaitingOnDependency"
    | "actualHours"
  >,
  "checklistItems"
>;

export type WorkLogInput = Omit<WorkLog, "id">;

export type MemberInput = OptionalFields<
  Omit<Member, "id">,
  "email" | "elevated" | "seasonId"
>;

export type MeetingInput = Omit<
  Meeting,
  | "id"
  | "date"
  | "time"
  | "rsvpsYes"
  | "rsvpsMaybe"
  | "openSignIns"
  | "startDateTime"
> & { startDateTime: string };

export type SeasonInput = Omit<Season, "id">;

export type ProjectInput = OptionalFields<
  Omit<Project, "id">,
  "teamId" | "description" | "status"
>;

export type PurchaseItemInput = Omit<PurchaseItem, "id">;

export type ManufacturingItemInput = OptionalFields<
  Omit<ManufacturingItem, "id">,
  "materialId" | "partInstanceId" | "partInstanceIds" | "inHouse"
>;

export type MaterialInput = Omit<Material, "id">;

export type ArtifactInput = OptionalFields<Omit<Artifact, "id">, "isArchived">;

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
  | "status"
  | "startDateTime"
  | "endDateTime"
  | "isExternal"
  | "description"
  | "projectIds"
  | "photoUrl"
>;

export type QaReportInput = Omit<QaReport, "id">;

export type QaRequestInput = OptionalFields<
  Omit<QaRequest, "id" | "createdAt" | "status">,
  "taskId" | "requestedById"
>;

export type TestResultInput = Omit<TestResult, "id">;

export type ReportInput = Omit<
  Report,
  "id" | "evidenceNotes" | "qaRequestId" | "mentorId" | "requestedById"
>;

export type ReportFindingInput = Pick<
  ReportFinding,
  | "reportId"
  | "mechanismId"
  | "partInstanceId"
  | "artifactInstanceId"
  | "issueType"
  | "severity"
  | "notes"
  | "spawnedTaskId"
  | "spawnedIterationId"
  | "spawnedRiskId"
>;

export type TaskDependencyInput = Omit<TaskDependency, "id" | "createdAt">;

export type TaskBlockerInput = OptionalFields<
  Omit<TaskBlocker, "id" | "createdAt" | "resolvedAt">,
  "status" | "createdByMemberId"
>;

export type RiskInput = Omit<Risk, "id">;
