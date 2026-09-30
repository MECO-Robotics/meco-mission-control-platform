import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot, resetStore } from "../src/data/store";
import {
  validateQaReportLinks,
  validateWorkLogLinks,
} from "../src/routes/helpers/linkValidation";

test("work-log and QA-report links share task and participant validation", () => {
  resetStore();
  const taskId = getSnapshot().tasks[0]?.id;
  assert.ok(taskId);

  for (const validate of [validateWorkLogLinks, validateQaReportLinks]) {
    assert.equal(
      validate({ taskId: "missing-task", participantIds: ["missing-member"] }),
      "The selected task does not exist.",
    );
    assert.equal(
      validate({ taskId, participantIds: ["missing-member"] }),
      "One or more selected participants do not exist.",
    );
  }

  assert.equal(
    validateQaReportLinks({
      taskId,
      participantIds: [],
      proposedRiskSeverity: "high",
    }),
    "A risk reassessment requires a target risk.",
  );
});
