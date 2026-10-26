import assert from "node:assert/strict";
import { test } from "node:test";

import { snapshot } from "../src/data/mockData";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("current tutorial seed preserves canonical project and record links", () => {
  const projectIds = new Set(snapshot.projects.map((project) => project.id));
  const memberIds = new Set(snapshot.members.map((member) => member.id));
  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  const workstreamIds = new Set(snapshot.workstreams.map((workstream) => workstream.id));
  const subsystemIds = new Set(snapshot.subsystems.map((subsystem) => subsystem.id));
  const mechanismIds = new Set(snapshot.mechanisms.map((mechanism) => mechanism.id));
  const partDefinitionIds = new Set(snapshot.partDefinitions.map((part) => part.id));
  const partInstanceIds = new Set(snapshot.partInstances.map((part) => part.id));
  const testResultIds = new Set(snapshot.testResults.map((result) => result.id));

  assert.ok(snapshot.projects.every((project) => snapshot.seasons.some((season) => season.id === project.seasonId)));
  assert.ok(snapshot.responsibleGroups.every((group) => group.projectIds.every((id) => projectIds.has(id))));
  assert.ok(snapshot.subsystems.every((subsystem) => projectIds.has(subsystem.projectId)));
  assert.ok(snapshot.mechanisms.every((mechanism) => subsystemIds.has(mechanism.subsystemId)));
  assert.ok(snapshot.partDefinitions.every((part) => snapshot.seasons.some((season) => season.id === part.seasonId)));
  assert.ok(snapshot.partInstances.every((part) => partDefinitionIds.has(part.partDefinitionId) && (!part.intendedSubsystemId || subsystemIds.has(part.intendedSubsystemId)) && (!part.intendedMechanismId || mechanismIds.has(part.intendedMechanismId))));
  assert.ok(snapshot.tasks.every((task) => projectIds.has(task.projectId) && task.workstreamIds.every((id) => workstreamIds.has(id)) && task.subsystemIds.every((id) => subsystemIds.has(id)) && task.mechanismIds.every((id) => mechanismIds.has(id)) && task.partInstanceIds.every((id) => partInstanceIds.has(id))));
  assert.ok(snapshot.workLogs.every((log) => taskIds.has(log.taskId) && log.participantIds.every((id) => memberIds.has(id))));
  assert.ok(snapshot.qaReports.every((report) => projectIds.has(report.projectId) && report.participantIds.every((id) => memberIds.has(id))));
  assert.ok(snapshot.testFindings.every((finding) => testResultIds.has(finding.testResultId)));
});

test("tutorial sessions use the canonical season and public demo access is sanitized", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    const body = bootstrap.json();
    assert.ok(body.seasons.some((season: { id: string }) => season.id === "season-2026-meco"));
    assert.ok(body.projects.some((project: { id: string }) => project.id === "project-robot-2026"));
    assert.ok(body.projects.some((project: { id: string }) => project.id === "project-outreach-2026"));
    resetLimits();

    const started = await app.inject({ method: "POST", url: "/api/tutorial/session/start" });
    assert.equal(started.statusCode, 200, started.body);
    assert.deepEqual(started.json().tutorial.missingProjectNames, []);
    resetLimits();

    const publicDemo = await app.inject({ method: "GET", url: "/api/bootstrap?seasonId=season-2026-meco" });
    assert.equal(publicDemo.statusCode, 200, publicDemo.body);
    const demo = publicDemo.json();
    assert.ok(demo.projects.every((project: { seasonId: string }) => project.seasonId === "season-2026-meco"));
    assert.ok(demo.members.every((member: { id: string; email?: string }) => /^demo-member-\d+$/.test(member.id) && member.email === undefined));
    assert.ok(demo.members.every((member: { role: string }) => member.role !== "admin"));
  });
});

test("current task and risk records remain editable", async () => {
  await withIntegrationApp(async ({ app }) => {
    for (const task of snapshot.tasks.slice(0, 5)) {
      const response = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { summary: task.summary } });
      assert.equal(response.statusCode, 200, `${task.id}: ${response.body}`);
    }
    for (const risk of snapshot.risks.slice(0, 2)) {
      const response = await app.inject({ method: "PATCH", url: `/api/risks/${risk.id}`, payload: { detail: risk.detail } });
      assert.equal(response.statusCode, 200, `${risk.id}: ${response.body}`);
    }
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
