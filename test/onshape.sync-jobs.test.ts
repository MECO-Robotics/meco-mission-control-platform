import assert from "node:assert/strict";
import { test } from "node:test";

import { setOnshapeCadClientFactoryForTests } from "../src/onshape/onshapeClientFactory";
import type { CadImportOnshapeClient } from "../src/onshape/onshapeTypes";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111";

function createSyncJobFakeClient(options: { failBom?: Error } = {}): CadImportOnshapeClient {
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

test("Onshape manual syncs create queryable sync jobs and warning issues", async () => {
  setOnshapeCadClientFactoryForTests(() => createSyncJobFakeClient());

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        payload: { url: versionUrl, label: "Robot version" },
      });
      assert.equal(createResponse.statusCode, 201);
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const shallowResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "shallow", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(shallowResponse.statusCode, 201);
      const shallowSyncJobId = shallowResponse.json().result.syncJobId as string;

      resetLimits();

      const bomResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom" },
      });
      assert.equal(bomResponse.statusCode, 201);
      const bomRunId = bomResponse.json().result.importRunId as string;
      const bomSyncJobId = bomResponse.json().result.syncJobId as string;

      resetLimits();

      const syncJobsResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/sync-jobs?documentRefId=${refId}&status=completed`,
      });
      assert.equal(syncJobsResponse.statusCode, 200);
      const syncJobs = syncJobsResponse.json() as {
        items: Array<{
          id: string;
          importRunId: string;
          actor: string | null;
          completedAt: string | null;
          sourceReferenceJson: { documentId?: string; referenceType?: string };
          summaryJson: { snapshotId?: string; callsUsed?: number };
        }>;
      };
      assert.equal(syncJobs.items.length, 2);
      const shallowJob = syncJobs.items.find((item) => item.id === shallowSyncJobId);
      assert.equal(shallowJob?.actor, "cad.lead@mecorobotics.org");
      assert.equal(shallowJob?.sourceReferenceJson.documentId, "0123456789abcdef01234567");
      assert.equal(shallowJob?.sourceReferenceJson.referenceType, "version");
      assert.equal(typeof shallowJob?.completedAt, "string");
      const bomJob = syncJobs.items.find((item) => item.id === bomSyncJobId);
      assert.equal(bomJob?.importRunId, bomRunId);
      assert.equal(typeof bomJob?.summaryJson.snapshotId, "string");
      assert.equal(bomJob?.summaryJson.callsUsed, 2);

      resetLimits();

      const detailResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/sync-jobs/${bomSyncJobId}`,
      });
      assert.equal(detailResponse.statusCode, 200);
      assert.ok(detailResponse.json().issues.some((item: { code: string }) => item.code === "part_material_missing"));

      resetLimits();

      const overviewResponse = await app.inject({ method: "GET", url: "/api/onshape/overview" });
      assert.equal(overviewResponse.statusCode, 200);
      assert.equal(overviewResponse.json().syncJobs.length, 2);
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});

test("Onshape failed manual sync records a failed job and keeps the previous snapshot", async () => {
  let failBom = false;
  setOnshapeCadClientFactoryForTests(() =>
    createSyncJobFakeClient({ failBom: failBom ? new Error("bom unavailable") : undefined }));

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        payload: { url: versionUrl, label: "Robot version" },
      });
      assert.equal(createResponse.statusCode, 201);
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const successResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(successResponse.statusCode, 201);
      const successfulSnapshotId = successResponse.json().result.snapshotId as string;

      resetLimits();
      failBom = true;

      const failedResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom", requestedBy: "cad.lead@mecorobotics.org" },
      });
      assert.equal(failedResponse.statusCode, 502);
      assert.equal(failedResponse.json().result.status, "failed");
      assert.equal(failedResponse.json().result.snapshotId, undefined);
      const failedSyncJobId = failedResponse.json().result.syncJobId as string;

      resetLimits();

      const snapshotsResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/snapshots?documentRefId=${refId}`,
      });
      assert.equal(snapshotsResponse.statusCode, 200);
      assert.deepEqual(
        snapshotsResponse.json().items.map((item: { id: string }) => item.id),
        [successfulSnapshotId],
      );

      resetLimits();

      const failedJobResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/sync-jobs/${failedSyncJobId}`,
      });
      assert.equal(failedJobResponse.statusCode, 200);
      assert.equal(failedJobResponse.json().item.status, "failed");
      assert.equal(failedJobResponse.json().item.actor, "cad.lead@mecorobotics.org");
      assert.equal(failedJobResponse.json().item.errorMessage, "bom unavailable");
      assert.equal(failedJobResponse.json().snapshots.length, 0);

      resetLimits();

      const issuesResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/sync-jobs/${failedSyncJobId}/issues?severity=error`,
      });
      assert.equal(issuesResponse.statusCode, 200);
      assert.deepEqual(
        issuesResponse.json().items.map((item: { code: string; message: string }) => [item.code, item.message]),
        [["onshape_sync_failed", "bom unavailable"]],
      );
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});
