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


export type MaterialInput = Omit<Material, "id">;

export type ArtifactInput = OptionalFields<Omit<Artifact, "id" | "targetRefs">, "isArchived"> & { targetRefs?: Artifact["targetRefs"] };

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

export type QaReportInput = Omit<QaReport, "id" | "targetRefs"> & { targetRefs?: QaReport["targetRefs"] };

export type QaRequestInput = OptionalFields<
  Omit<QaRequest, "id" | "createdAt" | "status">,
  "taskId" | "requestedById" | "projectId" | "targetRefs"
>;

export type TestResultInput = Omit<TestResult, "id" | "targetRefs" | "projectId"> & { targetRefs?: TestResult["targetRefs"]; projectId?: string };

export type ReportInput = Omit<
  Report,
  "id" | "targetRefs" | "evidenceNotes" | "qaRequestId" | "mentorId" | "requestedById"
> & { targetRefs?: Report["targetRefs"] };

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

export type TaskDependencyInput = TaskDependency extends infer Dependency
  ? Dependency extends TaskDependency
    ? Omit<Dependency, "id" | "createdAt">
    : never
  : never;


export type RiskInput = Omit<Risk, "id" | "createdAt" | "updatedAt" | "resolvedAt"> & {
  resolvedAt?: string | null;
};
