import type { PlatformSnapshot } from "../../domain/types";

export const offseasonQaReports = [
    {
      id: "qa-battery-health-cull",
      taskId: "battery-health-cull",
      participantIds: ["olivia", "emma"],
      result: "minor-fix",
      mentorApproved: false,
      notes: "Two batteries sagged below threshold after load test. Mark retired and update cart labels before scrimmage.",
      reviewedAt: "2026-05-30T11:40:00-04:00",
    },
    {
      id: "qa-scouting-schema-normalization",
      taskId: "scouting-schema-normalization",
      participantIds: ["noah", "riley"],
      result: "pass",
      mentorApproved: true,
      notes: "Normalized export includes every scrimmage row and matches the strategy dashboard import contract.",
      reviewedAt: "2026-05-30T09:50:00-04:00",
    },
  ] satisfies PlatformSnapshot["qaReports"];

export const offseasonTestResults = [
    {
      id: "test-offseason-maintenance-review",
      milestoneId: "offseason-maintenance-review-may-30",
      title: "Maintenance review checklist",
      status: "blocked",
      findings: [
        "Battery cart relabeling incomplete",
        "Driver station image blocked by vendor firmware update",
        "Swerve wheel stock below desired scrimmage quantity",
      ],
    },
    {
      id: "test-scouting-data-retro",
      milestoneId: "scouting-data-retro-jun-06",
      title: "Scouting schema import dry run",
      status: "pass",
      findings: [
        "Tablet export normalizes cleanly after row reconciliation",
        "Rubric language still needs training examples for rookie scouts",
      ],
    },
  ] satisfies PlatformSnapshot["testResults"];

export const offseasonQaFindings = [
    {
      id: "finding-battery-label-mismatch",
      qaReportId: "qa-battery-health-cull",
      taskId: "battery-health-cull",
      projectId: "project-operations-2026",
      workstreamId: "workstream-operations-logistics",
      subsystemId: "pit-readiness",
      mechanismId: "battery-checkout",
      partInstanceId: "pi-battery-cart-harness",
      artifactId: "artifact-summer-scrimmage-runbook",
      title: "Battery labels do not match cart slots",
      detail: "Two retired batteries still appear in active cart positions in the runbook.",
      severity: "medium",
      status: "open",
      createdAt: "2026-05-30T11:45:00-04:00",
      updatedAt: "2026-05-30T11:45:00-04:00",
    },
  ] satisfies PlatformSnapshot["qaFindings"];

export const offseasonTestFindings = [
    {
      id: "finding-driver-station-image-blocked",
      testResultId: "test-offseason-maintenance-review",
      milestoneId: "offseason-maintenance-review-may-30",
      taskId: "driver-station-image-refresh",
      projectId: "project-robot-2026",
      workstreamId: "workstream-controls",
      subsystemId: "controls",
      mechanismId: "driver-station-replay",
      partInstanceId: "pi-driver-station-image",
      artifactId: "artifact-drive-log-template-may",
      title: "Driver station image blocked by tool update",
      detail: "The team cannot freeze the laptop image until vendor tool versions are pinned.",
      severity: "high",
      status: "open",
      createdAt: "2026-05-30T12:00:00-04:00",
      updatedAt: "2026-05-30T12:00:00-04:00",
    },
  ] satisfies PlatformSnapshot["testFindings"];

export const offseasonDesignIterations = [
    {
      id: "iteration-battery-cart-labels",
      sourceType: "qa",
      findingId: "finding-battery-label-mismatch",
      projectId: "project-operations-2026",
      workstreamId: "workstream-operations-logistics",
      subsystemId: "pit-readiness",
      mechanismId: "battery-checkout",
      partInstanceId: "pi-battery-cart-harness",
      artifactId: "artifact-summer-scrimmage-runbook",
      taskId: "battery-health-cull",
      notes: "Revise cart labels, retired-pack tags, and runbook slot map before packing.",
      status: "in-progress",
      createdAt: "2026-05-30T12:05:00-04:00",
      updatedAt: "2026-05-30T12:05:00-04:00",
    },
  ] satisfies PlatformSnapshot["designIterations"];

export const offseasonRisks = [
    {
      id: "risk-scrimmage-battery-depth",
      title: "Battery depth may not cover full scrimmage day",
      detail: "Retiring weak packs leaves only a narrow buffer for back-to-back practice matches.",
      severity: "high",
      sourceType: "qa-report",
      sourceId: "qa-battery-health-cull",
      attachmentType: "workstream",
      attachmentId: "workstream-operations-logistics",
      mitigationTaskId: "battery-health-cull",
    },
    {
      id: "risk-driver-station-freeze",
      title: "Driver station image could slip past practice window",
      detail: "Vendor firmware and log tooling updates are still unstable enough to block image freeze.",
      severity: "medium",
      sourceType: "test-result",
      sourceId: "test-offseason-maintenance-review",
      attachmentType: "mechanism",
      attachmentId: "driver-station-replay",
      mitigationTaskId: "driver-station-image-refresh",
    },
  ] satisfies PlatformSnapshot["risks"];
