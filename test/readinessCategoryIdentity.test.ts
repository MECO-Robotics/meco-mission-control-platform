import assert from "node:assert/strict";
import { test } from "node:test";
import { derivePartInstanceReadiness } from "../src/domain/readiness";
import type { SnapshotView } from "../src/domain/types";

test("same-ID QA and test findings use only their own passing retests", () => {
  const part = { id: "part-1", partDefinitionId: "definition-1" };
  const qaReport = {
    id: "qa-source",
    status: "reviewed",
    result: "iteration-worthy",
    reviewOrder: 4,
    targetRefs: [{ kind: "part-instance", id: part.id }],
    inspectedPartInstanceIds: [part.id],
    targetRevisions: { "definition-1": "A" },
  };
  const testResult = {
    id: "test-source",
    title: "Continuity",
    status: "fail",
    createdAt: "2026-01-01T00:00:00.000Z",
    verificationOrder: 7,
    targetRefs: [{ kind: "part-instance", id: part.id }],
    inspectedPartInstanceIds: [part.id],
    targetRevisions: { "definition-1": "A" },
  };
  const passingRetest = (supersedesId: string, verificationOrder: number) => ({
    result: "pass",
    supersedesId,
    verificationOrder,
    inspectedPartInstanceIds: [part.id],
    targetRevisions: { "definition-1": "A" },
  });
  const qaFinding = {
    id: "shared-finding-id",
    reportId: qaReport.id,
    status: "resolved",
    targetRefs: [{ kind: "part-instance", id: part.id }],
    retests: [passingRetest(qaReport.id, 5)],
  };
  const testFinding = {
    id: "shared-finding-id",
    reportId: null,
    testResultId: testResult.id,
    status: "resolved",
    targetRefs: [{ kind: "part-instance", id: part.id }],
    retests: [passingRetest(testResult.id, 8)],
  };
  const base = {
    partInstances: [part],
    partDefinitions: [{ id: "definition-1", revision: "A" }],
    tasks: [],
    risks: [],
    qaReports: [qaReport],
    testResults: [testResult],
    milestoneRequirements: [],
  };
  const readiness = (qaFindings: unknown[], testFindings: unknown[], results = [testResult]) =>
    derivePartInstanceReadiness(part as never, {
      ...base,
      qaFindings,
      testFindings,
      testResults: results,
    } as unknown as SnapshotView);

  assert.equal(readiness([qaFinding], [testFinding]), "not-ready", "both linked failures clear without inventing a passing overall result");
  assert.equal(readiness([qaFinding], [{ ...testFinding, retests: [] }]), "blocked", "a QA retest cannot clear the same-ID test finding");
  assert.equal(readiness([{ ...qaFinding, retests: [] }], [testFinding]), "blocked", "a test retest cannot clear the same-ID QA finding");
  assert.equal(
    readiness([qaFinding], [testFinding], [testResult, { ...testResult, id: "unrelated-failure", title: "Separate check", verificationOrder: 9 }]),
    "blocked",
    "an unrelated failing test remains blocking after both linked findings pass retest",
  );
});

test("definition-scoped QA and test findings clear only their retested failures", () => {
  const part = { id: "part-1", partDefinitionId: "definition-1" };
  const definitionTarget = [{ kind: "part-definition", id: part.partDefinitionId }];
  const qaReport = {
    id: "qa-definition-source", status: "reviewed", result: "iteration-worthy", reviewOrder: 4,
    targetRefs: definitionTarget, inspectedPartInstanceIds: [part.id], targetRevisions: { "definition-1": "A" },
  };
  const testResult = {
    id: "test-definition-source", title: "Continuity", status: "fail", createdAt: "2026-01-01T00:00:00.000Z",
    verificationOrder: 7, targetRefs: definitionTarget, inspectedPartInstanceIds: [part.id], targetRevisions: { "definition-1": "A" },
  };
  const passingRetest = (supersedesId: string, verificationOrder: number) => ({
    result: "pass", supersedesId, verificationOrder, inspectedPartInstanceIds: [part.id], targetRevisions: { "definition-1": "A" },
  });
  const qaFinding = {
    id: "qa-definition-finding", reportId: qaReport.id, status: "resolved", targetRefs: definitionTarget,
    retests: [passingRetest(qaReport.id, 5)],
  };
  const testFinding = {
    id: "test-definition-finding", reportId: null, testResultId: testResult.id, status: "resolved", targetRefs: definitionTarget,
    retests: [passingRetest(testResult.id, 8)],
  };
  const base = {
    partInstances: [part], partDefinitions: [{ id: part.partDefinitionId, revision: "A" }], tasks: [], risks: [],
    qaReports: [qaReport], testResults: [testResult], milestoneRequirements: [],
  };
  const readiness = (qaFindings: unknown[], testFindings: unknown[], qaReports = [qaReport], testResults = [testResult]) =>
    derivePartInstanceReadiness(part as never, { ...base, qaFindings, testFindings, qaReports, testResults } as unknown as SnapshotView);

  assert.equal(readiness([{ ...qaFinding, status: "open", retests: [] }], [], [], []), "blocked", "an open definition-scoped QA finding blocks without a failed report source");
  assert.equal(readiness([], [{ ...testFinding, status: "open", retests: [] }], [], []), "blocked", "an open definition-scoped test finding blocks without a failed result source");
  assert.equal(readiness([qaFinding], [testFinding], [], []), "not-ready", "resolved definition-scoped findings do not block without source records");
  assert.equal(readiness([qaFinding], [], [qaReport], []), "not-ready", "a passing retest clears its definition-scoped QA failure without creating a passing report");
  assert.equal(readiness([], [testFinding], [], [testResult]), "not-ready", "a passing retest clears its definition-scoped test failure without creating a passing result");
  assert.equal(readiness([qaFinding, { ...qaFinding, id: "open-qa-finding", status: "open", retests: [] }], [], [qaReport], []), "blocked", "an open QA finding on the same definition keeps its failure active");
  assert.equal(readiness([], [testFinding, { ...testFinding, id: "open-test-finding", status: "open", retests: [] }], [], [testResult]), "blocked", "an open test finding on the same definition keeps its failure active");
  assert.equal(readiness([qaFinding], [testFinding], [qaReport], [testResult, { ...testResult, id: "unrelated-test-failure", title: "Separate check", verificationOrder: 9 }]), "blocked", "an unrelated failing test remains blocking after definition-scoped retests");
});

test("a finding retest does not replace its newer nonpass QA report with an older pass", () => {
  const part = { id: "part-1", partDefinitionId: "definition-1" };
  const targetRefs = [{ kind: "part-instance", id: part.id }];
  const reviewedPass = {
    id: "older-overall-pass", status: "reviewed", result: "pass", reviewOrder: 1,
    targetRefs, inspectedPartInstanceIds: [part.id], targetRevisions: { "definition-1": "A" },
  };
  const reviewedMinorFix = {
    ...reviewedPass, id: "newer-minor-fix", result: "minor-fix", reviewOrder: 2,
  };
  const resolvedFinding = {
    id: "minor-fix-finding", reportId: reviewedMinorFix.id, status: "resolved", targetRefs,
    retests: [{
      result: "pass", supersedesId: reviewedMinorFix.id, verificationOrder: 3,
      inspectedPartInstanceIds: [part.id], targetRevisions: { "definition-1": "A" },
    }],
  };
  const base = {
    partInstances: [part], partDefinitions: [{ id: part.partDefinitionId, revision: "A" }], tasks: [], risks: [],
    qaFindings: [resolvedFinding], testFindings: [], testResults: [], milestoneRequirements: [],
  };
  const readiness = (qaReports: unknown[], qaFindings = base.qaFindings) =>
    derivePartInstanceReadiness(part as never, { ...base, qaReports, qaFindings } as unknown as SnapshotView);

  assert.equal(readiness([reviewedPass, reviewedMinorFix]), "not-ready", "passing finding retest clears its failure but not the newer report's overall approval");
  assert.equal(readiness([reviewedMinorFix, reviewedPass]), "not-ready", "server review order wins regardless of report input order");
  const laterOverallPass = { ...reviewedPass, id: "fresh-overall-pass", reviewOrder: 4 };
  assert.equal(readiness([reviewedPass, reviewedMinorFix, laterOverallPass]), "ready", "a fresh reviewed overall pass clears the newer nonpass outcome");
  assert.equal(readiness([laterOverallPass, reviewedMinorFix, reviewedPass]), "ready", "fresh pass selection is independent of input order");
  const reviewedIterationWorthy = { ...reviewedMinorFix, id: "newer-iteration-worthy", result: "iteration-worthy" };
  const iterationFinding = { ...resolvedFinding, id: "iteration-finding", reportId: reviewedIterationWorthy.id, retests: [{ ...resolvedFinding.retests[0]!, supersedesId: reviewedIterationWorthy.id }] };
  assert.equal(readiness([reviewedPass, reviewedIterationWorthy], [iterationFinding]), "not-ready", "a passing retest of an iteration-worthy report still needs a fresh overall pass");
  assert.equal(readiness([reviewedIterationWorthy, reviewedPass, { ...laterOverallPass, reviewOrder: 4 }], [iterationFinding]), "ready");
  const unrelatedOpenFailure = { ...resolvedFinding, id: "unrelated-open-failure", reportId: "another-review", status: "open", retests: [] };
  assert.equal(readiness([reviewedPass, reviewedMinorFix], [resolvedFinding, unrelatedOpenFailure]), "blocked", "an unrelated active failure continues to block after the linked finding is retested");
});

test("a passing test finding retest does not replace its newer failed test with an older pass", () => {
  const part = { id: "part-1", partDefinitionId: "definition-1" };
  const targetRefs = [{ kind: "part-instance", id: part.id }];
  const testPass = {
    id: "older-test-pass", title: "Continuity", status: "pass", createdAt: "2026-01-01T00:00:00.000Z",
    verificationOrder: 1, targetRefs, inspectedPartInstanceIds: [part.id], targetRevisions: { "definition-1": "A" },
  };
  const testFailure = {
    ...testPass, id: "newer-test-failure", status: "fail", verificationOrder: 2,
  };
  const finding = {
    id: "test-finding", testResultId: testFailure.id, status: "resolved", targetRefs,
    retests: [{ result: "pass", supersedesId: testFailure.id, verificationOrder: 3,
      inspectedPartInstanceIds: [part.id], targetRevisions: { "definition-1": "A" } }],
  };
  const base = {
    partInstances: [part], partDefinitions: [{ id: part.partDefinitionId, revision: "A" }], tasks: [], risks: [],
    qaReports: [], qaFindings: [], testFindings: [finding], milestoneRequirements: [],
  };
  const readiness = (testResults: unknown[]) => derivePartInstanceReadiness(part as never, { ...base, testResults } as unknown as SnapshotView);

  assert.equal(readiness([testPass, testFailure]), "not-ready");
  assert.equal(readiness([testFailure, testPass]), "not-ready", "verification order wins over array order");
  const laterPass = { ...testPass, id: "later-test-pass", verificationOrder: 4 };
  assert.equal(readiness([testFailure, laterPass, testPass]), "ready", "a later full test pass for the same check restores readiness");
  const unrelatedOpenFailure = { ...testFailure, id: "unrelated-failure", title: "Separate check", verificationOrder: 5 };
  assert.equal(readiness([testFailure, laterPass, unrelatedOpenFailure]), "blocked", "an unrelated active failed check still blocks");
});
