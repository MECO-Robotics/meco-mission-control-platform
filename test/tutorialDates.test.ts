import assert from "node:assert/strict";
import { test } from "node:test";
import { createTutorialSnapshot } from "../src/data/tutorialSnapshot";

for (const date of ["2026-09-08", "2027-01-01", "2028-02-29", "2026-05-31"]) {
  test(`seed dates use the current UTC month and week at ${date}`, () => {
    const now = new Date(`${date}T12:00:00Z`);
    const data = createTutorialSnapshot(now);
    const day = 86_400_000;
    const monday = Date.parse(date) - ((now.getUTCDay() + 6) % 7) * day;
    const checkDates = (value: unknown): void => {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
        assert.equal(value.slice(0, 7), date.slice(0, 7));
        assert.ok(Date.parse(value) >= monday && Date.parse(value) < monday + 7 * day, value);
      } else if (value && typeof value === "object") Object.values(value).forEach(checkDates);
    };
    for (const [key, value] of Object.entries(data)) if (key !== "seasons") checkDates(value);
    assert.equal(data.seasons[0].startDate, `${date.slice(0, 7)}-01`);
    assert.equal(data.seasons[0].endDate.slice(0, 7), date.slice(0, 7));
  });
}

test("fresh snapshots roll forward without mutating an earlier snapshot", () => {
  const old = createTutorialSnapshot(new Date("2026-12-31T12:00:00Z"));
  const next = createTutorialSnapshot(new Date("2027-01-04T12:00:00Z"));
  assert.equal(old.seasons[0].startDate, "2026-12-01");
  assert.equal(next.seasons[0].startDate, "2027-01-01");
  assert.notEqual(next.tasks[0].startDate, old.tasks[0].startDate);
});
