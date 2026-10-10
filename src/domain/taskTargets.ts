import type { ReadonlyData, SnapshotView } from "./types";
import { partInstanceMechanismId, partInstanceSubsystemId } from "./partInstanceLocation";
import { uniqueIds } from "./ids";
import { z } from "zod";

export const taskTargetsSchema = z.object({
  workstreamIds: z.array(z.string().trim().min(1)),
  subsystemIds: z.array(z.string().trim().min(1)),
  mechanismIds: z.array(z.string().trim().min(1)),
  partInstanceIds: z.array(z.string().trim().min(1)),
});

export type TaskTargets = z.infer<typeof taskTargetsSchema>;

export const taskRecordTargetsSchema = taskTargetsSchema.loose().refine(
  (task) => taskTargetsSchema.keyof().options.every((field) =>
    !(field.slice(0, -1) in task) && new Set(task[field]).size === task[field].length,
  ),
  "Task records require unique target arrays without singular target mirrors.",
);


export function normalizeTaskTargetIds(
  snapshot: SnapshotView,
  input: Partial<ReadonlyData<TaskTargets>>,
  fallback?: ReadonlyData<TaskTargets>,
) {
  const partInstanceIds = uniqueIds(input.partInstanceIds ?? fallback?.partInstanceIds ?? []);
  const parts = partInstanceIds.flatMap((id) => snapshot.partInstances.find((part) => part.id === id) ?? []);
  const mechanismIds = uniqueIds([
    ...(input.mechanismIds ?? fallback?.mechanismIds ?? []),
    ...parts.map(partInstanceMechanismId),
  ]);
  const mechanisms = mechanismIds.flatMap((id) => snapshot.mechanisms.find((mechanism) => mechanism.id === id) ?? []);
  return {
    workstreamIds: uniqueIds(input.workstreamIds ?? fallback?.workstreamIds ?? []),
    subsystemIds: uniqueIds([
      ...(input.subsystemIds ?? fallback?.subsystemIds ?? []),
      ...mechanisms.map((mechanism) => mechanism.subsystemId),
      ...parts.map(partInstanceSubsystemId),
    ]),
    mechanismIds,
    partInstanceIds,
  };
}
