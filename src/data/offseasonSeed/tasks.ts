import type { SeedTask } from "../seedTypes";
import { offseasonReadinessTasks } from "./tasksReadiness";
import { offseasonEventTasks } from "./tasksEvents";

export const offseasonTasks = [
  ...offseasonReadinessTasks,
  ...offseasonEventTasks,
] satisfies SeedTask[];
