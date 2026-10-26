import assert from "node:assert/strict";
import { test } from "node:test";
import { isTaskDisciplineAllowedForProject } from "../src/domain/taskDisciplines";
import { createTutorialSnapshot } from "../src/data/tutorialSnapshot";
import { snapshot } from "../src/data/mockData";

test("tutorial snapshots preserve the canonical source dates", () => {
  const baseline = createTutorialSnapshot();
  for (const clock of ["2026-09-08", "2027-01-01", "2028-02-29", "2026-05-31"]) {
    assert.deepEqual(createTutorialSnapshot(new Date(`${clock}T12:00:00Z`)), baseline);
  }
  assert.deepEqual(baseline, snapshot);
});

test("tutorial task dates match their source records", () => {
  const data = createTutorialSnapshot(new Date("2026-10-21T12:00:00Z"));
  for (const task of data.tasks) {
    const source = snapshot.tasks.find((candidate) => candidate.id === task.id);
    assert.ok(source);
    assert.equal(task.startDate, source.startDate);
    assert.equal(task.dueDate, source.dueDate);
  }
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

test("FRC season records connect students, work, checkpoints, and event weekends", () => {
  const data = createTutorialSnapshot(new Date("2026-10-06T12:00:00Z"));
  const events = new Map(data.events.map((event) => [event.id, event]));
  const milestones = new Map(data.milestones.map((milestone) => [milestone.id, milestone]));
  const members = new Map(data.members.map((member) => [member.id, member]));
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const workstreams = new Map(data.workstreams.map((workstream) => [workstream.id, workstream]));
  const groups = new Set(data.responsibleGroups.map((group) => group.id));
  const seededTaskIds = [
    "event-registration-followup", "impact-award-evidence-draft", "kickoff-game-breakdown",
    "intake-prototype-clearance", "week-zero-safety-check", "scouting-shift-practice",
    "pit-spares-box", "event-repair-followup", "season-lessons-one-pager",
  ];

  assert.ok(data.seasons[0]?.startDate && data.seasons[0].startDate < "2026-10-01");
  assert.ok(data.seasons[0]?.endDate && data.seasons[0].endDate > "2027-04-30");
  assert.equal(events.get("frc-kickoff-watch-2027")?.startAt?.slice(0, 10), "2027-01-09");
  assert.equal(events.get("frc-week-zero-2027")?.startAt?.slice(0, 10), "2027-02-20");
  assert.equal(events.get("frc-registered-event-2027")?.startAt?.slice(0, 10), "2027-03-04");

  for (const id of seededTaskIds) {
    const task = data.tasks.find((candidate) => candidate.id === id);
    assert.ok(task, id);
    assert.ok(task.ownerId && members.get(task.ownerId)?.role === "student", `${id} needs a student owner`);
    assert.ok(task.assigneeIds.length > 0 && task.assigneeIds.every((memberId) => members.has(memberId)), id);
    assert.ok(task.mentorId && members.get(task.mentorId)?.role === "mentor", `${id} needs a mentor`);
    assert.ok(projects.has(task.projectId), `${id} needs a project`);
    assert.ok(task.workstreamIds.every((workstreamId) => workstreams.get(workstreamId)?.projectId === task.projectId), `${id} workstreams must belong to its project`);
    assert.ok(task.responsibleGroupId && groups.has(task.responsibleGroupId), `${id} needs a team assignment`);
    assert.ok(task.scheduleRefs.some((ref) => ref.kind === "milestone" && milestones.has(ref.id)), `${id} needs a checkpoint`);
    for (const ref of task.scheduleRefs) {
      assert.ok(ref.kind === "milestone" ? milestones.has(ref.id) : ref.kind === "event" ? events.has(ref.id) : data.meetings.some((meeting) => meeting.id === ref.id), `${id} has an unresolved schedule link`);
    }
  }

  assert.ok(data.taskDependencies.some((dependency) =>
    dependency.taskId === "intake-prototype-clearance" && dependency.kind === "task" && dependency.refId === "kickoff-game-breakdown",
  ));
  assert.ok(data.taskDependencies.some((dependency) =>
    dependency.taskId === "week-zero-safety-check" && dependency.kind === "task" && dependency.refId === "intake-prototype-clearance",
  ));

  for (const log of data.workLogs.filter((entry) => ["log-27", "log-28", "log-29"].includes(entry.id))) {
    for (const memberId of log.participantIds) {
      assert.ok(data.attendanceRecords.some((record) => record.memberId === memberId && record.date === log.date), `${memberId} attendance should match ${log.id}`);
    }
  }
});
