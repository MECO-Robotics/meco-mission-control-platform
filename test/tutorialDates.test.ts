import assert from "node:assert/strict";
import { test } from "node:test";
import { createTutorialSnapshot } from "../src/data/tutorialSnapshot";

for (const date of ["2026-09-08", "2027-01-01", "2028-02-29", "2026-05-31"]) {
  test(`tutorial activity stays in the current month and Monday week at ${date}`, () => {
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
    for (const task of data.tasks) assert.ok(task.startDate <= task.dueDate);
    for (const milestone of data.milestones) {
      if (milestone.endDateTime) assert.ok(Date.parse(milestone.startDateTime) <= Date.parse(milestone.endDateTime));
    }
    assert.equal(data.seasons[0].startDate, `${date.slice(0, 7)}-01`);
    assert.equal(data.seasons[0].endDate.slice(0, 7), date.slice(0, 7));
    assert.deepEqual(createTutorialSnapshot(now), data);
  });
}

test("new tutorial data rolls forward without mutating an earlier session", () => {
  const old = createTutorialSnapshot(new Date("2026-12-31T12:00:00Z"));
  const before = structuredClone(old);
  const next = createTutorialSnapshot(new Date("2027-01-04T12:00:00Z"));
  assert.deepEqual(old, before);
  assert.notEqual(next.tasks[0].startDate, old.tasks[0].startDate);
});
