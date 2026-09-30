import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("manufacturing work is exposed through Robot Tasks and commercial state through Purchasing", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const manufacturingQueue = await app.inject({ method: "GET", url: "/api/manufacturing" });
    assert.equal(manufacturingQueue.statusCode, 404);

    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    const body = bootstrap.json();
    assert.equal("manufacturingItems" in body, false);
    assert.equal("taskBlockers" in body, false);

    const outsourcedTask = body.tasks.find((task: { manufacturingDetails: unknown }) => task.manufacturingDetails);
    assert.ok(outsourcedTask);
    assert.equal(outsourcedTask.workTypeId, "robot:manufacturing");
    assert.equal(outsourcedTask.manufacturingDetails.fulfillmentSource, "outsourced");
    const service = body.purchaseItems.find((item: { taskId: string; kind: string }) => item.taskId === outsourcedTask.id);
    assert.equal(service.kind, "manufacturing-service");

    const procurementTask = body.tasks.find((task: { id: string }) => task.id === service.taskId);
    assert.equal(procurementTask.id, outsourcedTask.id);
    resetLimits();
    const purchaseList = await app.inject({ method: "GET", url: "/api/purchases" });
    assert.equal(purchaseList.statusCode, 200);
    assert.ok(purchaseList.json().items.some((item: { id: string }) => item.id === service.id));

    resetLimits();
    const commercialUpdate = await app.inject({
      method: "PATCH", url: `/api/purchases/${service.id}`,
      payload: { expectedDeliveryDate: "2026-10-15", trackingNumber: "TRACK-15" },
    });
    assert.equal(commercialUpdate.statusCode, 200, commercialUpdate.body);
    assert.equal(commercialUpdate.json().item.expectedDeliveryDate, "2026-10-15");
    assert.equal(commercialUpdate.json().item.trackingNumber, "TRACK-15");
    const latestBootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(latestBootstrap.statusCode, 200);
    const latestTask = latestBootstrap.json().tasks.find((item: { id: string }) => item.id === outsourcedTask.id);
    assert.equal(latestTask.manufacturingDetails.fulfillmentSource, "outsourced");
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
