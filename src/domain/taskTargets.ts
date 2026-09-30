import { z } from "zod";

export const taskTargetsSchema = z.object({
  workstreamIds: z.array(z.string().trim().min(1)),
  subsystemIds: z.array(z.string().trim().min(1)),
  mechanismIds: z.array(z.string().trim().min(1)),
  partInstanceIds: z.array(z.string().trim().min(1)),
  artifactIds: z.array(z.string().trim().min(1)),
});

export type TaskTargets = z.infer<typeof taskTargetsSchema>;

export const taskRecordTargetsSchema = taskTargetsSchema.loose().refine(
  (task) => taskTargetsSchema.keyof().options.every((field) =>
    !(field.slice(0, -1) in task) && new Set(task[field]).size === task[field].length,
  ),
  "Task records require unique target arrays without singular target mirrors.",
);
