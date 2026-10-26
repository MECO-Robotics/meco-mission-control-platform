import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { getSnapshot } from "../src/data/store";

test("material routes record idempotent stock movements and reject direct balance edits", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    const material = bootstrap.json().materials.find((item: { onHandQuantity: number | null }) => item.onHandQuantity !== null && item.onHandQuantity > 2);
    assert.ok(material);
    const initialQuantity = material.onHandQuantity as number;
    const initialTransactionCount = bootstrap.json().materialTransactions.filter((item: { materialId: string }) => item.materialId === material.id).length;

    const receipt = await app.inject({
      method: "POST", url: `/api/materials/${material.id}/transactions`,
      payload: { operationId: "ledger-route-receipt", movementType: "receipt", quantity: 5, reason: "Restocked" },
    });
    assert.equal(receipt.statusCode, 201, receipt.body);
    assert.equal(receipt.json().item.onHandQuantity, initialQuantity + 5);
    assert.equal(receipt.json().transaction.actorMemberId, getSnapshot().members.find((member) => member.role === "student" || member.role === "lead")?.id ?? null);

    resetLimits();
    const forgedActor = await app.inject({
      method: "POST", url: `/api/materials/${material.id}/transactions`,
      payload: { operationId: "ledger-route-forged-actor", movementType: "receipt", quantity: 1, reason: "Spoof attempt", actorMemberId: "member-forged" },
    });
    assert.equal(forgedActor.statusCode, 400);

    resetLimits();
    const insufficient = await app.inject({
      method: "POST", url: `/api/materials/${material.id}/transactions`,
      payload: { operationId: "ledger-route-too-much", movementType: "consumption", quantity: initialQuantity + 6, reason: "Rejected consumption" },
    });
    assert.equal(insufficient.statusCode, 409);

    resetLimits();
    const consumption = await app.inject({
      method: "POST", url: `/api/materials/${material.id}/transactions`,
      payload: { operationId: "ledger-route-consumption", movementType: "consumption", quantity: 2, reason: "Build use" },
    });
    assert.equal(consumption.statusCode, 201, consumption.body);
    assert.equal(consumption.json().item.onHandQuantity, initialQuantity + 3);

    resetLimits();
    const replay = await app.inject({
      method: "POST", url: `/api/materials/${material.id}/transactions`,
      payload: { operationId: "ledger-route-consumption", movementType: "consumption", quantity: 2, reason: "Build use" },
    });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().replayed, true);

    resetLimits();
    const directEdit = await app.inject({ method: "PATCH", url: `/api/materials/${material.id}`, payload: { onHandQuantity: 99 } });
    assert.equal(directEdit.statusCode, 400);

    resetLimits();
    const history = await app.inject({ method: "GET", url: `/api/materials/${material.id}/transactions` });
    assert.equal(history.statusCode, 200, history.body);
    assert.equal(history.json().items.length, initialTransactionCount + 2);
    const latest = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(latest.json().materials.find((item: { id: string }) => item.id === material.id).onHandQuantity, initialQuantity + 3);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
