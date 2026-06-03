import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot } from "../src/data/store";
import { setOnshapeCadClientFactoryForTests } from "../src/onshape/onshapeClientFactory";
import type { CadImportOnshapeClient } from "../src/onshape/onshapeTypes";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111";

function createAuditFakeClient(options: { failBom?: Error } = {}): CadImportOnshapeClient {
  let callsUsed = 0;
  return {
    getCallsUsed: () => callsUsed,
    async fetchDocumentMetadata() {
      callsUsed += 1;
      return {
        documentName: "2026 Robot CAD",
        elementName: "Master Assembly",
        raw: { metadata: true },
      };
    },
    async fetchAssemblyBom() {
      callsUsed += 1;
      if (options.failBom) {
        throw options.failBom;
      }
      return {
        assemblyNodes: [
          {
            sourceId: "asm-root",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            instanceId: "root",
            instancePath: "/root",
            name: "Robot master",
            inferredType: "master_assembly",
          },
        ],
        partDefinitions: [
          {
            sourceId: "part-plate-default",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            partId: "plate",
            name: "Belly pan",
            partNumber: "DRV-100",
            configuration: "default",
            customProperties: { manufacturingMethod: "cnc" },
          },
        ],
        partInstances: [
          {
            sourceId: "inst-plate-1",
            partDefinitionSourceId: "part-plate-default",
            parentAssemblySourceId: "asm-root",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            instanceId: "plate-1",
            partId: "plate",
            instancePath: "/root/plate-1",
            quantity: 1,
            configuration: "default",
          },
        ],
        raw: { bom: true },
      };
    },
  };
}

test("Onshape import success records a scoped audit action in bootstrap activity", async () => {
  setOnshapeCadClientFactoryForTests(() => createAuditFakeClient());

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        payload: {
          url: versionUrl,
          label: "Robot version",
          projectId: "project-robot-2026",
          seasonId: "default-season",
          subsystemId: "drive",
          createdBy: "ava",
        },
      });
      assert.equal(createResponse.statusCode, 201);
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const importResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "ava" },
      });
      assert.equal(importResponse.statusCode, 201);
      const result = importResponse.json().result as { syncJobId: string };

      const actions = getSnapshot().actions ?? [];
      const auditAction = actions.find((action) => action.entityId === result.syncJobId);
      assert.ok(auditAction);
      assert.equal(auditAction.entityType, "onshape_sync_job");
      assert.equal(auditAction.operation, "update");
      assert.equal(auditAction.actorMemberId, "ava");
      assert.equal(auditAction.projectId, "project-robot-2026");
      assert.equal(auditAction.subsystemId, "drive");
      assert.deepEqual(
        ["actor", "createdObjectCount", "deprecatedObjectCount", "sourceReference", "status", "updatedObjectCount", "warningCount"],
        auditAction.changedFields,
      );
      assert.deepEqual(auditAction.detailsJson?.sourceReference, {
        documentId: "0123456789abcdef01234567",
        workspaceId: undefined,
        versionId: "222222222222222222222222",
        microversionId: undefined,
        elementId: "111111111111111111111111",
        referenceType: "version",
        originalUrl: versionUrl,
      });
      assert.deepEqual(auditAction.detailsJson?.objectCounts, {
        assemblyNodes: 1,
        partDefinitions: 1,
        partInstances: 1,
        created: 3,
        updated: 0,
        deprecated: 0,
      });
      assert.equal(auditAction.detailsJson?.status, "completed");
      assert.equal(auditAction.detailsJson?.actor, "ava");
      assert.equal(typeof auditAction.detailsJson?.warningCount, "number");
      assert.ok((auditAction.detailsJson.warningCount as number) > 0);

      resetLimits();

      const bootstrapResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?projectId=project-robot-2026",
      });
      assert.equal(bootstrapResponse.statusCode, 200);
      assert.ok(
        (bootstrapResponse.json().actions as Array<{ entityId: string }>).some(
          (action) => action.entityId === result.syncJobId,
        ),
      );
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});

test("Onshape import failure records warning and failure-status audit fields", async () => {
  setOnshapeCadClientFactoryForTests(() =>
    createAuditFakeClient({ failBom: new Error("bom unavailable") }));

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        payload: {
          url: versionUrl,
          label: "Robot version",
          projectId: "project-robot-2026",
          seasonId: "default-season",
          createdBy: "ava",
        },
      });
      assert.equal(createResponse.statusCode, 201);
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const importResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "ava" },
      });
      assert.equal(importResponse.statusCode, 502);
      const result = importResponse.json().result as { syncJobId: string };

      const auditAction = (getSnapshot().actions ?? []).find((action) => action.entityId === result.syncJobId);
      assert.ok(auditAction);
      assert.equal(auditAction.entityType, "onshape_sync_job");
      assert.equal(auditAction.actorMemberId, "ava");
      assert.ok(auditAction.changedFields.includes("failureStatus"));
      assert.ok(auditAction.changedFields.includes("warningCount"));
      assert.ok(auditAction.changedFields.includes("sourceReference"));
      assert.equal(auditAction.detailsJson?.status, "failed");
      assert.equal(auditAction.detailsJson?.failureStatus, "bom unavailable");
      assert.deepEqual(auditAction.detailsJson?.objectCounts, {
        assemblyNodes: 0,
        partDefinitions: 0,
        partInstances: 0,
        created: 0,
        updated: 0,
        deprecated: 0,
      });
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});
