import type { PlatformSnapshot } from "../../domain/types";

export const offseasonManufacturingItems = [
    {
      id: "battery-cart-harness-refresh",
      title: "Battery cart harness refresh",
      subsystemId: "pit-readiness",
      requestedById: "olivia",
      process: "fabrication",
      dueDate: "2026-06-01",
      material: "Anderson connectors and 12 AWG wire",
      materialId: "mat-anderson-pack",
      partDefinitionId: "pd-battery-cart-harness",
      partInstanceId: "pi-battery-cart-harness",
      partInstanceIds: ["pi-battery-cart-harness"],
      quantity: 1,
      status: "qa",
      mentorReviewed: true,
      inHouse: true,
      batchLabel: "OPS-22",
    },
    {
      id: "swerve-wheel-tread-prep",
      title: "Swerve wheel tread prep",
      subsystemId: "drive",
      requestedById: "diego",
      process: "fabrication",
      dueDate: "2026-06-03",
      material: "4 in traction wheel set",
      materialId: "mat-traction-wheel-set",
      partDefinitionId: "pd-swerve-wheel-service-kit",
      partInstanceId: "pi-swerve-wheel-service-kit",
      partInstanceIds: ["pi-swerve-wheel-service-kit"],
      quantity: 4,
      status: "approved",
      mentorReviewed: true,
      inHouse: true,
      batchLabel: "DRV-42",
    },
  ] satisfies PlatformSnapshot["manufacturingItems"];

export const offseasonPurchaseItems = [
    {
      id: "swerve-wheel-restock",
      title: "Swerve wheel restock",
      subsystemId: "drive",
      requestedById: "diego",
      partDefinitionId: "pd-swerve-wheel-service-kit",
      quantity: 2,
      vendor: "WCP",
      linkLabel: "wcproducts.com/traction-wheels",
      estimatedCost: 96,
      approvedByMentor: true,
      status: "approved",
    },
    {
      id: "battery-terminal-covers",
      title: "Battery terminal cover set",
      subsystemId: "pit-readiness",
      requestedById: "olivia",
      partDefinitionId: "pd-battery-cart-harness",
      quantity: 12,
      vendor: "AndyMark",
      linkLabel: "andymark.com/battery-terminal-covers",
      estimatedCost: 42,
      approvedByMentor: true,
      status: "purchased",
    },
  ] satisfies PlatformSnapshot["purchaseItems"];

export const offseasonQaReviews = [
    {
      id: "qa-review-battery-cart-harness",
      subjectId: "battery-cart-harness-refresh",
      subjectType: "manufacturing",
      subjectTitle: "Battery cart harness refresh",
      participantIds: ["olivia", "emma"],
      result: "minor-fix",
      mentorApproved: false,
      notes: "Harness strain relief is clean, but retired battery labels need one more pass before approval.",
      reviewedAt: "2026-05-30T11:30:00-04:00",
    },
    {
      id: "qa-review-scouting-schema",
      subjectId: "scouting-schema-normalization",
      subjectType: "task",
      subjectTitle: "Normalize scouting export schema",
      participantIds: ["noah", "riley"],
      result: "pass",
      mentorApproved: true,
      notes: "Clean import contract and realistic rubric examples for the training pass.",
      reviewedAt: "2026-05-30T09:50:00-04:00",
    },
  ] satisfies PlatformSnapshot["qaReviews"];

export const offseasonEscalations = [
    {
      title: "Battery depth is thin for summer scrimmage",
      detail:
        "Two weak packs should be retired, leaving little buffer for back-to-back practice matches unless charging discipline improves.",
      severity: "high",
    },
    {
      title: "Driver station image freeze depends on vendor tool stability",
      detail:
        "The controls team needs final CTRE and REV tool versions before they can freeze the practice laptop image.",
      severity: "medium",
    },
  ] satisfies PlatformSnapshot["escalations"];
