import { getSnapshot, updateTask } from "../src/data/store";
import { getOnshapeRuntimeStore } from "../src/onshape/cadStore";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createUserPreferencesStore } from "../src/data/userPreferencesStore";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const defaults = { taskSubteamIds: [], themeMode: null };

test("preferences persist normalized identities and distinguish absent from empty subteams", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "meco-preferences-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "nested", "preferences.json");
  const store = createUserPreferencesStore(path);
  assert.deepEqual(store.get("person@example.test"), defaults);
  assert.equal(store.getTaskSubteamIds("person@example.test"), null);
  store.update(" Person@Example.Test ", { themeMode: "dark" });
  const reopened = createUserPreferencesStore(path);
  assert.deepEqual(reopened.get("person@example.test"), { ...defaults, themeMode: "dark" });
  assert.equal(reopened.getTaskSubteamIds("person@example.test"), null);
  reopened.update("person@example.test", { taskSubteamIds: [] });
  assert.deepEqual(createUserPreferencesStore(path).getTaskSubteamIds("person@example.test"), []);
  assert.deepEqual(reopened.get("another@example.test"), defaults);
});

test("a failed preference write throws without changing the in-memory value", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "meco-preferences-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "preferences.json");
  const store = createUserPreferencesStore(path);
  store.update("person@example.test", { themeMode: "light" });
  rmSync(path);
  mkdirSync(path);
  assert.throws(() => store.update("person@example.test", { themeMode: "dark" }));
  assert.equal(store.get("person@example.test").themeMode, "light");
});

test("preference routes isolate app instances and reopen persisted updates", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "meco-preferences-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const { buildApp } = require("../src/app") as typeof import("../src/app");
    const path = join(directory, "preferences.json");
    const other = await buildApp({ userPreferencesPath: path });
    try {
      const saved = await other.inject({
        method: "PATCH", url: "/api/users/me/preferences", payload: { themeMode: "dark" },
      });
      assert.equal(saved.statusCode, 200);
      resetLimits();
      const untouched = await app.inject({ method: "GET", url: "/api/users/me/preferences" });
      assert.equal(untouched.statusCode, 200);
      assert.deepEqual(untouched.json(), defaults);
    } finally {
      await other.close();
    }
    const reopened = await buildApp({ userPreferencesPath: path });
    try {
      resetLimits();
      const saved = await reopened.inject({ method: "GET", url: "/api/users/me/preferences" });
      assert.equal(saved.statusCode, 200);
      assert.deepEqual(saved.json(), { ...defaults, themeMode: "dark" });
      rmSync(path);
      mkdirSync(path);
      resetLimits();
      const failed = await reopened.inject({
        method: "PATCH", url: "/api/users/me/preferences", payload: { themeMode: "light" },
      });
      assert.equal(failed.statusCode, 500);
      assert.equal(reopened.userPreferences.get("local-development").themeMode, "dark");
    } finally {
      await reopened.close();
    }
  });
});


test("constructing and closing another app preserves the first app's workspace and CAD owners", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "meco-app-owners-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const task = getSnapshot().tasks[0];
    updateTask(task.id, { title: "First application workspace" });
    await app.cadStore.createImportRun({ projectId: task.projectId, seasonId: null, source: "STEP_UPLOAD", status: "FAILED", originalFilename: "first.step", uploadedFileId: null, uploadedFileHash: null, parserVersion: null, parseStartedAt: null, parseCompletedAt: null, requestedBy: null, errorMessage: "Owner fixture", rawSummaryJson: {} });
    getOnshapeRuntimeStore().recordApiCall(17);
    const { buildApp } = require("../src/app") as typeof import("../src/app");
    const other = await buildApp({ userPreferencesPath: join(directory, "other.json") });
    try {
      const secondTasks = await other.inject({ method: "GET", url: "/api/tasks" });
      assert.equal(secondTasks.statusCode, 200);
      assert.notEqual(secondTasks.json().items.find((item: { id: string }) => item.id === task.id).title, "First application workspace");
      assert.equal((await other.cadStore.listImportRuns()).length, 0);
    } finally {
      await other.close();
    }
    resetLimits();
    const firstTasks = await app.inject({ method: "GET", url: "/api/tasks" });
    assert.equal(firstTasks.statusCode, 200);
    assert.equal(firstTasks.json().items.find((item: { id: string }) => item.id === task.id).title, "First application workspace");
    assert.equal((await app.cadStore.listImportRuns()).length, 1);
    assert.equal(getOnshapeRuntimeStore().getBudget().callsUsedToday, 17);
  });
});
