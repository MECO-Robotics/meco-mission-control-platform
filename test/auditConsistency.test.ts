import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createUserPreferencesStore } from "../src/data/userPreferencesStore";
import { createOnshapeRuntimeStore } from "../src/onshape/cadStore";
import { createPrismaCadStore } from "../src/cad/cadPrismaStore";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { getSnapshot } from "../src/data/store";
import { isTaskWaitingOnDependencies } from "../src/domain/taskDependencyState";
import { taskSchema, taskDependencySchema } from "../src/routes/routeSchemas";
import type { PrismaClient } from "@prisma/client";
import type { OnshapeOAuthTokenSet } from "../src/onshape/onshapeTypes";

test("canonical dependency required state round-trips without a contradictory complete mirror", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const [task, upstream] = snapshot.tasks.slice(0, 2);
    const requiredState = upstream.status;
    const response = await app.inject({ method: "POST", url: "/api/task-dependencies", payload: {
      taskId: task.id, kind: "task", refId: upstream.id, requiredState, dependencyType: "hard",
    }});
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().item.id;
    const bootstrap = (await app.inject({ method: "GET", url: "/api/bootstrap" })).json();
    assert.equal(bootstrap.taskDependencies.filter((edge: { id: string }) => edge.id === id).length, 1);
    assert.equal(bootstrap.taskDependencies.find((edge: { id: string }) => edge.id === id).requiredState, requiredState);
    assert.equal("dependencyIds" in bootstrap.tasks.find((item: { id: string }) => item.id === task.id), false);
    const isolated = { ...snapshot, taskDependencies: [response.json().item] };
    assert.equal(isTaskWaitingOnDependencies(task, isolated), false);
    isolated.taskDependencies[0].refId = "missing";
    assert.equal(isTaskWaitingOnDependencies(task, isolated), true);
    isolated.taskDependencies[0].dependencyType = "soft";
    assert.equal(isTaskWaitingOnDependencies(task, isolated), false);
    assert.equal(taskSchema.partial().safeParse({ dependencyIds: [upstream.id] }).success, false);
    assert.equal(taskDependencySchema.safeParse({ upstreamTaskId: upstream.id, downstreamTaskId: task.id, dependencyType: "blocks" }).success, false);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});

test("dependency commands reject impossible states and validate the full merged patch", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const [task, upstream] = snapshot.tasks;
    const milestone = snapshot.milestones[0];
    const payload = { taskId: task.id, kind: "task", refId: upstream.id, requiredState: "complete", dependencyType: "hard" };
    for (const invalid of [
      { ...payload, requiredState: "ready" },
      { ...payload, kind: "milestone", refId: milestone.id, requiredState: "typo-ready" },
      { ...payload, kind: "part_instance", requiredState: "complete" },
    ]) {
      assert.equal(taskDependencySchema.safeParse(invalid).success, false);
      assert.equal((await app.inject({ method: "POST", url: "/api/task-dependencies", payload: invalid })).statusCode, 400);
    }
    const created = await app.inject({ method: "POST", url: "/api/task-dependencies", payload });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().item.id;
    const url = `/api/task-dependencies/${id}`;
    const invalid = await app.inject({ method: "PATCH", url, payload: { kind: "milestone", refId: milestone.id } });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.equal(getSnapshot().taskDependencies.find((edge) => edge.id === id)?.kind, "task");
    const valid = await app.inject({ method: "PATCH", url, payload: { kind: "milestone", refId: milestone.id, requiredState: "ready" } });
    assert.equal(valid.statusCode, 200, valid.body);
    assert.equal(valid.json().item.requiredState, "ready");
    assert.equal(valid.json().item.id, id);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});

test("duplicate blocker descriptions stay visible until the last open record resolves", async () => {
  await withIntegrationApp(async ({ app }) => {
    const task = getSnapshot().tasks[0];
    const create = () => app.inject({ method: "POST", url: "/api/task-blockers", payload: {
      blockedTaskId: task.id, blockerType: "external", blockerId: null,
      description: "Waiting on shared delivery", severity: "medium", status: "open", createdByMemberId: null,
    }});
    const a = await create(); const b = await create();
    assert.equal(a.statusCode, 201, a.body); assert.equal(b.statusCode, 201, b.body);
    const first = await app.inject({ method: "PATCH", url: `/api/task-blockers/${a.json().item.id}`, payload: { status: "resolved" }});
    assert.equal(first.statusCode, 200, first.body);
    assert.ok(getSnapshot().tasks.find((item) => item.id === task.id)!.blockers.includes("Waiting on shared delivery"));
    await app.inject({ method: "DELETE", url: `/api/task-blockers/${b.json().item.id}` });
    assert.ok(!getSnapshot().tasks.find((item) => item.id === task.id)!.blockers.includes("Waiting on shared delivery"));
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});

test("layout and QA proposals persist on actual records and approved risk changes are atomic", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const checklistTask = snapshot.tasks[0];
    const checklist = await app.inject({ method: "PATCH", url: `/api/tasks/${checklistTask.id}`, payload: { checklistItems: ["Inspect wiring", "Run QA"] } });
    assert.equal(checklist.statusCode, 200, checklist.body);
    assert.deepEqual(checklist.json().item.checklistItems, ["Inspect wiring", "Run QA"]);
    const subsystem = snapshot.subsystems[0];
    const layout = { layoutX: 0.2, layoutY: 0.8, layoutZone: "rear", layoutView: "top", sortOrder: 4 };
    const saved = await app.inject({ method: "PATCH", url: `/api/subsystems/${subsystem.id}`, payload: layout });
    assert.equal(saved.statusCode, 200, saved.body);
    const bootstrap = (await app.inject({ method: "GET", url: "/api/bootstrap" })).json();
    assert.deepEqual(bootstrap.tasks.find((t: {id: string}) => t.id === checklistTask.id).checklistItems, ["Inspect wiring", "Run QA"]);
    for (const [key, value] of Object.entries(layout)) assert.equal(bootstrap.subsystems.find((s: {id: string}) => s.id === subsystem.id)[key], value);
    assert.equal((await app.inject({ method: "PATCH", url: `/api/subsystems/${subsystem.id}`, payload: { layoutX: 1.1 } })).statusCode, 400);
    assert.equal((await app.inject({ method: "PATCH", url: `/api/subsystems/${subsystem.id}`, payload: { layoutZ: 0.3 } })).statusCode, 400);
    const task = snapshot.tasks[0]; const risk = snapshot.risks[0];
    const report = { reportType: "QA", projectId: task.projectId, taskId: task.id, milestoneId: null, workstreamId: task.workstreamId, createdByMemberId: null, result: "pass", summary: "Reassessed risk", notes: "Verified mitigation", participantIds: [snapshot.members[0].id], mentorApproved: false, createdAt: "2026-09-08", reviewedAt: "2026-09-08", targetRiskId: risk.id, proposedRiskSeverity: "low", proposedRiskStatus: "full-mitigation" };
    const pending = await app.inject({ method: "POST", url: "/api/reports", payload: report });
    assert.equal(pending.statusCode, 201, pending.body);
    assert.equal(pending.json().item.targetRiskId, risk.id);
    assert.equal(getSnapshot().qaReports.find((r) => r.id === pending.json().item.id)?.proposedRiskStatus, "full-mitigation");
    assert.equal(getSnapshot().risks.find((r) => r.id === risk.id)?.severity, risk.severity);
    const approved = await app.inject({ method: "POST", url: "/api/reports", payload: { ...report, mentorApproved: true } });
    assert.equal(approved.statusCode, 201, approved.body);
    assert.equal(getSnapshot().risks.find((r) => r.id === risk.id)?.severity, "low");
    const count = getSnapshot().qaReports.length;
    const invalid = await app.inject({ method: "POST", url: "/api/reports", payload: { ...report, targetRiskId: "missing", mentorApproved: true } });
    assert.equal(invalid.statusCode, 400); assert.equal(getSnapshot().qaReports.length, count);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});

test("preference initialization is distinct from corruption and updates reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "audit-preferences-")); const path = join(directory, "preferences.json");
  try {
    const store = createUserPreferencesStore(path);
    store.update("MEMBER@example.com", { themeMode: "dark", taskSubteamIds: ["programming"] });
    assert.equal(createUserPreferencesStore(path).get("member@example.com").themeMode, "dark");
    const saved = readFileSync(path, "utf8");
    writeFileSync(path, "{broken");
    assert.throws(() => createUserPreferencesStore(path));
    assert.equal(readFileSync(path, "utf8"), "{broken");
    writeFileSync(path, saved);
    assert.throws(() => createUserPreferencesStore(directory));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CAD update errors preserve missing-record distinction without swallowing infrastructure failures", async () => {
  let failure: unknown = { code: "P2025" };
  const delegate = { update: async () => { throw failure; } };
  const store = createPrismaCadStore({ cadImportRun: delegate, cadSnapshot: delegate, cadMappingRule: delegate, cadSnapshotMapping: delegate } as unknown as PrismaClient);
  for (const update of [() => store.updateImportRun("missing", {}), () => store.updateSnapshot("missing", {}), () => store.updateMappingRule("missing", {}), () => store.updateSnapshotMapping("missing", {})]) {
    failure = { code: "P2025" }; assert.equal(await update(), null);
    failure = new Error("Database disconnected"); await assert.rejects(async () => update(), /Database disconnected/);
  }
});

test("Onshape refresh coalesces, rejects stale completion, and recovers after refresh failure", async () => {
  const store = createOnshapeRuntimeStore();
  const tokens = (accessToken: string): OnshapeOAuthTokenSet => ({ accessToken, refreshToken: "refresh", tokenType: "Bearer", scope: null, expiresAt: null, receivedAt: new Date().toISOString() });
  store.setOAuthTokenSet(tokens("old"));
  let complete!: (value: OnshapeOAuthTokenSet) => void; let calls = 0;
  const refresh = () => { calls += 1; return new Promise<OnshapeOAuthTokenSet>((resolve) => { complete = resolve; }); };
  const first = store.refreshOAuthTokenSet(refresh); const second = store.refreshOAuthTokenSet(refresh);
  await Promise.resolve(); assert.equal(calls, 1);
  complete(tokens("fresh")); await Promise.all([first, second]); assert.equal(store.getOAuthTokenSet()?.accessToken, "fresh");
  const stale = store.refreshOAuthTokenSet(refresh); await Promise.resolve();
  store.setOAuthTokenSet(tokens("reconnected")); complete(tokens("obsolete"));
  await assert.rejects(stale, /credentials changed/); assert.equal(store.getOAuthTokenSet()?.accessToken, "reconnected");
  await assert.rejects(store.refreshOAuthTokenSet(async () => { throw new Error("refresh failed"); }), /refresh failed/);
  await store.refreshOAuthTokenSet(async () => tokens("recovered")); assert.equal(store.getOAuthTokenSet()?.accessToken, "recovered");
});

test("proxy quotas use only the configured immediate ingress and reject spoofed extra hops", async () => {
  await withIntegrationApp(async ({ app }) => {
    const request = (remoteAddress: string, forwarded: string) => app.inject({ method: "GET", url: "/api/tasks", remoteAddress, headers: { "x-forwarded-for": forwarded } });
    assert.equal((await request("172.30.0.1", "198.51.100.1")).statusCode, 200);
    assert.equal((await request("172.30.0.1", "198.51.100.2")).statusCode, 200);
    assert.equal((await request("172.30.0.1", "198.51.100.99, 198.51.100.1")).statusCode, 429);
    assert.equal((await request("198.51.100.3", "203.0.113.1")).statusCode, 200);
    assert.equal((await request("198.51.100.3", "203.0.113.2")).statusCode, 429);
  }, { env: { TRUST_PROXY_IPS: "172.30.0.1", API_RATE_LIMIT_MAX_REQUESTS: "1" } });
});

test("a failed required CAD terminal transition cannot return the earlier snapshot as success", async () => {
  await withIntegrationApp(async ({ app }) => {
    const { runStepImport } = await import("../src/cad/cadImportService");
    const { createPlaceholderStepParserClient } = await import("../src/cad/stepParserClient");
    const store = { ...app.cadStore, updateSnapshot: async () => null };
    await assert.rejects(runStepImport({ store, parserClient: createPlaceholderStepParserClient(), parserMode: "placeholder", allowPlaceholder: true, input: { fileText: "fixture", originalFilename: "fixture.step", label: "terminal-failure" } }), /disappeared during a required state transition/);
    const runs = await store.listImportRuns();
    assert.equal(runs[0]?.status, "FAILED");
  }, { env: { NODE_ENV: "test" } });
});

test("explicit snapshot mutation handlers roll back error responses and release the next writer", async () => {
  await withIntegrationApp(async ({ app }) => {
    const { createProject } = await import("../src/data/store");
    app.post("/test/rejected-command", { config: { snapshotMutation: true } }, async (_request, reply) => {
      createProject({ name: "Must roll back", seasonId: "default-season", projectType: "operations", description: "Rejected command", status: "active" });
      return reply.code(409).send({ message: "Rejected after staging" });
    });
    const rejected = await app.inject({ method: "POST", url: "/test/rejected-command" });
    assert.equal(rejected.statusCode, 409);
    assert.equal(getSnapshot().projects.some((project) => project.name === "Must roll back"), false);
    const accepted = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Next writer", seasonId: "default-season", projectType: "operations", description: "Succeeds after rollback", status: "active" } });
    assert.equal(accepted.statusCode, 201, accepted.body);
    assert.ok(getSnapshot().projects.some((project) => project.name === "Next writer"));
  });
});

test("obsolete JWT endpoints and arbitrary bearer credentials are rejected", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    for (const url of ["/api/auth/google", "/api/auth/email/verify", "/api/auth/dev-bypass"]) {
      assert.equal((await app.inject({ method: "POST", url, payload: {} })).statusCode, 404);
    }
    resetLimits();
    assert.equal((await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.retired.signature" } })).statusCode, 401);
  }, { env: { GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com" } });
});
