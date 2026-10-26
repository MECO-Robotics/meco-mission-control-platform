import source from "./season2026Seed.json";
import type { PlatformSnapshot, TaskDependency } from "../domain/types";

type SeedArea = "robot" | "operations" | "outreach" | "media" | "strategy" | "training";
type TaskCandidate = (typeof source.taskCandidates)[number];

export const contextualTaskProjectAreas: Record<string, SeedArea> = {
  "task-src-21ef9e060b0dba": "robot", // Gantt design sequence identifies the master sketch as robot design work.
  "task-src-9bcabb65dcc9f5": "robot", // Vision-stack validation is robot integration work.
};

const taskHeadings = /^(?:mechanical|electrical|programming|recap|intake|shooter|hopper|conveyer|conveyor|cad):?$/i;
const robotTask = /\b(?:robot|intake|shooter|convey[eo]r|hopper|chassis|climb(?:er)?|swerve|bumper|hood|flywheel|vision|motor|drivetrain|drive train|autonomous|spark ?max(?:es)?|neo|battery|rio|pdp|pdh|can loops?|rack|roller|gearbox|pigeon|limelight|photonvision|questnav|delta[- ]?v)\b/i;
const mediaTask = /\b(?:photo|photography|video|website|social media|media post|announcement|graphic|design post)\b/i;
const outreachTask = /\b(?:outreach|maker faire|roboticon|stemventure|impact award|sponsor|thank.?you note|community event)\b/i;
const trainingTask = /\b(?:training|presentation|student interview|leadership application|safety instruction|lesson)\b/i;
const strategyTask = /\b(?:scouting|game strategy|drive team|strategy meeting)\b/i;

export function isActionableSeedTask(title: string): boolean {
  return !taskHeadings.test(title.trim());
}

export function inferTaskProjectArea(title: string): SeedArea | null {
  if (robotTask.test(title)) return "robot";
  if (mediaTask.test(title)) return "media";
  if (outreachTask.test(title)) return "outreach";
  if (trainingTask.test(title)) return "training";
  if (strategyTask.test(title)) return "strategy";
  return null;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function estimatedDuration(title: string, area: SeedArea) {
  if (/call|email|submit|send|post|order|inventory|update|inspect|assign|thank.?you|rsvp/i.test(title)) return 1;
  if (/design|cad|build|fabricat|assemble|integrat|wire|program|test|tune|practice|overhaul|reinforce/i.test(title)) return 5;
  if (/plan|schedule|research|application|award|prep|training|organize/i.test(title)) return 3;
  return area === "robot" ? 3 : 2;
}

export function taskScheduleWindow(candidate: TaskCandidate, area: SeedArea, sourceActivityDate: string | null, explicitDueDate: string | null) {
  const duration = estimatedDuration(candidate.title ?? "", area);
  const explicitDue = explicitDueDate !== null && sourceActivityDate !== null && explicitDueDate >= sourceActivityDate;
  const startDate = sourceActivityDate
    ? candidate.status === "complete" ? shiftDate(sourceActivityDate, -(duration - 1)) : sourceActivityDate
    : explicitDue ? explicitDueDate : null;
  const dueDate = explicitDue
    ? explicitDueDate
    : sourceActivityDate
      ? candidate.status === "complete" ? sourceActivityDate : shiftDate(sourceActivityDate, duration - 1)
      : null;
  const malformedNovemberFollowUp = candidate.sourceEntryId === "meeting-d7d34b6c1803df";
  const note = startDate && dueDate
    ? `Planning window: ${startDate} to ${dueDate}. Estimated ${duration}-calendar-day duration; exact task dates and duration were not reported. The window is anchored to the source activity date.`
    : malformedNovemberFollowUp
      ? "No planning window assigned: source date label Tue, 11/0 is malformed and retained for review."
      : "No planning window could be estimated from the source date.";
  return { startDate, dueDate, note };
}

export function hasExplicitOpenProgressEvidence(candidate: TaskCandidate): boolean {
  return Boolean(candidate.statusEvidence && !candidate.status);
}

export function buildSeedTaskDependencies(taskIds: ReadonlySet<string>, recordedAt: string): TaskDependency[] {
  const explicit: TaskDependency[] = source.sequenceDependencies.map((dependency) => ({
    id: dependency.id, taskId: dependency.taskId, kind: "task", refId: dependency.prerequisiteTaskId,
    requiredState: "complete", dependencyType: "hard", createdAt: recordedAt,
  }));
  const inferred: [string, string][] = [
    ["task-src-a24a6d0bd5a24d", "task-src-a7de5bd6c4a253"], // detailed CAD follows block CAD
    ["task-src-a24a6d0bd5a24d", "task-src-21ef9e060b0dba"], // detailed CAD follows the master sketch
    ["task-src-31f513ac5116b3", "task-src-21ef9e060b0dba"], // design review follows the master sketch
    ["task-src-bf101f73af7c7a", "task-src-0242b9d32c4057"], // parts order follows intake/conveyor design review
    ["task-src-0cd8f6c3d5923e", "task-src-b4d09cf2e1563b"], // chassis wiring follows chassis construction
    ["task-src-03d276da6f56e4", "task-src-6e7bb2451509ee"], // powered integration follows chassis wiring
    ["task-src-7cb6704021256b", "task-src-b949498139e388"], // install the vision mount after its CAD
    ["task-src-9bcabb65dcc9f5", "task-src-7cb6704021256b"], // check the vision stack after the mount is installed
    ["task-src-7d10b59800e9d9", "slack-task-6db93584dd95c7"], // finish transportation after it is arranged
  ];
  return [
    ...explicit,
    ...inferred.flatMap(([taskId, prerequisiteId], index) => taskIds.has(taskId) && taskIds.has(prerequisiteId)
      ? [{ id: `task-dependency-slack-sequence-${index + 1}`, taskId, kind: "task" as const, refId: prerequisiteId, requiredState: "complete" as const, dependencyType: "soft" as const, createdAt: recordedAt }]
      : []),
  ];
}

export function buildSeedRisks(recordedAt: string): PlatformSnapshot["risks"] {
  return [
    {
      id: "risk-2026-parts-availability", projectId: "project-robot-2026", title: "Parts availability and order accuracy may delay integration",
      detail: "Jan 21 recap reported incorrect parts ordered and the fuel order still pending. Track vendor availability and verify dimensions before downstream assembly. Resolution is not established in the reviewed source. https://mecorobotics.slack.com/archives/C03MXBFGAM6/p1769043875798899",
      severity: "high", category: "supply", status: "open", blocksWork: true, source: { kind: "task", id: "task-src-bf101f73af7c7a" },
      relatedTargets: [{ kind: "task", id: "task-src-a24a6d0bd5a24d" }, { kind: "task", id: "task-src-bf101f73af7c7a" }], mitigationTaskId: "task-src-bf101f73af7c7a", ownerGroupId: "group-robot-2026", ownerMemberId: null,
      mitigationDueDate: "2026-01-28", createdAt: "2026-01-21T00:00:00.000Z", updatedAt: recordedAt, resolvedAt: null,
    },
    {
      id: "risk-2026-intake-reliability", projectId: "project-robot-2026", title: "Intake and hopper reliability needs validation before competition",
      detail: "March Slack threads called out rack snapping, flipdown stability, hopper spillage/clearance and shooter friction/range issues. Keep cycle testing and fit checks on the path to event readiness. https://mecorobotics.slack.com/archives/C03171JMMB4/p1772475139895649 https://mecorobotics.slack.com/archives/C03171JMMB4/p1773154853486989",
      severity: "high", category: "design", status: "open", blocksWork: true, source: { kind: "task", id: "task-src-a7763b713cea50" },
      relatedTargets: [{ kind: "task", id: "task-src-a7763b713cea50" }, { kind: "task", id: "task-src-95af8941323110" }, { kind: "task", id: "task-src-5bdff3e95f7ae4" }], mitigationTaskId: "task-src-5bdff3e95f7ae4", ownerGroupId: "group-robot-2026", ownerMemberId: null,
      mitigationDueDate: "2026-03-18", createdAt: "2026-03-02T00:00:00.000Z", updatedAt: recordedAt, resolvedAt: null,
    },
    {
      id: "risk-2026-electrical-integration", projectId: "project-robot-2026", title: "Electrical connections and vision integration may fail under match conditions",
      detail: "Feb 26 recap said harness wires still needed labels and noted vision wiring remained. Mar 2 build planning reported wires separating during testing and called out connector protection. https://mecorobotics.slack.com/archives/C03MXBFGAM6/p1772154135426739 https://mecorobotics.slack.com/archives/C03171JMMB4/p1772475139895649",
      severity: "high", category: "manufacturing", status: "open", blocksWork: true, source: { kind: "task", id: "task-src-de1d0268ef888c" },
      relatedTargets: [{ kind: "task", id: "task-src-de1d0268ef888c" }, { kind: "task", id: "task-src-7cb6704021256b" }, { kind: "task", id: "task-src-9bcabb65dcc9f5" }], mitigationTaskId: "task-src-de1d0268ef888c", ownerGroupId: "group-robot-2026", ownerMemberId: null,
      mitigationDueDate: "2026-03-18", createdAt: "2026-02-26T00:00:00.000Z", updatedAt: recordedAt, resolvedAt: null,
    },
    {
      id: "risk-2026-orlando-readiness", projectId: "project-operations-2026", title: "Orlando event readiness had incomplete logistics and robot tasks",
      detail: "Mar 12 recap said schedule/move-in planning, hopper retrofit, cable chain installation and hopper plates remained incomplete ahead of Mar 18 load-in. Historical risk retained for audit; later resolution is not inferred. https://mecorobotics.slack.com/archives/C03MXBFGAM6/p1773360105367049 https://mecorobotics.slack.com/archives/C0ADA2E7GAK/p1773179898932589",
      severity: "high", category: "schedule", status: "open", blocksWork: true, source: { kind: "task", id: "task-src-5910dd1e981ed6" },
      relatedTargets: [{ kind: "task", id: "task-src-5910dd1e981ed6" }, { kind: "task", id: "task-src-db7bc1358aff88" }, { kind: "task", id: "task-slack-orlando-flywheel-cover-hopper-net" }], mitigationTaskId: "task-src-db7bc1358aff88", ownerGroupId: "group-operations-2026", ownerMemberId: null,
      mitigationDueDate: "2026-03-18", createdAt: "2026-03-12T00:00:00.000Z", updatedAt: recordedAt, resolvedAt: null,
    },
    {
      id: "risk-2026-team-capacity", projectId: "project-operations-2026", title: "Student capacity and training gaps could constrain planned work",
      detail: "Feb mentor minutes recorded illness/bandwidth concerns, task allocation mismatch and missing block-CAD training. Recheck capacity and training coverage when sequencing work. https://docs.google.com/document/d/1-nJBbH67gyVqeWnPH89viQiIQA6W7ttCZSU7MGhDONE/edit",
      severity: "medium", category: "schedule", status: "open", blocksWork: false, source: { kind: "task", id: "task-src-32202b39b3f16a" },
      relatedTargets: [{ kind: "task", id: "task-src-32202b39b3f16a" }, { kind: "task", id: "task-src-3ec69b67c4778e" }], mitigationTaskId: "task-src-3ec69b67c4778e", ownerGroupId: "group-training-2026", ownerMemberId: null,
      mitigationDueDate: null, createdAt: "2026-02-07T00:00:00.000Z", updatedAt: recordedAt, resolvedAt: null,
    },
  ];
}
