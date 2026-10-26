import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot } from "../src/data/store";
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
        seasonId: "season-2026-meco",
        name: "Seasoned Plate",
        partNumber: "SEA-900",
        revision: "A",
        iteration: 1,
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: getSnapshot().materials[0]!.id,
        description: "Scoped by active seasons.",
      },
    });

    assert.equal(createResponse.statusCode, 201);
    const partDefinition = createResponse.json().item as {
      activeSeasonIds: string[];
      id: string;
    };
    assert.deepEqual(partDefinition.activeSeasonIds, ["season-2026-meco"]);

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
    resetLimits();
    const member = getSnapshot().members.find((candidate) => candidate.role === "student");
    assert.ok(member);

    resetLimits();
    const activateMemberResponse = await app.inject({
      method: "PATCH",
      url: `/api/members/${member.id}`,
      payload: {
        activeSeasonIds: [...(member.activeSeasonIds ?? []), seasonId],
      },
    });
    assert.equal(activateMemberResponse.statusCode, 200);

    resetLimits();

    const reactivateResponse = await app.inject({
      method: "PATCH",
      url: `/api/part-definitions/${partDefinition.id}`,
      payload: {
        activeSeasonIds: ["season-2026-meco", seasonId],
      },
    });

    assert.equal(reactivateResponse.statusCode, 200);
    assert.deepEqual(
      reactivateResponse.json().item.activeSeasonIds.sort(),
      ["season-2026-meco", seasonId].sort(),
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
