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
    assert.ok(["student", "lead", "mentor", "admin", "external", "unknown"].includes(member.role));
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

test("season records preserve source-backed dates and resolve their linked records", () => {
  const data = createTutorialSnapshot(new Date("2026-10-06T12:00:00Z"));
  const events = new Map(data.events.map((event) => [event.id, event]));
  const milestones = new Map(data.milestones.map((milestone) => [milestone.id, milestone]));
  const meetings = new Set(data.meetings.map((meeting) => meeting.id));
  const tasks = new Set(data.tasks.map((task) => task.id));
  for (const event of data.events) {
    if (event.seasonId) assert.ok(data.seasons.some((season) => season.id === event.seasonId), event.id);
  }
  for (const task of data.tasks) {
    for (const ref of task.scheduleRefs) {
      assert.ok(ref.kind === "milestone" ? milestones.has(ref.id) : ref.kind === "event" ? events.has(ref.id) : meetings.has(ref.id), `${task.id} has an unresolved schedule link`);
    }
  }
  for (const dependency of data.taskDependencies) {
    if (dependency.kind === "task") assert.ok(tasks.has(dependency.refId), dependency.id);
  }
});
