import type {
  ReadonlyData,
  SnapshotView,
  Task,
  DomainReference,
  QaFinding,
  Report,
  ReportFinding,
  TestFinding,
} from "../../domain/types";

export interface FindingListItem {
  id: string;
  targetRefs: readonly DomainReference[];
  sourceType: "qa" | "test";
  sourceId: string | null;
  title: string;
  detail: string;
  severity: ReadonlyData<QaFinding>["severity"] | ReadonlyData<TestFinding>["severity"];
  status: ReadonlyData<QaFinding>["status"] | ReadonlyData<TestFinding>["status"];
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

function findingListItemFromFinding(
  finding: ReadonlyData<QaFinding> | ReadonlyData<TestFinding>,
  sourceType: FindingListItem["sourceType"],
  sourceId: string | null,
): FindingListItem {
  return {
    id: finding.id,
    targetRefs: finding.targetRefs,
    sourceType,
    sourceId,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    status: finding.status,
    projectId: finding.projectId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

export function reportFromQaReport(
  _task: ReadonlyData<Task> | undefined,
  report: SnapshotView["qaReports"][number],
  options: { includePhoto?: boolean } = {},
): ReadonlyData<Report> | null {
  const { photoUrl, ...base } = report;
  return {
    ...base,
    ...(options.includePhoto === false || !photoUrl ? {} : { photoUrl }),
    targetRefs: report.targetRefs.map((ref) => ({ ...ref })),
  };
}

export function reportFindingFromFinding(finding: ReadonlyData<QaFinding | TestFinding>): ReadonlyData<ReportFinding> | null {
  const reportId = finding.reportId;
  if (!reportId) {
    return null;
  }

  return {
    id: finding.id,
    reportId,
    targetRefs: finding.targetRefs,
    issueType: finding.title,
    severity: finding.severity,
    notes: finding.detail,
    spawnedTaskId: finding.targetRefs.find((ref) => ref.kind === "task")?.id ?? null,
    spawnedIterationId: null,
    spawnedRiskId: null,
    title: finding.title,
    detail: finding.detail,
    status: finding.status === "resolved" ? "resolved" : "open",
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

export function buildReports(snapshot: SnapshotView): ReadonlyData<Report[]> {
  return [
    ...snapshot.qaReports.map((report) => reportFromQaReport(undefined, report)),
    ...snapshot.teamReports,
  ].filter((report): report is ReadonlyData<Report> => report !== null);
}

export function buildFindings(snapshot: SnapshotView): FindingListItem[] {
  const qaItems = snapshot.qaFindings.map((finding) =>
    findingListItemFromFinding(finding, "qa", finding.reportId),
  );
  const testItems = snapshot.testFindings.map((finding) =>
    findingListItemFromFinding(finding, "test", finding.reportId),
  );

  return [...qaItems, ...testItems];
}
