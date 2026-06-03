import assert from "node:assert/strict";

import { createOnshapeRuntimeStore, type OnshapeRuntimeStore } from "../../src/onshape/cadStore";
import { parseOnshapeUrl } from "../../src/onshape/onshapeUrlParser";
import type {
  CadImportOnshapeClient,
  OnshapeAssemblyBomResponse,
  OnshapeDocumentMetadataResponse,
  OnshapeReference,
} from "../../src/onshape/onshapeTypes";

export const documentId = "0123456789abcdef01234567";
export const versionId = "222222222222222222222222";
export const microversionId = "333333333333333333333333";
export const elementId = "111111111111111111111111";
export const versionUrl = `https://cad.onshape.com/documents/${documentId}/v/${versionId}/e/${elementId}?renderMode=0`;

export function createContractStore() {
  return createOnshapeRuntimeStore();
}

export function createLinkedRef(store: OnshapeRuntimeStore, url = versionUrl) {
  const parsed = parseOnshapeUrl(url);
  assert.equal(parsed.ok, true);
  return store.createDocumentRef({
    label: "Robot master assembly",
    originalUrl: url,
    parsed,
    createdBy: "test-user",
  });
}

export function parseReference(url: string): OnshapeReference {
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

export function createFakeClient(bom: OnshapeAssemblyBomResponse): CadImportOnshapeClient {
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

export function normalizedBom(names = {
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
