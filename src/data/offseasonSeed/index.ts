import type { PlatformSnapshot } from "../../domain/types";
import type { SeedMechanism, SeedPartDefinition, SeedTask } from "../seedTypes";
import { offseasonAttendanceRecords, offseasonMeetings, offseasonWorkLogs } from "./activity";
import { offseasonTaskBlockers, offseasonTaskDependencies } from "./constraints";
import {
  offseasonArtifacts,
  offseasonMaterials,
  offseasonMechanisms,
  offseasonMembers,
  offseasonPartDefinitions,
  offseasonPartInstances,
} from "./inventory";
import {
  offseasonEscalations,
  offseasonManufacturingItems,
  offseasonPurchaseItems,
  offseasonQaReviews,
} from "./operations";
import { offseasonMilestones, offseasonTasks } from "./planning";
import {
  offseasonDesignIterations,
  offseasonQaFindings,
  offseasonQaReports,
  offseasonRisks,
  offseasonTestFindings,
  offseasonTestResults,
} from "./quality";

type OffseasonSeedAdditions = Pick<
  PlatformSnapshot,
  | "members"
  | "materials"
  | "artifacts"
  | "partInstances"
  | "milestones"
  | "qaReports"
  | "testResults"
  | "qaFindings"
  | "testFindings"
  | "designIterations"
  | "risks"
  | "workLogs"
  | "meetings"
  | "attendanceRecords"
  | "manufacturingItems"
  | "purchaseItems"
  | "qaReviews"
  | "escalations"
> & {
  mechanisms: SeedMechanism[];
  partDefinitions: SeedPartDefinition[];
  tasks: SeedTask[];
};

export const offseasonSeedAdditions = {
  members: offseasonMembers,
  mechanisms: offseasonMechanisms,
  materials: offseasonMaterials,
  artifacts: offseasonArtifacts,
  partDefinitions: offseasonPartDefinitions,
  partInstances: offseasonPartInstances,
  milestones: offseasonMilestones,
  tasks: offseasonTasks,
  qaReports: offseasonQaReports,
  testResults: offseasonTestResults,
  qaFindings: offseasonQaFindings,
  testFindings: offseasonTestFindings,
  designIterations: offseasonDesignIterations,
  risks: offseasonRisks,
  workLogs: offseasonWorkLogs,
  meetings: offseasonMeetings,
  attendanceRecords: offseasonAttendanceRecords,
  manufacturingItems: offseasonManufacturingItems,
  purchaseItems: offseasonPurchaseItems,
  qaReviews: offseasonQaReviews,
  escalations: offseasonEscalations,
} satisfies OffseasonSeedAdditions;

export { offseasonTaskBlockers, offseasonTaskDependencies };
