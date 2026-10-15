import type {
  Milestone,
  MilestoneRequirement,
  PartInstance,
  ReadinessStatus,
  SnapshotView,
  ReadonlyData,
} from "./types";

function hasTarget(targets: readonly { kind: string; id: string }[], kind: string, id: string) {
  return targets.some((target) => target.kind === kind && target.id === id);
}

export function derivePartInstanceReadiness(part: ReadonlyData<PartInstance>, snapshot: SnapshotView): ReadinessStatus {
  const relatedTasks = snapshot.tasks.filter((task) => task.partInstanceIds.includes(part.id));
  const taskIds = new Set(relatedTasks.map((task) => task.id));
  if (snapshot.risks.some((risk) => risk.status !== "resolved" && (
    hasTarget(risk.relatedTargets, "part-instance", part.id) || [...taskIds].some((id) => hasTarget(risk.relatedTargets, "task", id))
  ))) return "blocked";

  const findings = [...snapshot.qaFindings, ...snapshot.testFindings];
  if (findings.some((finding) => finding.status !== "resolved" && (
    hasTarget(finding.targetRefs, "part-instance", part.id) || [...taskIds].some((id) => hasTarget(finding.targetRefs, "task", id))
  ))) return "blocked";

  const currentRevision = snapshot.partDefinitions.find((definition) => definition.id === part.partDefinitionId)?.revision;
  const matchesPartOrTask = (refs: readonly { kind: string; id: string }[]) =>
    hasTarget(refs, "part-instance", part.id) || hasTarget(refs, "part-definition", part.partDefinitionId) ||
    [...taskIds].some((id) => hasTarget(refs, "task", id));
  const hasStaleOutcome = snapshot.qaReports.some((report) => report.status === "reviewed" && matchesPartOrTask(report.targetRefs) &&
    report.targetRevisions?.[part.partDefinitionId] !== currentRevision) ||
    snapshot.testResults.some((result) => matchesPartOrTask(result.targetRefs) &&
      result.targetRevisions?.[part.partDefinitionId] !== currentRevision);
  const qa = snapshot.qaReports.filter((report) =>
    report.status === "reviewed" &&
    matchesPartOrTask(report.targetRefs) &&
    currentRevision !== undefined && report.targetRevisions?.[part.partDefinitionId] === currentRevision,
  );
  const latestQa = qa.reduce<typeof qa[number] | undefined>((latest, report) =>
    !latest || Date.parse(report.createdAt) >= Date.parse(latest.createdAt) ? report : latest, undefined);
  if (latestQa?.result === "iteration-worthy") return "blocked";
  if (latestQa?.result === "minor-fix") return "qa";

  const tests = snapshot.testResults.filter((result) =>
    matchesPartOrTask(result.targetRefs) &&
    currentRevision !== undefined && result.targetRevisions?.[part.partDefinitionId] === currentRevision && result.createdAt,
  );
  const latestTestsByTitle = new Map<string, typeof tests[number]>();
  for (const result of tests) {
    const latest = latestTestsByTitle.get(result.title);
    if (!latest || Date.parse(result.createdAt!) >= Date.parse(latest.createdAt!)) latestTestsByTitle.set(result.title, result);
  }
  const latestTests = [...latestTestsByTitle.values()];
  if (latestTests.some((result) => result.status === "fail" || result.status === "blocked")) return "blocked";
  if (latestTests.some((result) => result.status === "pass")) return "ready";
  if (latestQa?.result === "pass") return "ready";
  if (relatedTasks.some((task) => task.status === "waiting-for-qa")) return "qa";
  if (hasStaleOutcome) return "not-ready";
  if (relatedTasks.length > 0 && relatedTasks.every((task) => task.status === "complete")) return "ready";
  return "not-ready";
}

function requirementSatisfied(requirement: ReadonlyData<MilestoneRequirement>, snapshot: SnapshotView): boolean {
  if (requirement.conditionType === "custom") return requirement.targetRefs.length > 0 && requirement.conditionValue.trim().toLowerCase() === "in_scope";
  return requirement.targetRefs.length > 0 && requirement.targetRefs.every((targetRef) => {
  if (requirement.conditionType === "iteration") {
    const match = requirement.conditionValue.trim().match(/^iteration\s*(?:([<>]=?|==|=)\s*)?(\d+)$/i);
    if (!match) return false;
    const target = targetRef.kind === "subsystem"
      ? snapshot.subsystems.find((item) => item.id === targetRef.id)
      : targetRef.kind === "mechanism"
        ? snapshot.mechanisms.find((item) => item.id === targetRef.id)
        : undefined;
    if (!target) return false;
    const operator = match[1] ?? "=";
    const expected = Number(match[2]);
    return operator === ">=" ? target.iteration >= expected
      : operator === ">" ? target.iteration > expected
        : operator === "<=" ? target.iteration <= expected
          : operator === "<" ? target.iteration < expected
            : target.iteration === expected;
  }
  const state = requirement.conditionValue.replace(/^state\s*=\s*/i, "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (targetRef.kind === "artifact") {
    const actual = snapshot.artifacts.find((item) => item.id === targetRef.id)?.status;
    return actual?.toUpperCase().replace(/-/g, "_") === state || (state === "COMPLETE" && actual === "published");
  }
  if (targetRef.kind === "part-instance") {
    const part = snapshot.partInstances.find((item) => item.id === targetRef.id);
    return part ? derivePartInstanceReadiness(part, snapshot).toUpperCase().replace(/-/g, "_") === state : false;
  }
  return false;
  });
}

export function deriveMilestoneReadiness(milestone: ReadonlyData<Milestone>, snapshot: SnapshotView): ReadinessStatus {
  const projectIds = new Set(milestone.projectIds);
  const hasOpenRisk = snapshot.risks.some((risk) => risk.status !== "resolved" && (
    hasTarget(risk.relatedTargets, "milestone", milestone.id) || [...projectIds].some((id) => hasTarget(risk.relatedTargets, "project", id))
  ));
  if (hasOpenRisk) return "blocked";
  const required = (snapshot.milestoneRequirements ?? []).filter((item) => item.milestoneId === milestone.id && item.required);
  const verificationCriteria = required.filter((item) =>
    !(item.conditionType === "custom" && item.conditionValue.trim().toLowerCase() === "in_scope"),
  );
  if (verificationCriteria.length === 0) return "not-ready";
  if (required.some((item) => !requirementSatisfied(item, snapshot))) return "not-ready";
  if (required.some((item) => item.targetRefs.some((ref) => ref.kind === "part-instance" && snapshot.partInstances.some((part) => part.id === ref.id && derivePartInstanceReadiness(part, snapshot) === "qa")))) return "qa";
  return "ready";
}
