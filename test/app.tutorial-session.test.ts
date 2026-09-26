import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { createWorkflowAuthHeaders, workflowAuthEnv } from "./helpers/workflowAuth";
import type { SnapshotView } from "../src/domain/types";

interface TutorialResetResponse {
  ok: boolean;
  mode: "session" | "baseline";
  restored: boolean;
  tutorial: {
    seasonId: string | null;
    seasonName: string | null;
    expectedProjectNames: string[];
    projectIdsByName: Record<string, string>;
    missingProjectNames: string[];
  };
}

test("tutorial baseline reset restores canonical season/projects and is idempotent", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const createMemberResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Tutorial Temp Student",
        role: "student",
      },
    });

    assert.equal(createMemberResponse.statusCode, 201);
    const createdMemberBody = createMemberResponse.json() as {
      item: { id: string };
    };
    assert.ok(createdMemberBody.item.id);

    resetLimits();

    const firstResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "baseline",
      },
    });

    assert.equal(firstResetResponse.statusCode, 200);
    const firstResetBody = firstResetResponse.json() as TutorialResetResponse;
    assert.equal(firstResetBody.ok, true);
    assert.equal(firstResetBody.mode, "baseline");
    assert.equal(firstResetBody.restored, true);
    assert.equal(firstResetBody.tutorial.seasonId, "default-season");
    assert.equal(firstResetBody.tutorial.seasonName, "Tutorial Season");
    assert.deepEqual(firstResetBody.tutorial.expectedProjectNames, [
      "Tutorial Robot 2026",
      "Media",
      "Outreach",
      "Operations",
      "Strategy",
      "Training",
    ]);
    assert.equal(firstResetBody.tutorial.projectIdsByName.Outreach, "project-outreach-2026");
    assert.deepEqual(firstResetBody.tutorial.missingProjectNames, []);

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      members: Array<{ id: string }>;
      tasks: Array<{ startDate: string; dueDate: string }>;
    };
    assert.equal(
      bootstrapBody.members.some((member) => member.id === createdMemberBody.item.id),
      false,
    );

    resetLimits();

    const currentMonth = new Date().toISOString().slice(0, 7);
    assert.ok(bootstrapBody.tasks.length > 0);
    assert.ok(bootstrapBody.tasks.every((task) => task.startDate.startsWith(currentMonth) && task.dueDate.startsWith(currentMonth)));

    const secondResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "baseline",
      },
    });

    assert.equal(secondResetResponse.statusCode, 200);
    const secondResetBody = secondResetResponse.json() as TutorialResetResponse;
    assert.deepEqual(secondResetBody, firstResetBody);
  });
});

test("tutorial session reset keeps snapshot restore semantics", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const startResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
    });

    assert.equal(startResponse.statusCode, 200);
    const startBody = startResponse.json() as {
      ok: boolean;
      mode: "session";
      tutorial: TutorialResetResponse["tutorial"];
    };
    assert.equal(startBody.ok, true);
    assert.equal(startBody.mode, "session");
    assert.equal(startBody.tutorial.seasonId, "default-season");

    resetLimits();

    const createMemberResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Tutorial Session Student",
        role: "student",
      },
    });

    assert.equal(createMemberResponse.statusCode, 201);
    const createdMemberBody = createMemberResponse.json() as {
      item: { id: string };
    };
    assert.ok(createdMemberBody.item.id);

    resetLimits();

    const resetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
    });

    assert.equal(resetResponse.statusCode, 200);
    const resetBody = resetResponse.json() as TutorialResetResponse;
    assert.equal(resetBody.ok, true);
    assert.equal(resetBody.mode, "session");
    assert.equal(resetBody.restored, true);

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      members: Array<{ id: string }>;
    };
    assert.equal(
      bootstrapBody.members.some((member) => member.id === createdMemberBody.item.id),
      false,
    );

    resetLimits();

    const secondResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
    });

    assert.equal(secondResetResponse.statusCode, 200);
    const secondResetBody = secondResetResponse.json() as TutorialResetResponse;
    assert.equal(secondResetBody.ok, false);
    assert.equal(secondResetBody.mode, "session");
    assert.equal(secondResetBody.restored, false);
  });
});

test("tutorial baseline reset preserves active session snapshot for restore", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const startResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
    });

    assert.equal(startResponse.statusCode, 200);

    resetLimits();

    const baselineResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "baseline",
      },
    });

    assert.equal(baselineResetResponse.statusCode, 200);
    const baselineResetBody = baselineResetResponse.json() as TutorialResetResponse;
    assert.equal(baselineResetBody.ok, true);
    assert.equal(baselineResetBody.mode, "baseline");

    resetLimits();

    const createMemberResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Tutorial Baseline Session Student",
        role: "student",
      },
    });

    assert.equal(createMemberResponse.statusCode, 201);
    const createdMemberBody = createMemberResponse.json() as {
      item: { id: string };
    };

    resetLimits();

    const sessionResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "session",
      },
    });

    assert.equal(sessionResetResponse.statusCode, 200);
    const sessionResetBody = sessionResetResponse.json() as TutorialResetResponse;
    assert.equal(sessionResetBody.ok, true);
    assert.equal(sessionResetBody.mode, "session");
    assert.equal(sessionResetBody.restored, true);

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      members: Array<{ id: string }>;
    };
    assert.equal(
      bootstrapBody.members.some((member) => member.id === createdMemberBody.item.id),
      false,
    );
  });
});

test("tutorial reset rejects invalid payload modes", async () => {
  await withIntegrationApp(async ({ app }) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "chapter",
      },
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as {
      message: string;
    };
    assert.equal(body.message, "Tutorial reset payload is invalid.");
  });
});


test("HTTP tutorial mutations stage publication, serialize lifecycle changes and isolate users", { timeout: 30_000 }, async () => {
  await withIntegrationApp(async ({ app }) => {
    const alice = await createWorkflowAuthHeaders("mentor");
    const bob = await createWorkflowAuthHeaders("admin");
    const global = await createWorkflowAuthHeaders("lead");
    let held: {
      notes: string;
      fail: boolean;
      entered: () => void;
      wait: Promise<void>;
      release: () => void;
    } | undefined;
    let queued: (() => void) | undefined;
    let disconnected: (() => void) | undefined;
    app.addHook("onRequest", async (request, reply) => {
      if (request.headers["x-observe-queue"]) queued?.();
      if (request.headers["x-observe-disconnect"]) reply.raw.once("close", () => disconnected?.());
    });
    app.addHook("preSerialization", async (request, reply, payload) => {
      if (held && (request.body as { notes?: string } | undefined)?.notes === held.notes && reply.statusCode < 400) {
        const pending = held;
        pending.entered();
        await pending.wait;
        if (pending.fail) throw new Error("Injected failure before response publication");
      }
      if (request.headers["x-fail-response"] && reply.statusCode < 400) {
        throw new Error("Injected lifecycle response failure");
      }
      return payload;
    });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const send = async (headers: typeof alice, path: string, payload?: object, observeQueue = false, signal?: AbortSignal) => {
      const response = await fetch(address + path, {
        method: payload ? "POST" : "GET",
        headers: { ...headers, ...(payload ? { "Content-Type": "application/json" } : {}), ...(observeQueue ? { "x-observe-queue": "true" } : {}) },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: signal ?? AbortSignal.timeout(10_000),
      });
      return { status: response.status, body: await response.json() as SnapshotView & { ok?: boolean } };
    };
    const read = async (headers: typeof alice) => {
      const response = await send(headers, "/api/bootstrap");
      assert.equal(response.status, 200);
      return response.body;
    };
    const initial = await read(global);
    const payload = (notes: string) => ({
      taskId: initial.tasks[0].id, date: "2026-09-26", hours: 1,
      participantIds: [initial.members[0].id], notes,
    });
    const count = (snapshot: SnapshotView, notes: string) => snapshot.workLogs.filter(item => item.notes === notes).length;
    const signal = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      return { promise, resolve };
    };
    const hold = (notes: string, fail = false) => {
      const entered = signal();
      const release = signal();
      held = { notes, fail, entered: entered.resolve, wait: release.promise, release: release.resolve };
      return { entered: entered.promise, release: release.resolve };
    };
    try {
      for (const headers of [alice, bob]) {
        assert.equal((await send(headers, "/api/tutorial/session/start", {})).status, 200);
      }

      for (const headers of [global, alice]) {
        const before = await read(headers);
        const gate = hold("failed work log", true);
        const pending = send(headers, "/api/work-logs", payload("failed work log"));
        await gate.entered;
        assert.equal(count(await read(headers), "failed work log"), 0);
        gate.release();
        assert.equal((await pending).status, 500);
        const after = await read(headers);
        assert.equal(count(after, "failed work log"), 0);
        assert.equal(after.actions?.length, before.actions?.length);
      }

      const disconnectedResponse = signal();
      disconnected = disconnectedResponse.resolve;
      const disconnectGate = hold("accepted before disconnect");
      const controller = new AbortController();
      const disconnectedHeaders = { ...alice, "x-observe-disconnect": "true" };
      const disconnectedRequest = send(disconnectedHeaders, "/api/work-logs", payload("accepted before disconnect"), false, controller.signal);
      const rejectedResponse = assert.rejects(disconnectedRequest, { name: "AbortError" });
      await disconnectGate.entered;
      controller.abort();
      await rejectedResponse;
      await disconnectedResponse.promise;
      disconnectGate.release();
      assert.equal((await send(alice, "/api/work-logs", payload("after disconnect"))).status, 201);
      assert.equal(count(await read(alice), "accepted before disconnect"), 1);
      assert.equal(count(await read(alice), "after disconnect"), 1);

      const failedLifecycleHeaders = { ...alice, "x-fail-response": "true" };
      let gate = hold("first tutorial write");
      let pending = send(alice, "/api/work-logs", payload("first tutorial write"));
      await gate.entered;
      let observed = signal();
      queued = observed.resolve;
      const second = send(alice, "/api/work-logs", payload("second tutorial write"), true);
      await observed.promise;
      assert.equal((await send(bob, "/api/work-logs", payload("other user's write"))).status, 201);
      assert.equal(count(await read(alice), "second tutorial write"), 0);
      gate.release();
      assert.equal((await pending).status, 201);
      assert.equal((await second).status, 201);
      let published = await read(alice);
      assert.equal(count(published, "first tutorial write"), 1);
      assert.equal(count(published, "second tutorial write"), 1);
      assert.equal(count(published, "other user's write"), 0);
      assert.equal(count(await read(global), "first tutorial write"), 0);

      for (const [path, body] of [
        ["/api/tutorial/session/start", {}],
        ["/api/tutorial/session/reset", { mode: "baseline" }],
        ["/api/tutorial/session/reset", { mode: "session" }],
      ] as const) {
        assert.equal((await send(failedLifecycleHeaders, path, body)).status, 500);
        assert.equal(count(await read(alice), "first tutorial write"), 1);
      }

      gate = hold("before reset");
      pending = send(alice, "/api/work-logs", payload("before reset"));
      await gate.entered;
      observed = signal(); queued = observed.resolve;
      const reset = send(alice, "/api/tutorial/session/reset", { mode: "baseline" }, true);
      await observed.promise;
      assert.equal(count(await read(alice), "first tutorial write"), 1);
      gate.release();
      assert.equal((await pending).status, 201);
      assert.equal((await reset).status, 200);
      published = await read(alice);
      assert.equal(count(published, "first tutorial write"), 0);
      assert.equal(count(published, "before reset"), 0);

      gate = hold("before end");
      pending = send(alice, "/api/work-logs", payload("before end"));
      await gate.entered;
      observed = signal(); queued = observed.resolve;
      const end = send(alice, "/api/tutorial/session/reset", { mode: "session" }, true);
      await observed.promise;
      const afterEnd = send(alice, "/api/work-logs", payload("after end"));
      gate.release();
      assert.equal((await pending).status, 201);
      assert.equal((await end).body.ok, true);
      assert.equal((await afterEnd).status, 201);
      assert.equal(count(await read(global), "after end"), 1);
      assert.equal(count(await read(global), "before end"), 0);
      assert.equal(count(await read(bob), "other user's write"), 1);
      assert.equal((await send(failedLifecycleHeaders, "/api/tutorial/session/start", {})).status, 500);
      assert.equal(count(await read(alice), "after end"), 1);
    } finally {
      held?.release();
    }
  }, { env: { ...workflowAuthEnv, API_RATE_LIMIT_MAX_REQUESTS: "1000" } });
});
