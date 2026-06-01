import type {
  Mechanism,
  PartDefinition,
  Subsystem,
  Task,
  Workstream,
} from "../domain/types";

export type IteratedSeed<T extends { iteration: number; isArchived: boolean }> = Omit<
  T,
  "iteration" | "isArchived"
> &
  Partial<Pick<T, "iteration" | "isArchived">>;

export type SeedSubsystem = IteratedSeed<Subsystem>;
export type SeedMechanism = IteratedSeed<Mechanism>;
export type SeedPartDefinition = Omit<IteratedSeed<PartDefinition>, "seasonId" | "activeSeasonIds"> &
  Partial<Pick<PartDefinition, "seasonId" | "activeSeasonIds">>;
export type SeedWorkstream = Omit<Workstream, "isArchived"> & Partial<Pick<Workstream, "isArchived">>;

export type SeedTask = Omit<
  Task,
  | "workstreamIds"
  | "subsystemIds"
  | "mechanismIds"
  | "partInstanceIds"
  | "artifactId"
  | "artifactIds"
  | "assigneeIds"
> &
  Partial<
    Pick<
      Task,
      | "workstreamIds"
      | "subsystemIds"
      | "mechanismIds"
      | "partInstanceIds"
      | "artifactId"
      | "artifactIds"
      | "assigneeIds"
    >
  >;
