import type { PlatformSnapshot } from "../domain/types";
import { apply2026SeasonSeed } from "./seed2026";

const snapshot: PlatformSnapshot = {
  snapshotSchemaVersion: 3,
  seasons: [],
  projects: [],
  workTypes: [],
  responsibleGroups: [],
  workstreams: [],
  vendors: [],
  members: [],
  subsystems: [],
  mechanisms: [],
  materials: [],
  materialTransactions: [],
  artifacts: [],
  partDefinitions: [],
  partInstances: [],
  tasks: [],
  milestones: [],
  milestoneRequirements: [],
  taskDependencies: [],
  qaReports: [],
  teamReports: [],
  qaRequests: [],
  testResults: [],
  qaFindings: [],
  testFindings: [],
  designIterations: [],
  risks: [],
  workLogs: [],
  meetings: [],
  events: [],
  attendanceRecords: [],
  manufacturingProcesses: [
    { id: "cnc", code: "cnc", name: "CNC", isActive: true },
    { id: "3d-print", code: "3d-print", name: "3D Print", isActive: true },
    { id: "fabrication", code: "fabrication", name: "Fabrication", isActive: true },
  ],
  purchaseItems: [],
  escalations: [],
  actions: [],
};

apply2026SeasonSeed(snapshot);

export { snapshot };
