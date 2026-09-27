import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("members and part definitions activate per season in matching bootstrap scopes", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const seasonResponse = await app.inject({
      method: "POST",
      url: "/api/seasons",
      payload: {
        name: "2027 Offseason",
        type: "offseason",
        startDate: "2027-05-01",
        endDate: "2027-08-31",
      },
    });

    assert.equal(seasonResponse.statusCode, 201);
    const seasonId = seasonResponse.json().item.id as string;

    resetLimits();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        seasonId: "default-season",
        name: "Seasoned Plate",
        partNumber: "SEA-900",
        revision: "A",
        iteration: 1,
        type: "custom",
        source: "Onshape",
        materialId: "mat-onyx-filament",
        description: "Scoped by active seasons.",
      },
    });

    assert.equal(createResponse.statusCode, 201);
    const partDefinition = createResponse.json().item as {
      activeSeasonIds: string[];
      id: string;
    };
    assert.deepEqual(partDefinition.activeSeasonIds, ["default-season"]);

    resetLimits();

    const inactiveBootstrapResponse = await app.inject({
      method: "GET",
      url: `/api/bootstrap?seasonId=${encodeURIComponent(seasonId)}`,
    });

    assert.equal(inactiveBootstrapResponse.statusCode, 200);
    assert.equal(
      inactiveBootstrapResponse
        .json()
        .partDefinitions.some((candidate: { id: string }) => candidate.id === partDefinition.id),
      false,
    );
    const { getSnapshot, updateMember } = await import("../src/data/store");
    const member = getSnapshot().members.find((candidate) => candidate.id === "priya");
    assert.ok(member);
    updateMember(member.id, {
      activeSeasonIds: [...(member.activeSeasonIds ?? []), seasonId],
    });

    resetLimits();

    const reactivateResponse = await app.inject({
      method: "PATCH",
      url: `/api/part-definitions/${partDefinition.id}`,
      payload: {
        activeSeasonIds: ["default-season", seasonId],
      },
    });

    assert.equal(reactivateResponse.statusCode, 200);
    assert.deepEqual(
      reactivateResponse.json().item.activeSeasonIds.sort(),
      ["default-season", seasonId].sort(),
    );

    resetLimits();

    const activeBootstrapResponse = await app.inject({
      method: "GET",
      url: `/api/bootstrap?seasonId=${encodeURIComponent(seasonId)}`,
    });

    assert.equal(activeBootstrapResponse.statusCode, 200);
    assert.equal(
      activeBootstrapResponse
        .json()
        .partDefinitions.some((candidate: { id: string }) => candidate.id === partDefinition.id),
      true,
    );
    assert.equal(
      activeBootstrapResponse
        .json()
        .members.some((candidate: { id: string }) => candidate.id === member.id),
      true,
    );
  });
});
