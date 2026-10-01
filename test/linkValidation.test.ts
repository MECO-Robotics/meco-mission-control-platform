import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot, resetStore } from "../src/data/store";
import {
  validateQaReportLinks,
  validateWorkLogLinks,
} from "../src/routes/helpers/linkValidation";

test("QA reports validate typed targets and participants with or without task-specific workflow", () => {
  resetStore();
  const taskId = getSnapshot().tasks[0]?.id;
  assert.ok(taskId);

  assert.equal(validateWorkLogLinks({ taskId: "missing-task", participantIds: ["missing-member"] }), "The selected task does not exist.");
  assert.equal(validateWorkLogLinks({ taskId, participantIds: ["missing-member"] }), "One or more selected participants do not exist.");
  assert.equal(validateQaReportLinks({ taskId: "missing-task", participantIds: ["ava"], targetRefs: [{ kind: "task", id: "missing-task" }] }), "The selected task does not exist.");
  assert.equal(validateQaReportLinks({ participantIds: ["missing-member"], targetRefs: [{ kind: "project", id: getSnapshot().projects[0]!.id }] }), "One or more selected participants do not exist.");

  assert.equal(validateQaReportLinks({ participantIds: [], targetRefs: [{ kind: "project", id: getSnapshot().projects[0]!.id }] }), null);
});
