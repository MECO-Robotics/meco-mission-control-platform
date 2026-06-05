import { z } from "zod";

export const BOOTSTRAP_CONTRACT_NAME = "meco-mission-control-platform-bootstrap";
export const BOOTSTRAP_CONTRACT_VERSION = 1;

const bootstrapCollectionSchema = z.array(z.record(z.string(), z.unknown()));
const pmCadSourceValues = ["manual", "step", "onshape"] as const;
const pmCadImportSourceValues = [
  "MANUAL",
  "STEP_UPLOAD",
  "ONSHAPE_API",
  "ONSHAPE_BOM_CSV",
  "MANUAL_BOM_CSV",
] as const;
const pmCadProvenanceRecordSchema = z
  .object({
    cadSource: z.enum(pmCadSourceValues),
    cadImportSource: z.enum(pmCadImportSourceValues),
    cadEditedAfterImport: z.boolean(),
    cadSourceLabel: z.string().optional(),
    cadUpdatedAt: z.string().nullable().optional(),
  })
  .passthrough();
const pmCadProvenanceCollectionSchema = z.array(pmCadProvenanceRecordSchema);

export const bootstrapPayloadSchema = z
  .object({
    seasons: bootstrapCollectionSchema,
    projects: bootstrapCollectionSchema,
    workstreams: bootstrapCollectionSchema,
    members: bootstrapCollectionSchema,
    subsystems: pmCadProvenanceCollectionSchema,
    disciplines: bootstrapCollectionSchema,
    mechanisms: pmCadProvenanceCollectionSchema,
    materials: bootstrapCollectionSchema,
    artifacts: bootstrapCollectionSchema,
    partDefinitions: pmCadProvenanceCollectionSchema,
    partInstances: pmCadProvenanceCollectionSchema,
    milestones: bootstrapCollectionSchema,
    milestoneRequirements: bootstrapCollectionSchema,
    reports: bootstrapCollectionSchema,
    reportFindings: bootstrapCollectionSchema,
    qaReports: bootstrapCollectionSchema,
    qaRequests: bootstrapCollectionSchema,
    testResults: bootstrapCollectionSchema,
    risks: bootstrapCollectionSchema,
    tasks: bootstrapCollectionSchema,
    taskDependencies: bootstrapCollectionSchema,
    taskBlockers: bootstrapCollectionSchema,
    workLogs: bootstrapCollectionSchema,
    meetings: bootstrapCollectionSchema,
    attendanceRecords: bootstrapCollectionSchema,
    manufacturingItems: bootstrapCollectionSchema,
    purchaseItems: bootstrapCollectionSchema,
    qaReviews: bootstrapCollectionSchema,
    escalations: bootstrapCollectionSchema,
    actions: bootstrapCollectionSchema,
    favoriteViews: bootstrapCollectionSchema,
    designIterations: bootstrapCollectionSchema.optional(),
  })
  .strict();

const bootstrapCollectionSchemaJson = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
};
const pmCadProvenanceCollectionSchemaJson = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
    required: ["cadSource", "cadImportSource", "cadEditedAfterImport"],
    properties: {
      cadSource: {
        type: "string",
        enum: pmCadSourceValues,
      },
      cadImportSource: {
        type: "string",
        enum: pmCadImportSourceValues,
      },
      cadEditedAfterImport: {
        type: "boolean",
      },
      cadSourceLabel: {
        type: "string",
      },
      cadUpdatedAt: {
        type: ["string", "null"],
      },
    },
  },
};

export const bootstrapContractDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://contracts.meco.ai/platform/bootstrap-v1.schema.json",
  title: "MissionControlPlatformBootstrapContract",
  description:
    "Canonical payload schema for POST /api/bootstrap in meco-mission-control-platform.",
  type: "object",
  additionalProperties: false,
  required: [
    "seasons",
    "projects",
    "workstreams",
    "members",
    "subsystems",
    "disciplines",
    "mechanisms",
    "materials",
    "artifacts",
    "partDefinitions",
    "partInstances",
    "milestones",
    "milestoneRequirements",
    "reports",
    "reportFindings",
    "qaReports",
    "qaRequests",
    "testResults",
    "risks",
    "tasks",
    "taskDependencies",
    "taskBlockers",
    "workLogs",
    "meetings",
    "attendanceRecords",
    "manufacturingItems",
    "purchaseItems",
    "qaReviews",
    "escalations",
    "actions",
    "favoriteViews",
  ],
  properties: {
    seasons: bootstrapCollectionSchemaJson,
    projects: bootstrapCollectionSchemaJson,
    workstreams: bootstrapCollectionSchemaJson,
    members: bootstrapCollectionSchemaJson,
    subsystems: pmCadProvenanceCollectionSchemaJson,
    disciplines: bootstrapCollectionSchemaJson,
    mechanisms: pmCadProvenanceCollectionSchemaJson,
    materials: bootstrapCollectionSchemaJson,
    artifacts: bootstrapCollectionSchemaJson,
    partDefinitions: pmCadProvenanceCollectionSchemaJson,
    partInstances: pmCadProvenanceCollectionSchemaJson,
    milestones: bootstrapCollectionSchemaJson,
    milestoneRequirements: bootstrapCollectionSchemaJson,
    reports: bootstrapCollectionSchemaJson,
    reportFindings: bootstrapCollectionSchemaJson,
    qaReports: bootstrapCollectionSchemaJson,
    qaRequests: bootstrapCollectionSchemaJson,
    testResults: bootstrapCollectionSchemaJson,
    risks: bootstrapCollectionSchemaJson,
    tasks: bootstrapCollectionSchemaJson,
    taskDependencies: bootstrapCollectionSchemaJson,
    taskBlockers: bootstrapCollectionSchemaJson,
    workLogs: bootstrapCollectionSchemaJson,
    meetings: bootstrapCollectionSchemaJson,
    attendanceRecords: bootstrapCollectionSchemaJson,
    manufacturingItems: bootstrapCollectionSchemaJson,
    purchaseItems: bootstrapCollectionSchemaJson,
    qaReviews: bootstrapCollectionSchemaJson,
    escalations: bootstrapCollectionSchemaJson,
    actions: bootstrapCollectionSchemaJson,
    favoriteViews: bootstrapCollectionSchemaJson,
    designIterations: bootstrapCollectionSchemaJson,
  },
  $comment:
    "meco-mission-control-platform v1 bootstrap contract. Bump MAJOR on breaking shape changes.",
  x_contract: {
    contractName: BOOTSTRAP_CONTRACT_NAME,
    contractVersion: BOOTSTRAP_CONTRACT_VERSION,
    resource: "/api/bootstrap",
    migrationPolicy: "Breaking shape changes require a MAJOR version bump and coordinated web/mobile updates.",
  },
} as const;

export function toBootstrapContractDocument() {
  return bootstrapContractDocument;
}
