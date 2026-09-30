import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlatformSnapshot } from "../src/domain/types";
import { snapshot } from "../src/data/mockData";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

function assertSeedReferences(seed: PlatformSnapshot) {
  const ids = <T extends { id: string }>(rows: T[]) => new Set(rows.map((row) => row.id));
  const projectIds = ids(seed.projects);
  const memberIds = ids(seed.members);
  const taskIds = ids(seed.tasks);
  const subsystemIds = ids(seed.subsystems);
  const mechanismIds = ids(seed.mechanisms);
  const partDefinitionIds = ids(seed.partDefinitions);
  const partInstanceIds = ids(seed.partInstances);
  const workstreamIds = ids(seed.workstreams);
  const milestoneIds = ids(seed.milestones);
  const reportIds = ids(seed.qaReports);
  const testResultIds = ids(seed.testResults);

  assert.ok(seed.projects.every((project) => seed.seasons.some((season) => season.id === project.seasonId)));
  assert.ok(seed.members.some((member) => member.role === "admin"));
  assert.ok(seed.workstreams.every((workstream) => projectIds.has(workstream.projectId)));
  assert.ok(seed.subsystems.every((subsystem) => projectIds.has(subsystem.projectId)));
  assert.ok(seed.mechanisms.every((mechanism) => subsystemIds.has(mechanism.subsystemId)));
  assert.ok(seed.partDefinitions.every((part) => seed.seasons.some((season) => season.id === part.seasonId)));
  assert.ok(seed.partInstances.every((part) => (!part.intendedSubsystemId || subsystemIds.has(part.intendedSubsystemId)) && (!part.intendedMechanismId || mechanismIds.has(part.intendedMechanismId)) && partDefinitionIds.has(part.partDefinitionId)));
  assert.ok(seed.tasks.every((task) => projectIds.has(task.projectId) && task.workstreamIds.every((id) => workstreamIds.has(id)) && task.subsystemIds.every((id) => subsystemIds.has(id)) && task.mechanismIds.every((id) => mechanismIds.has(id)) && task.partInstanceIds.every((id) => partInstanceIds.has(id))));
  assert.ok(seed.artifacts.every((artifact) => artifact.targetRefs.every((ref) => ref.kind !== "task" || taskIds.has(ref.id))));
  assert.ok(seed.taskDependencies.every((dependency) => taskIds.has(dependency.taskId) && (dependency.kind !== "task" || taskIds.has(dependency.refId))));
  assert.ok(seed.qaReports.every((report) => taskIds.has(report.taskId) && report.participantIds.every((id) => memberIds.has(id))));
  assert.ok(seed.qaFindings.every((finding) => taskIds.has(finding.taskId ?? "") && (!finding.qaReportId || reportIds.has(finding.qaReportId))));
  assert.ok(seed.testResults.every((result) => milestoneIds.has(result.milestoneId)));
  assert.ok(seed.testFindings.every((finding) => !finding.testResultId || testResultIds.has(finding.testResultId)));
  assert.ok(seed.workLogs.every((log) => taskIds.has(log.taskId) && log.participantIds.every((id) => memberIds.has(id))));
  assert.ok(seed.attendanceRecords.every((record) => memberIds.has(record.memberId)));
  assert.ok(seed.tasks.every((task) => !task.manufacturingDetails || task.workTypeId === "robot:manufacturing"));
  assert.ok(seed.purchaseItems.every((item) => taskIds.has(item.taskId) && (!item.partDefinitionId || partDefinitionIds.has(item.partDefinitionId))));

  assert.deepEqual(
    new Set(seed.partDefinitions.map((part) => part.cadImportSource)),
    new Set(["MANUAL", "STEP_UPLOAD", "ONSHAPE_API", "ONSHAPE_BOM_CSV", "MANUAL_BOM_CSV"]),
  );
}

test("compact tutorial seed keeps chapter and demo examples referentially complete", () => {
  assertSeedReferences(snapshot);
  assert.deepEqual(snapshot.projects.map((project) => project.name), [
    "Robot", "Media", "Outreach", "Operations", "Strategy", "Training",
  ]);
  assert.deepEqual(snapshot.projects.map((project) => project.projectType), [
    "robot", "media", "outreach", "operations", "strategy", "training",
  ]);
  assert.deepEqual(snapshot.workTypes.filter((workType) => workType.projectType === "robot").map((workType) => workType.code), [
    "design", "manufacturing", "assembly", "electrical-wiring", "programming", "testing", "driving", "planning",
  ]);
  assert.deepEqual(snapshot.manufacturingProcesses.map((process) => process.code), ["cnc", "3d-print", "fabrication"]);
  const manufacturingTask = snapshot.tasks.find((task) => task.manufacturingDetails);
  assert.ok(manufacturingTask);
  assert.equal(manufacturingTask.manufacturingDetails?.processId, "3d-print");
  assert.equal(manufacturingTask.manufacturingDetails?.fulfillmentSource, "outsourced");
  assert.ok(snapshot.purchaseItems.some((item) => item.taskId === manufacturingTask.id && item.kind === "manufacturing-service"));
  assert.ok(snapshot.qaReports.length > 0 && snapshot.qaFindings.length > 0 && snapshot.testResults.length > 0 && snapshot.testFindings.length > 0);
  assert.ok(snapshot.meetings.length > 0 && snapshot.attendanceRecords.length > 0);
  assert.ok(snapshot.artifacts.some((artifact) => artifact.projectId === "project-operations-2026" && artifact.kind === "nontechnical"));
  assert.ok(snapshot.workLogs.length > 0 && snapshot.taskDependencies.length > 0 && snapshot.risks.some((risk) => risk.blocksWork));
});

test("compact bootstrap supports tutorial chapters, resets, and sanitized demo access", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    const body = bootstrap.json();
    assert.equal(body.seasons.some((season: { id: string }) => season.id === "default-season"), true);
    assert.ok(body.projects.some((project: { id: string }) => project.id === "project-robot-2026"));
    assert.ok(body.projects.some((project: { id: string }) => project.id === "project-outreach-2026"));
    assert.deepEqual(body.workTypes.filter((workType: { projectType: string }) => workType.projectType === "robot").map((workType: { code: string }) => workType.code), [
      "design", "manufacturing", "assembly", "electrical-wiring", "programming", "testing", "driving", "planning",
    ]);
    assert.ok(Array.isArray(body.responsibleGroups) && Array.isArray(body.vendors) && Array.isArray(body.events));
    assert.deepEqual(body.manufacturingProcesses.map((process: { code: string }) => process.code), ["cnc", "3d-print", "fabrication"]);
    assert.equal(body.tasks.some((task: { id: string }) => task.id === "swerve-sensor-bundle"), true);
    assert.equal(body.milestones.length > 0 && body.workLogs.length > 0, true);
    assert.ok(body.members.some((member: { role: string }) => member.role === "student"));
    assert.ok(body.materials.length > 0 && body.partDefinitions.length > 0 && body.purchaseItems.length > 0);
    assert.equal(body.subsystems.some((subsystem: { id: string }) => subsystem.id === "drive"), true);
    assert.equal(body.mechanisms.some((mechanism: { id: string }) => mechanism.id === "swerve-module"), true);
    assert.equal(body.workstreams.some((workstream: { id: string; projectId: string }) => workstream.id === "workstream-outreach-content" && workstream.projectId === "project-outreach-2026"), true);
    assert.equal("manufacturingItems" in body, false);
    assert.equal("taskBlockers" in body, false);
    assert.ok(body.tasks.some((task: { manufacturingDetails: unknown }) => task.manufacturingDetails));
    assert.ok(body.reports.some((report: { reportType: string }) => report.reportType === "QA"));
    assert.ok(body.reports.length > 0 && body.qaFindings.length + body.testFindings.length > 0);
    assert.ok(body.meetings.length > 0 && body.attendanceRecords.length > 0 && body.artifacts.length > 0);

    resetLimits();
    const started = await app.inject({ method: "POST", url: "/api/tutorial/session/start" });
    assert.equal(started.statusCode, 200, started.body);
    assert.deepEqual(started.json().tutorial.missingProjectNames, []);
    resetLimits();

    const publicDemo = await app.inject({ method: "GET", url: "/api/bootstrap?seasonId=default-season" });
    assert.equal(publicDemo.statusCode, 200, publicDemo.body);
    const demo = publicDemo.json();
    assert.equal(demo.projects.length, 6);
    assert.ok(demo.members.some((member: { role: string }) => member.role === "student"));
    assert.ok(demo.members.some((member: { role: string }) => member.role === "mentor"));
    assert.ok(demo.members.every((member: { role: string }) => member.role !== "admin"));
    assert.ok(demo.attendanceRecords.some((record: { date: string }) => record.date === new Date().toISOString().slice(0, 10)));
    assert.ok(demo.members.every((member: { id: string; email?: string }) => /^demo-member-\d+$/.test(member.id) && member.email === undefined));
    assert.ok(demo.reports.length > 0 && demo.artifacts.length > 0);
  }, { snapshot });
});
