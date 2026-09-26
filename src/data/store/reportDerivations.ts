import type {
  ReadonlyData,
  SnapshotView,
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
  severity: ReadonlyData<QaFinding>["severity"] | ReadonlyData<TestFinding>["severity"];
  status: ReadonlyData<QaFinding>["status"] | ReadonlyData<TestFinding>["status"];
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

function findingListItemFromFinding(
  finding: ReadonlyData<QaFinding> | ReadonlyData<TestFinding>,
  sourceType: FindingListItem["sourceType"],
  sourceId: string | null,
  milestoneId: string | null,
): FindingListItem {
  return {
    id: finding.id,
    sourceType,
    sourceId,
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
    milestoneId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

export function reportFromQaReport(
  task: ReadonlyData<Task> | undefined,
  report: SnapshotView["qaReports"][number],
  options: { includePhoto?: boolean } = {},
): ReadonlyData<Report> | null {
  if (!task) {
    return null;
  }

  return {
    id: report.id,
    reportType: "QA",
    projectId: task.projectId,
    taskId: report.taskId,
    milestoneId: null,
    workstreamId: (task.workstreamIds[0] ?? null),
    createdByMemberId: null,
    result: report.result,
    summary: report.notes,
    notes: report.notes,
    ...(options.includePhoto === false ? {} : { photoUrl: report.photoUrl }),
    createdAt: report.reviewedAt,
    participantIds: report.participantIds,
    mentorApproved: report.mentorApproved,
    reviewedAt: report.reviewedAt,
    evidenceNotes: report.evidenceNotes ?? "",
    qaRequestId: report.qaRequestId ?? null,
    mentorId: report.mentorId ?? null,
    requestedById: report.requestedById ?? null,
    targetRiskId: report.targetRiskId ?? null,
    proposedRiskSeverity: report.proposedRiskSeverity ?? null,
    proposedRiskStatus: report.proposedRiskStatus ?? null,
    title: task.title,
  };
}

export function reportFromTestResult(
  milestone: ReadonlyData<Milestone> | undefined,
  result: SnapshotView["testResults"][number],
  projectId: string | null,
  options: { includePhoto?: boolean } = {},
): ReadonlyData<Report> | null {
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

export function reportFindingFromFinding(finding: ReadonlyData<QaFinding | TestFinding>): ReadonlyData<ReportFinding> | null {
  const reportId = "qaReportId" in finding ? finding.qaReportId : finding.testResultId;
  if (!reportId) {
    return null;
  }

  return {
    id: finding.id,
    reportId,
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
    ...("testResultId" in finding ? { milestoneId: finding.milestoneId } : {}),
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

export function buildReports(snapshot: SnapshotView): ReadonlyData<Report[]> {
  return [
    ...snapshot.qaReports.map((report) =>
      reportFromQaReport(snapshot.tasks.find((task) => task.id === report.taskId), report)),
    ...snapshot.testResults.map((result) => {
      const milestone = snapshot.milestones.find((item) => item.id === result.milestoneId);
      return reportFromTestResult(milestone, result, milestone?.projectIds[0] ?? snapshot.projects[0]?.id ?? null);
    }),
  ].filter((report): report is ReadonlyData<Report> => report !== null);
}

export function buildFindings(snapshot: SnapshotView): FindingListItem[] {
  const qaItems = snapshot.qaFindings.map((finding) =>
    findingListItemFromFinding(finding, "qa", finding.qaReportId, null),
  );
  const testItems = snapshot.testFindings.map((finding) =>
    findingListItemFromFinding(finding, "test", finding.testResultId, finding.milestoneId),
  );

  return [...qaItems, ...testItems];
}
