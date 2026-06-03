import assert from "node:assert/strict";
import { test } from "node:test";

import { runCadImport } from "../src/onshape/cadImporter";
import { createOnshapeRuntimeStore, type OnshapeRuntimeStore } from "../src/onshape/cadStore";
import { normalizeOnshapeBom } from "../src/onshape/bom/normalizer";
import { parseOnshapeUrl } from "../src/onshape/onshapeUrlParser";
import type {
  CadImportOnshapeClient,
  OnshapeAssemblyBomResponse,
  OnshapeDocumentMetadataResponse,
  OnshapeReference,
} from "../src/onshape/onshapeTypes";

const documentId = "0123456789abcdef01234567";
const versionId = "222222222222222222222222";
const microversionId = "333333333333333333333333";
const elementId = "111111111111111111111111";
const versionUrl = `https://cad.onshape.com/documents/${documentId}/v/${versionId}/e/${elementId}?renderMode=0`;

function createLinkedRef(store: OnshapeRuntimeStore, url = versionUrl) {
  const parsed = parseOnshapeUrl(url);
  assert.equal(parsed.ok, true);
  return store.createDocumentRef({
    label: "Robot master assembly",
    originalUrl: url,
    parsed,
    createdBy: "test-user",
  });
}

function parseReference(url: string): OnshapeReference {
  const parsed = parseOnshapeUrl(url);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.documentId);
  return {
    documentId: parsed.documentId,
    workspaceId: parsed.workspaceId,
    versionId: parsed.versionId,
    microversionId: parsed.microversionId,
    elementId: parsed.elementId,
    originalUrl: parsed.originalUrl,
    referenceType: parsed.referenceType,
  };
}

function createFakeClient(bom: OnshapeAssemblyBomResponse): CadImportOnshapeClient {
  let callsUsed = 0;
  const metadata: OnshapeDocumentMetadataResponse = {
    documentName: "2026 Robot",
    elementName: "Master Assembly",
    raw: { source: "contract-test" },
  };
  return {
    getCallsUsed() {
      return callsUsed;
    },
    async fetchDocumentMetadata() {
      callsUsed += 1;
      return metadata;
    },
    async fetchAssemblyBom() {
      callsUsed += 1;
      return bom;
    },
  };
}

function normalizedBom(names = {
  subsystem: "Drive Subsystem",
  mechanism: "Intake Mechanism",
  part: "Drive rail",
  instancePath: "/root/drive/rail-left",
}): OnshapeAssemblyBomResponse {
  return {
    assemblyNodes: [
      {
        sourceId: "assembly:root",
        documentId,
        elementId,
        instanceId: "root",
        instancePath: "/root",
        name: "2026 Robot",
        inferredType: "master_assembly",
      },
      {
        sourceId: "assembly:drive",
        parentSourceId: "assembly:root",
        documentId,
        elementId: "drive-element",
        instanceId: "drive",
        instancePath: "/root/drive",
        name: names.subsystem,
        inferredType: "subsystem_candidate",
      },
      {
        sourceId: "assembly:intake",
        parentSourceId: "assembly:root",
        documentId,
        elementId: "intake-element",
        instanceId: "intake",
        instancePath: "/root/intake",
        name: names.mechanism,
        inferredType: "mechanism_candidate",
      },
    ],
    partDefinitions: [
      {
        sourceId: "part:drive-rail-default",
        documentId,
        elementId: "drive-element",
        partId: "drive-rail",
        versionId,
        name: names.part,
        partNumber: "DRV-001",
        material: "6061 aluminum",
        configuration: "default",
        missionControlExternalKey: "onshape:part:drive-rail:default",
      },
    ],
    partInstances: [
      {
        sourceId: "instance:drive-rail-left",
        partDefinitionSourceId: "part:drive-rail-default",
        parentAssemblySourceId: "assembly:drive",
        documentId,
        elementId: "drive-element",
        instanceId: "drive-rail-left",
        partId: "drive-rail",
        instancePath: names.instancePath,
        quantity: 1,
        configuration: "default",
      },
    ],
    raw: { source: "contract-test" },
  };
}

test("accepts only document references with workspace, version, or microversion identity", () => {
  const workspace = parseOnshapeUrl(`https://cad.onshape.com/documents/${documentId}/w/workspace123/e/${elementId}`);
  assert.equal(workspace.ok, true);
  assert.equal(workspace.referenceType, "workspace");
  assert.equal(workspace.workspaceId, "workspace123");

  const version = parseOnshapeUrl(versionUrl);
  assert.equal(version.ok, true);
  assert.equal(version.referenceType, "version");
  assert.equal(version.versionId, versionId);

  const microversion = parseOnshapeUrl(`https://cad.onshape.com/documents/${documentId}/m/${microversionId}/e/${elementId}`);
  assert.equal(microversion.ok, true);
  assert.equal(microversion.referenceType, "microversion");
  assert.equal(microversion.microversionId, microversionId);

  assert.equal(parseOnshapeUrl(`https://cad.onshape.com/documents/${documentId}/e/${elementId}`).ok, false);
  assert.equal(parseOnshapeUrl(`https://example.com/documents/${documentId}/v/${versionId}/e/${elementId}`).ok, false);
});

test("persists normalized subsystem, mechanism, part definition, and part instance records", async () => {
  const store = createOnshapeRuntimeStore();
  const ref = createLinkedRef(store);
  const result = await runCadImport({
    store,
    documentRefId: ref.id,
    syncLevel: "bom",
    requestedBy: "test-user",
    client: createFakeClient(normalizedBom()),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.assemblyNodeCount, 3);
  assert.equal(result.partDefinitionCount, 1);
  assert.equal(result.partInstanceCount, 1);

  const subsystem = store.listAssemblyNodes(result.snapshotId).find((node) => node.sourceId === "assembly:drive");
  const mechanism = store.listAssemblyNodes(result.snapshotId).find((node) => node.sourceId === "assembly:intake");
  const part = store.listPartDefinitions(result.snapshotId)[0];
  const instance = store.listPartInstances(result.snapshotId)[0];

  assert.equal(subsystem?.inferredType, "subsystem_candidate");
  assert.equal(subsystem?.subsystemId, null);
  assert.equal(mechanism?.inferredType, "mechanism_candidate");
  assert.equal(mechanism?.mechanismId, null);
  assert.equal(part?.missionControlExternalKey, "onshape:part:drive-rail:default");
  assert.equal(instance?.cadPartDefinitionId, part?.id);
  assert.equal(instance?.parentAssemblyNodeId, subsystem?.id);
});

test("keeps record IDs stable across immutable-reference renames", async () => {
  const store = createOnshapeRuntimeStore();
  const ref = createLinkedRef(store);
  const first = await runCadImport({
    store,
    documentRefId: ref.id,
    syncLevel: "bom",
    requestedBy: "test-user",
    client: createFakeClient(normalizedBom()),
  });
  const initialSubsystem = store.listAssemblyNodes(first.snapshotId).find((node) => node.sourceId === "assembly:drive");
  const initialPart = store.listPartDefinitions(first.snapshotId)[0];
  const initialInstance = store.listPartInstances(first.snapshotId)[0];

  const second = await runCadImport({
    store,
    documentRefId: ref.id,
    syncLevel: "bom",
    requestedBy: "test-user",
    client: createFakeClient(
      normalizedBom({
        subsystem: "Drivetrain",
        mechanism: "Coral Intake",
        part: "Left drive rail",
        instancePath: "/root/drive/left-rail-renamed",
      }),
    ),
  });

  assert.equal(second.snapshotId, first.snapshotId);
  const renamedSubsystem = store.listAssemblyNodes(second.snapshotId).find((node) => node.sourceId === "assembly:drive");
  const renamedPart = store.listPartDefinitions(second.snapshotId)[0];
  const renamedInstance = store.listPartInstances(second.snapshotId)[0];

  assert.equal(renamedSubsystem?.id, initialSubsystem?.id);
  assert.equal(renamedSubsystem?.name, "Drivetrain");
  assert.equal(renamedPart?.id, initialPart?.id);
  assert.equal(renamedPart?.name, "Left drive rail");
  assert.equal(renamedInstance?.id, initialInstance?.id);
  assert.equal(renamedInstance?.instancePath, "/root/drive/left-rail-renamed");
});

test("does not delete or deprecate omitted records during immutable re-import", async () => {
  const store = createOnshapeRuntimeStore();
  const ref = createLinkedRef(store);
  const first = await runCadImport({
    store,
    documentRefId: ref.id,
    syncLevel: "bom",
    requestedBy: "test-user",
    client: createFakeClient(normalizedBom()),
  });

  await runCadImport({
    store,
    documentRefId: ref.id,
    syncLevel: "bom",
    requestedBy: "test-user",
    client: createFakeClient({
      ...normalizedBom(),
      partDefinitions: [],
      partInstances: [],
    }),
  });

  assert.equal(store.listPartDefinitions(first.snapshotId).length, 1);
  assert.equal(store.listPartInstances(first.snapshotId).length, 1);
});

test("rejects unsupported successful Onshape BOM structures", () => {
  assert.throws(
    () => normalizeOnshapeBom({ message: "unsupported payload" }, parseReference(versionUrl)),
    /BOM payload was not recognized/,
  );
});
