import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot } from "../src/data/store";
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

    const outsourcedTask = body.tasks.find((task: { manufacturingDetails: unknown }) => Boolean(task.manufacturingDetails));
    const service = outsourcedTask && body.purchaseItems.find((item: { taskId: string; kind: string }) => item.taskId === outsourcedTask.id && item.kind === "manufacturing-service");
    if (outsourcedTask) {
      assert.equal(outsourcedTask.workTypeId, "robot:manufacturing");
      assert.equal(outsourcedTask.manufacturingDetails.fulfillmentSource, "outsourced");
      assert.ok(service, "outsourced manufacturing work has one linked commercial service record");
    }
    const source = getSnapshot();
    const task = source.tasks.find((item) => item.projectId === "project-robot-2026")!;
    const partDefinition = source.partDefinitions.find((item) => item.seasonId === source.projects.find((project) => project.id === task.projectId)!.seasonId)!;
    const createdPurchaseResponse = await app.inject({ method: "POST", url: "/api/purchases", payload: {
      taskId: task.id, kind: "cots-goods", title: "Commercial workflow test purchase", partDefinitionId: partDefinition.id, materialId: null, quantity: 1,
      quotes: [], selectedQuoteId: null, approvalStatus: "pending", approvedById: null, approvedAt: null, purchaseOrderNumber: null,
      orderStatus: "not-ordered", finalCost: null, expectedDeliveryDate: null, trackingNumber: null, trackingUrl: null, orderedAt: null, deliveredAt: null,
    } });
    assert.equal(createdPurchaseResponse.statusCode, 201, createdPurchaseResponse.body);
    const purchase = createdPurchaseResponse.json().item;
    resetLimits();
    const purchaseList = await app.inject({ method: "GET", url: "/api/purchases" });
    assert.equal(purchaseList.statusCode, 200);
    const lastPurchasePage = await app.inject({ method: "GET", url: "/api/purchases?page=999&pageSize=60" });
    assert.equal(lastPurchasePage.statusCode, 200);
    assert.ok(lastPurchasePage.json().items.some((item: { id: string }) => item.id === purchase.id));

    resetLimits();
    const commercialUpdate = await app.inject({
      method: "PATCH", url: `/api/purchases/${purchase.id}`,
      payload: { expectedDeliveryDate: "2026-10-15", trackingNumber: "TRACK-15" },
    });
    assert.equal(commercialUpdate.statusCode, 200, commercialUpdate.body);
    assert.equal(commercialUpdate.json().item.expectedDeliveryDate, "2026-10-15");
    assert.equal(commercialUpdate.json().item.trackingNumber, "TRACK-15");
    const latestBootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(latestBootstrap.statusCode, 200);
    if (outsourcedTask) {
      const latestTask = latestBootstrap.json().tasks.find((item: { id: string }) => item.id === outsourcedTask.id);
      assert.equal(latestTask.manufacturingDetails.fulfillmentSource, "outsourced");
    }
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
