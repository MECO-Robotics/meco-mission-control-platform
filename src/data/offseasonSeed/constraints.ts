import type { PlatformSnapshot } from "../../domain/types";

export const offseasonTaskDependencies = [
  {
    id: "dep-auto-replay-integrate-vision",
    taskId: "auto-replay-suite",
    kind: "task",
    refId: "integrate-vision",
    requiredState: "complete",
    dependencyType: "hard",
    createdAt: "2026-05-30T08:00:00-04:00",
  },
  {
    id: "dep-scrimmage-loadout-battery-health",
    taskId: "scrimmage-spares-loadout",
    kind: "task",
    refId: "battery-health-cull",
    requiredState: "complete",
    dependencyType: "hard",
    createdAt: "2026-06-03T08:30:00-04:00",
  },
] satisfies PlatformSnapshot["taskDependencies"];

export const offseasonTaskBlockers = [
  {
    id: "blocker-driver-station-tooling",
    blockedTaskId: "driver-station-image-refresh",
    blockerType: "external",
    blockerId: null,
    description: "Awaiting final CTRE and REV tool versions for the offseason laptop image.",
    severity: "high",
    status: "open",
    createdByMemberId: "emma",
    createdAt: "2026-05-30T12:10:00-04:00",
    resolvedAt: null,
  },
  {
    id: "blocker-scrimmage-field-map",
    blockedTaskId: "scrimmage-spares-loadout",
    blockerType: "external",
    blockerId: null,
    description: "Host team has not confirmed the pit power layout or spare-table footprint.",
    severity: "medium",
    status: "open",
    createdByMemberId: "maya",
    createdAt: "2026-05-30T14:00:00-04:00",
    resolvedAt: null,
  },
] satisfies PlatformSnapshot["taskBlockers"];
