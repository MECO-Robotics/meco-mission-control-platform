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
