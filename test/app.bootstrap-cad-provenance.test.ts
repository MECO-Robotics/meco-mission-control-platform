import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

type ProvenanceRecord = {
  id: string;
  cadSource: "manual" | "step" | "onshape";
  cadImportSource: "MANUAL" | "STEP_UPLOAD" | "ONSHAPE_API" | "ONSHAPE_BOM_CSV" | "MANUAL_BOM_CSV";
  cadEditedAfterImport: boolean;
  cadSourceLabel?: string;
  cadUpdatedAt?: string | null;
};

test("bootstrap PM objects expose CAD provenance for manual, STEP, Onshape, and edited imports", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const onshapePartDefinitionResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        name: "Onshape Imported Bracket",
        partNumber: "ONSHAPE-096",
        revision: "A",
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: null,
        description: "Part definition created from Onshape API provenance.",
        cadImportSource: "ONSHAPE_API",
      },
    });
    assert.equal(onshapePartDefinitionResponse.statusCode, 201);
    const onshapePartDefinition = onshapePartDefinitionResponse.json().item as ProvenanceRecord;
    resetLimits();

    const initialBootstrap = await app.inject({
      method: "GET",
      url: "/api/bootstrap?projectId=project-robot-2026",
    });
    assert.equal(initialBootstrap.statusCode, 200);

    const initialBody = initialBootstrap.json() as {
      subsystems: ProvenanceRecord[];
      mechanisms: ProvenanceRecord[];
      partDefinitions: ProvenanceRecord[];
      partInstances: ProvenanceRecord[];
    };
    assert.equal(
      initialBody.subsystems.find((item) => item.id === "drive")?.cadImportSource,
      "MANUAL",
    );
    assert.equal(
      initialBody.mechanisms.find((item) => item.id === "swerve-module")?.cadImportSource,
      "MANUAL",
    );
    assert.deepEqual(
      {
        cadSource: initialBody.partDefinitions.find(
          (item) => item.id === onshapePartDefinition.id,
        )?.cadSource,
        cadImportSource: initialBody.partDefinitions.find(
          (item) => item.id === onshapePartDefinition.id,
        )?.cadImportSource,
      },
      {
        cadSource: "onshape",
        cadImportSource: "ONSHAPE_API",
      },
    );

    resetLimits();
    const subsystemResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        projectId: "project-robot-2026",
        name: "STEP Imported Subsystem",
        description: "Subsystem created from an imported STEP assembly.",
        parentSubsystemId: null,
        responsibleEngineerId: null,
        mentorIds: [],
        cadImportSource: "STEP_UPLOAD",
      },
    });
    assert.equal(subsystemResponse.statusCode, 201);
    const subsystem = subsystemResponse.json().item as ProvenanceRecord;
    assert.equal(subsystem.cadSource, "step");
    assert.equal(subsystem.cadImportSource, "STEP_UPLOAD");
    assert.equal(subsystem.cadEditedAfterImport, false);

    resetLimits();
    const mechanismResponse = await app.inject({
      method: "POST",
      url: "/api/mechanisms",
      payload: {
        subsystemId: subsystem.id,
        name: "Onshape Imported Mechanism",
        description: "Mechanism created from an Onshape hierarchy review.",
        cadImportSource: "ONSHAPE_API",
      },
    });
    assert.equal(mechanismResponse.statusCode, 201);
    const mechanism = mechanismResponse.json().item as ProvenanceRecord;

    resetLimits();
    const partDefinitionResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        name: "STEP Imported Plate",
        partNumber: "STP-096",
        revision: "A",
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: null,
        description: "Part definition created from STEP provenance.",
        cadImportSource: "STEP_UPLOAD",
      },
    });
    assert.equal(partDefinitionResponse.statusCode, 201);
    const partDefinition = partDefinitionResponse.json().item as ProvenanceRecord;

    resetLimits();
    const onshapeBomPartDefinitionResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        name: "Onshape BOM Imported Plate",
        partNumber: "BOM-096",
        revision: "A",
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: null,
        description: "Part definition created from Onshape BOM source text.",
        cadImportSource: "ONSHAPE_BOM_CSV",
      },
    });
    assert.equal(onshapeBomPartDefinitionResponse.statusCode, 201);
    assert.deepEqual(
      {
        cadSource: onshapeBomPartDefinitionResponse.json().item.cadSource,
        cadImportSource: onshapeBomPartDefinitionResponse.json().item.cadImportSource,
      },
      {
        cadSource: "onshape",
        cadImportSource: "ONSHAPE_BOM_CSV",
      },
    );

    resetLimits();
    const partInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        intendedSubsystemId: subsystem.id,
        intendedMechanismId: mechanism.id,
        partDefinitionId: partDefinition.id,
        location: { kind: "unlocated" },
        cadImportSource: "STEP_UPLOAD",
      },
    });
    assert.equal(partInstanceResponse.statusCode, 201);
    const stepPartInstance = partInstanceResponse.json().item as ProvenanceRecord;

    resetLimits();
    const mergedPartInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        intendedSubsystemId: subsystem.id,
        intendedMechanismId: mechanism.id,
        partDefinitionId: partDefinition.id,
        location: { kind: "unlocated" },
        cadImportSource: "ONSHAPE_API",
      },
    });
    assert.equal(mergedPartInstanceResponse.statusCode, 201);
    const partInstance = mergedPartInstanceResponse.json().item as ProvenanceRecord;
    assert.notEqual(partInstance.id, stepPartInstance.id);
    assert.equal(partInstance.cadSource, "onshape");
    assert.equal(partInstance.cadImportSource, "ONSHAPE_API");

    resetLimits();
    const editedPartInstanceResponse = await app.inject({
      method: "PATCH",
      url: `/api/part-instances/${partInstance.id}`,
      payload: {
        cadSource: partInstance.cadSource,
        cadImportSource: partInstance.cadImportSource,
      },
    });
    assert.equal(editedPartInstanceResponse.statusCode, 200);
    assert.equal(editedPartInstanceResponse.json().item.cadEditedAfterImport, true);

    resetLimits();
    const finalBootstrap = await app.inject({
      method: "GET",
      url: "/api/bootstrap?projectId=project-robot-2026",
    });
    assert.equal(finalBootstrap.statusCode, 200);
    const finalBody = finalBootstrap.json() as {
      subsystems: ProvenanceRecord[];
      mechanisms: ProvenanceRecord[];
      partDefinitions: ProvenanceRecord[];
      partInstances: ProvenanceRecord[];
    };
    assert.ok(finalBody.partInstances.some((item) => item.id === stepPartInstance.id));
    assert.ok(finalBody.partInstances.some((item) => item.id === partInstance.id));

    assert.deepEqual(
      {
        subsystem: finalBody.subsystems.find((item) => item.id === subsystem.id),
        mechanism: finalBody.mechanisms.find((item) => item.id === mechanism.id),
        partDefinition: finalBody.partDefinitions.find((item) => item.id === partDefinition.id),
        partInstance: finalBody.partInstances.find((item) => item.id === partInstance.id),
      },
      {
        subsystem: {
          ...finalBody.subsystems.find((item) => item.id === subsystem.id),
          cadSource: "step",
          cadImportSource: "STEP_UPLOAD",
          cadEditedAfterImport: false,
        },
        mechanism: {
          ...finalBody.mechanisms.find((item) => item.id === mechanism.id),
          cadSource: "onshape",
          cadImportSource: "ONSHAPE_API",
          cadEditedAfterImport: false,
        },
        partDefinition: {
          ...finalBody.partDefinitions.find((item) => item.id === partDefinition.id),
          cadSource: "step",
          cadImportSource: "STEP_UPLOAD",
          cadEditedAfterImport: false,
        },
        partInstance: {
          ...finalBody.partInstances.find((item) => item.id === partInstance.id),
          cadSource: "onshape",
          cadImportSource: "ONSHAPE_API",
          cadEditedAfterImport: true,
        },
      },
    );

    resetLimits();
    const manualRoundTripResponse = await app.inject({
      method: "PATCH",
      url: `/api/subsystems/${subsystem.id}`,
      payload: {
        cadSource: "step",
        cadImportSource: "MANUAL",
      },
    });
    assert.equal(manualRoundTripResponse.statusCode, 200);
    assert.deepEqual(
      {
        cadSource: manualRoundTripResponse.json().item.cadSource,
        cadImportSource: manualRoundTripResponse.json().item.cadImportSource,
        cadEditedAfterImport: manualRoundTripResponse.json().item.cadEditedAfterImport,
        cadSourceLabel: manualRoundTripResponse.json().item.cadSourceLabel,
      },
      {
        cadSource: "manual",
        cadImportSource: "MANUAL",
        cadEditedAfterImport: false,
        cadSourceLabel: "Manual",
      },
    );
  });
});
