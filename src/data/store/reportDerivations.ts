import type {
  PlatformSnapshot,
  Task,
  Milestone,
  QaFinding,
  Report,
  ReportFinding,
  TestFinding,
} from "../../domain/types";

export interface FindingListItem {
  id: string;
  sourceType: "qa" | "test";
  sourceId: string | null;
  title: string;
  detail: string;
  severity: QaFinding["severity"] | TestFinding["severity"];
  status: QaFinding["status"] | TestFinding["status"];
  projectId: string;
  workstreamId: string | null;
  subsystemId: string | null;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactId: string | null;
  taskId: string | null;
  milestoneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function reportFromQaReport(
  task: Task | undefined,
  report: PlatformSnapshot["qaReports"][number],
  options: { includePhoto?: boolean } = {},
): Report | null {
  if (!task) {
    return null;
  }

  return {
    id: report.id,
    reportType: "QA",
    projectId: task.projectId,
    taskId: report.taskId,
    milestoneId: null,
    workstreamId: task.workstreamId,
    createdByMemberId: null,
    result: report.result,
    summary: report.notes,
    notes: report.notes,
    ...(options.includePhoto === false ? {} : { photoUrl: report.photoUrl }),
    createdAt: report.reviewedAt,
    participantIds: report.participantIds,
    mentorApproved: report.mentorApproved,
    reviewedAt: report.reviewedAt,
    targetRiskId: report.targetRiskId ?? null,
    proposedRiskSeverity: report.proposedRiskSeverity ?? null,
    proposedRiskStatus: report.proposedRiskStatus ?? null,
    title: task.title,
  };
}

export function reportFromTestResult(
  milestone: Milestone | undefined,
  result: PlatformSnapshot["testResults"][number],
  projectId: string | null,
  options: { includePhoto?: boolean } = {},
): Report | null {
  if (!projectId) {
    return null;
  }

  return {
    id: result.id,
    reportType: "MilestoneTest",
    projectId,
    taskId: null,
    milestoneId: result.milestoneId,
    workstreamId: null,
    createdByMemberId: null,
    result: result.status,
    summary: result.title,
    notes: result.findings.join("\n"),
    ...(options.includePhoto === false ? {} : { photoUrl: result.photoUrl }),
    createdAt: milestone?.startDateTime.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    title: result.title,
    status: result.status,
    findings: result.findings,
  };
}

export function reportFindingFromQaFinding(finding: QaFinding): ReportFinding | null {
  if (!finding.qaReportId) {
    return null;
  }

  return {
    id: finding.id,
    reportId: finding.qaReportId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactInstanceId: finding.artifactId,
    issueType: finding.title,
    severity: finding.severity,
    notes: finding.detail,
    spawnedTaskId: finding.taskId,
    spawnedIterationId: null,
    spawnedRiskId: null,
    title: finding.title,
    detail: finding.detail,
    status: finding.status === "resolved" ? "resolved" : "open",
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    taskId: finding.taskId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

export function reportFindingFromTestFinding(finding: TestFinding): ReportFinding | null {
  if (!finding.testResultId) {
    return null;
  }

  return {
    id: finding.id,
    reportId: finding.testResultId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactInstanceId: finding.artifactId,
    issueType: finding.title,
    severity: finding.severity,
    notes: finding.detail,
    spawnedTaskId: finding.taskId,
    spawnedIterationId: null,
    spawnedRiskId: null,
    title: finding.title,
    detail: finding.detail,
    status: finding.status === "resolved" ? "resolved" : "open",
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    taskId: finding.taskId,
    milestoneId: finding.milestoneId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

export function buildReports(snapshot: PlatformSnapshot): Report[] {
  return [
    ...snapshot.qaReports.map((report) =>
      reportFromQaReport(snapshot.tasks.find((task) => task.id === report.taskId), report)),
    ...snapshot.testResults.map((result) => {
      const milestone = snapshot.milestones.find((item) => item.id === result.milestoneId);
      return reportFromTestResult(milestone, result, milestone?.projectIds[0] ?? snapshot.projects[0]?.id ?? null);
    }),
  ].filter((report): report is Report => report !== null);
}

export function buildFindings(snapshot: PlatformSnapshot): FindingListItem[] {
  const qaItems: FindingListItem[] = snapshot.qaFindings.map((finding) => ({
    id: finding.id,
    sourceType: "qa",
    sourceId: finding.qaReportId,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    status: finding.status,
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactId: finding.artifactId,
    taskId: finding.taskId,
    milestoneId: null,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  }));

  const testItems: FindingListItem[] = snapshot.testFindings.map((finding) => ({
    id: finding.id,
    sourceType: "test",
    sourceId: finding.testResultId,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    status: finding.status,
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactId: finding.artifactId,
    taskId: finding.taskId,
    milestoneId: finding.milestoneId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  }));

  return [...qaItems, ...testItems];
}
