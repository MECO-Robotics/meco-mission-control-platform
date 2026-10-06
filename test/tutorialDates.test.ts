import assert from "node:assert/strict";
import { test } from "node:test";
import { isTaskDisciplineAllowedForProject } from "../src/domain/taskDisciplines";
import { createTutorialSnapshot } from "../src/data/tutorialSnapshot";

for (const date of ["2026-09-08", "2027-01-01", "2028-02-29", "2026-05-31"]) {
  test(`tutorial activity spans the current month at ${date}`, () => {
    const now = new Date(`${date}T12:00:00Z`);
    const data = createTutorialSnapshot(now);
    const month = date.slice(0, 7);
    const firstWeekday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getUTCDay();
    const mondayOffset = (firstWeekday + 6) % 7;
    const weekFor = (value: string) => Math.floor((Number(value.slice(8, 10)) - 1 + mondayOffset) / 7);
    const observedWeeks = new Set<number>();
    const overdueTaskIds = new Set(["travel-pack-finalize", "intake-guard", "auto-safety-review"]);
    const overdueDates = new Set(data.tasks.filter((task) => overdueTaskIds.has(task.id)).flatMap((task) => [task.startDate, task.dueDate]));
    const checkDates = (value: unknown): void => {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
        if (overdueDates.has(value)) return;
        assert.equal(value.slice(0, 7), month);
        observedWeeks.add(weekFor(value));
      } else if (value && typeof value === "object") Object.values(value).forEach(checkDates);
    };
    for (const [key, value] of Object.entries(data)) if (key !== "seasons") checkDates(value);
    assert.ok(observedWeeks.size >= 4, `expected activity in at least four calendar weeks; got ${observedWeeks.size}`);
    const milestoneWeeks = new Set(data.milestones.map((milestone) => weekFor(milestone.startAt)));
    assert.ok(milestoneWeeks.size >= 4, `expected milestones in at least four calendar weeks; got ${milestoneWeeks.size}`);
    for (const task of data.tasks) {
      assert.ok(task.startDate <= task.dueDate);
      assert.equal(task.actualHours, data.workLogs.filter((log) => log.taskId === task.id).reduce((sum, log) => sum + log.hours, 0));
    }
    for (const recorded of [...data.workLogs.map((log) => log.date), ...data.qaReports.map((report) => report.reviewedAt).filter((date): date is string => date !== null), ...data.attendanceRecords.map((record) => record.date)]) assert.ok(Date.parse(recorded) <= now.getTime(), recorded);
    for (const report of data.qaReports.filter((report) => report.result === "pass" && report.status === "reviewed")) {
      const taskId = report.targetRefs.find((ref) => ref.kind === "task")?.id;
      assert.equal(data.tasks.find((task) => task.id === taskId)?.status, "complete");
    }
    for (const milestone of data.milestones) {
      if (milestone.endAt) assert.ok(Date.parse(milestone.startAt) <= Date.parse(milestone.endAt));
    }
    assert.equal(data.seasons[0].startDate, `${date.slice(0, 7)}-01`);
    assert.equal(data.seasons[0].endDate.slice(0, 7), date.slice(0, 7));
    const demoMembers = data.members.filter((member) => member.id.startsWith("demo-"));
    assert.ok(demoMembers.length > 0);
    for (const member of demoMembers) {
      assert.ok(data.attendanceRecords.some((record) =>
        record.memberId === member.id && record.date === date && record.totalHours > 0,
      ), `${member.name} must appear in today's availability roster`);
    }
    assert.equal(new Set(data.attendanceRecords.map((record) => record.id)).size, data.attendanceRecords.length);
    assert.deepEqual(createTutorialSnapshot(now), data);
  });
}

test("new tutorial data rolls forward without mutating an earlier session", () => {
  const old = createTutorialSnapshot(new Date("2026-12-31T12:00:00Z"));
  const before = structuredClone(old);
  const next = createTutorialSnapshot(new Date("2027-01-04T12:00:00Z"));
  assert.deepEqual(old, before);
  assert.notEqual(next.tasks[0].startDate, old.tasks[0].startDate);
});

test("tutorial roster categories and all member references resolve within the seed", () => {
  const data = createTutorialSnapshot();
  const members = new Set(data.members.map((member) => member.id));
  const seasons = new Set(data.seasons.map((season) => season.id));
  assert.equal(members.size, data.members.length);
  for (const member of data.members) {
    assert.ok(["student", "lead", "mentor", "admin", "external"].includes(member.role));
    if (member.seasonId) assert.ok(seasons.has(member.seasonId));
    for (const seasonId of member.activeSeasonIds ?? []) assert.ok(seasons.has(seasonId));
  }
  const memberFields = new Set([
    "memberId", "ownerId", "mentorId", "responsibleEngineerId", "createdByMemberId",
    "createdById", "requestedById", "reviewedById", "approvedById", "actorMemberId",
    "participantIds", "assigneeIds", "mentorIds", "memberIds",
  ]);
  const inspect = (value: unknown, path: string): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (memberFields.has(key)) {
        for (const id of Array.isArray(child) ? child : [child]) {
          if (id != null && id !== "") assert.ok(members.has(id), `${path}.${key}: ${id}`);
        }
      } else inspect(child, `${path}.${key}`);
    }
  };
  inspect(data, "tutorial");
});


test("tutorial tasks use the canonical project work-type catalog", () => {
  const data = createTutorialSnapshot(new Date("2026-09-26T12:00:00Z"));
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const workTypes = new Map(data.workTypes.map((workType) => [workType.id, workType]));
  for (const task of data.tasks) {
    const project = projects.get(task.projectId);
    assert.ok(project, task.id);
    assert.equal(workTypes.get(task.workTypeId)?.projectType, project.projectType, task.id);
    assert.ok(Array.isArray(task.workstreamIds) && Array.isArray(task.assigneeIds), task.id);
  }
});

test("tutorial seed keeps overdue tasks assigned across date rollovers", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const data = createTutorialSnapshot(now);
  const overdue = data.tasks.filter((task) => task.status !== "complete" && Date.parse(task.dueDate) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  assert.ok(overdue.length >= 3);
  assert.ok(overdue.every((task) => task.ownerId || task.assigneeIds.length > 0 || task.mentorId));
});

for (const date of ["2026-10-06", "2026-11-06", "2027-01-06"]) {
  test(`tutorial tasks span the month and land before linked checkpoints at ${date}`, () => {
    const now = new Date(`${date}T12:00:00Z`);
    const data = createTutorialSnapshot(now);
    const overdueIds = new Set(["travel-pack-finalize", "intake-guard", "auto-safety-review"]);
    const dates = data.tasks.filter((task) => !overdueIds.has(task.id)).flatMap((task) => [task.startDate, task.dueDate]);
    const firstWeekday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getUTCDay();
    const mondayOffset = (firstWeekday + 6) % 7;
    const weeks = new Set(dates.map((value) => Math.floor((Number(value.slice(8, 10)) - 1 + mondayOffset) / 7)));
    assert.ok(dates.every((value) => value.slice(0, 7) === date.slice(0, 7)), "task dates should follow the current month");
    assert.ok(new Set(dates).size >= 10, `expected task dates across at least ten days; got ${new Set(dates).size}`);
    assert.ok(weeks.size >= 4, `expected task activity in at least four calendar weeks; got ${weeks.size}`);

    const milestones = new Map(data.milestones.map((milestone) => [milestone.id, milestone]));
    for (const task of data.tasks.filter((candidate) => candidate.status !== "complete")) {
      const nextCheckpoint = task.scheduleRefs
        .map((ref) => milestones.get(ref.id))
        .filter((milestone) => milestone && milestone.startAt.slice(0, 10) > date)
        .sort((left, right) => left!.startAt.localeCompare(right!.startAt))[0];
      if (nextCheckpoint) assert.ok(task.dueDate < nextCheckpoint.startAt.slice(0, 10), `${task.id} should be due before ${nextCheckpoint.title}`);
    }
  });
}
