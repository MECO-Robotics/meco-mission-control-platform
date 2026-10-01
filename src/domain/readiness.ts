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

  const qa = snapshot.qaReports.filter((report) => hasTarget(report.targetRefs, "part-instance", part.id) || [...taskIds].some((id) => hasTarget(report.targetRefs, "task", id)));
  if (qa.some((report) => report.result === "iteration-worthy")) return "blocked";
  if (qa.some((report) => report.result === "minor-fix")) return "qa";
  if (qa.some((report) => report.result === "pass")) return "ready";

  const tests = snapshot.testResults.filter((result) => hasTarget(result.targetRefs, "part-instance", part.id) || [...taskIds].some((id) => hasTarget(result.targetRefs, "task", id)));
  if (tests.some((result) => result.status === "fail" || result.status === "blocked")) return "blocked";
  if (tests.some((result) => result.status === "pass")) return "ready";
  if (relatedTasks.some((task) => task.status === "waiting-for-qa")) return "qa";
  if (relatedTasks.length > 0 && relatedTasks.every((task) => task.status === "complete")) return "ready";
  return "not-ready";
}

function requirementSatisfied(requirement: MilestoneRequirement, snapshot: SnapshotView): boolean {
  if (requirement.conditionType === "custom") return requirement.conditionValue.trim().toLowerCase() === "in_scope";
  if (requirement.conditionType === "iteration") {
    const match = requirement.conditionValue.trim().match(/^iteration\s*(?:([<>]=?|==|=)\s*)?(\d+)$/i);
    if (!match) return false;
    const target = requirement.targetType === "subsystem"
      ? snapshot.subsystems.find((item) => item.id === requirement.targetId)
      : requirement.targetType === "mechanism"
        ? snapshot.mechanisms.find((item) => item.id === requirement.targetId)
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
  if (requirement.targetType === "artifact") {
    const actual = snapshot.artifacts.find((item) => item.id === requirement.targetId)?.status;
    return actual?.toUpperCase().replace(/-/g, "_") === state || (state === "COMPLETE" && actual === "published");
  }
  if (requirement.targetType === "part-instance") {
    const part = snapshot.partInstances.find((item) => item.id === requirement.targetId);
    return part ? derivePartInstanceReadiness(part, snapshot).toUpperCase().replace(/-/g, "_") === state : false;
  }
  return false;
}

export function deriveMilestoneReadiness(milestone: ReadonlyData<Milestone>, snapshot: SnapshotView): ReadinessStatus {
  const projectIds = new Set(milestone.projectIds);
  const hasOpenRisk = snapshot.risks.some((risk) => risk.status !== "resolved" && (
    hasTarget(risk.relatedTargets, "milestone", milestone.id) || [...projectIds].some((id) => hasTarget(risk.relatedTargets, "project", id))
  ));
  if (hasOpenRisk) return "blocked";
  const required = (snapshot.milestoneRequirements ?? []).filter((item) => item.milestoneId === milestone.id && item.required);
  if (required.some((item) => !requirementSatisfied(item, snapshot))) return "not-ready";
  if (required.some((item) => item.targetType === "part-instance" && snapshot.partInstances.some((part) => part.id === item.targetId && derivePartInstanceReadiness(part, snapshot) === "qa"))) return "qa";
  return "ready";
}
