const SNAPSHOT_MUTATION_PREFIXES = [
  "/api/seasons", "/api/projects", "/api/workstreams", "/api/reports",
  "/api/report-findings", "/api/qa-reports", "/api/qa-requests",
  "/api/test-results", "/api/risks", "/api/work-logs", "/api/milestones",
  "/api/materials", "/api/artifacts", "/api/tasks", "/api/task-dependencies",
  "/api/task-blockers", "/api/members", "/api/subsystems", "/api/mechanisms",
  "/api/part-definitions", "/api/part-instances", "/api/manufacturing",
  "/api/purchases", "/api/meetings",
  "/api/navigation/favorites",
] as const;

const SNAPSHOT_MUTATION_PATTERNS = [
  /^\/api\/cad\/snapshots\/[^/]+\/finalize$/,
] as const;

export function isSnapshotMutationRequest(method: string, url: string) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return false;
  }

  const pathname = url.split("?", 1)[0];
  return SNAPSHOT_MUTATION_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  ) || SNAPSHOT_MUTATION_PATTERNS.some((pattern) => pattern.test(pathname));
}
