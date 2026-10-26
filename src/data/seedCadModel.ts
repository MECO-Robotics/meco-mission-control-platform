import { createHash } from "node:crypto";
import cadSource from "./mainAssemblyCadSeed.json";
import type { Mechanism, PartDefinition, PartInstance, Subsystem } from "../domain/types";

const subsystemNames = ["Shooter", "Conveyer", "Intake", "Chassis"] as const;
type RobotSubsystem = typeof subsystemNames[number];
const slug = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cadSeedId = (kind: string, sourceId: string) => `${kind}-${createHash("sha256").update(sourceId).digest("hex").slice(0, 16)}`;

export function buildCadSeed() {
  const nodeBySourceId = new Map(cadSource.assemblyNodes.map((node) => [node.sourceId, node]));
  const subsystemForAssembly = (sourceId: string): RobotSubsystem => {
    let node = nodeBySourceId.get(sourceId);
    while (node) {
      if (!node.parentSourceId) return "Chassis";
      const parent = nodeBySourceId.get(node.parentSourceId);
      if (parent?.parentSourceId === null) {
        if (/shooter/i.test(node.name)) return "Shooter";
        if (/convey[eo]r|hopper/i.test(node.name)) return "Conveyer";
        if (/intake|detailed assembly/i.test(node.name)) return "Intake";
        return "Chassis";
      }
      node = parent;
    }
    return "Chassis";
  };
  const mechanismIdByAssembly = new Map(cadSource.assemblyNodes.map((node) => [node.sourceId, cadSeedId("cad-mechanism", node.sourceId)]));
  const subsystemId = (name: RobotSubsystem) => `step-subsystem-${slug(name)}`;
  const subsystems: Subsystem[] = subsystemNames.map((name) => ({
    id: subsystemId(name), projectId: "project-robot-2026", name,
    description: `Robot subsystem mapped from MAIN ASSEMBLY.step. ${cadSource.assemblyNodes.filter((node) => subsystemForAssembly(node.sourceId) === name).length} assembly nodes and their installed part occurrences are grouped by the top-level assembly path. Installed CAD components do not represent stock quantity.`,
    isCore: false, parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [], iteration: 1, isArchived: false,
  }));
  const mechanisms: Mechanism[] = cadSource.assemblyNodes.map((node) => {
    const subsystem = subsystemForAssembly(node.sourceId);
    const rootMapping = node.parentSourceId === null ? " The root-level robot assembly is grouped under Chassis to keep all model records within the four requested subsystems; this grouping does not assert physical mounting." : "";
    return {
      id: mechanismIdByAssembly.get(node.sourceId)!, subsystemId: subsystemId(subsystem), name: node.name,
      description: `Assembly node from MAIN ASSEMBLY.step at ${node.instancePath} (${node.inferredType}).${rootMapping}`,
      iteration: 1, isArchived: false, cadSource: "step", cadImportSource: "STEP_UPLOAD",
      cadEditedAfterImport: false, cadSourceLabel: "MAIN ASSEMBLY.step",
    };
  });
  const partDefinitionIdBySource = new Map(cadSource.partDefinitions.map((part) => [part.sourceId, cadSeedId("cad-part", part.sourceId)]));
  const partDefinitions: PartDefinition[] = cadSource.partDefinitions.map((part) => ({
    id: partDefinitionIdBySource.get(part.sourceId)!, seasonId: "season-2026-meco", activeSeasonIds: ["season-2026-meco"],
    name: part.name, partNumber: part.partNumber ?? "", vendorPartNumbers: {}, revision: "", iteration: 1, isArchived: false,
    isHardware: /bolt|screw|nut|washer|rivet|fastener/i.test(part.name), type: part.material ?? "CAD component",
    defaultAcquisitionMethod: "manufacture", materialId: null,
    description: `Part definition from MAIN ASSEMBLY.step${part.material ? `; CAD material label: ${part.material}` : "; material and part number are not stated"}. Model geometry does not establish a stock quantity.`,
    cadSource: "step", cadImportSource: "STEP_UPLOAD", cadEditedAfterImport: false, cadSourceLabel: "MAIN ASSEMBLY.step",
  }));
  const partInstances: PartInstance[] = cadSource.partInstances.map((instance) => {
    const partDefinitionId = partDefinitionIdBySource.get(instance.partDefinitionSourceId);
    const mechanismId = mechanismIdByAssembly.get(instance.parentAssemblySourceId);
    if (!partDefinitionId || !mechanismId) throw new Error(`MAIN ASSEMBLY.step seed link is unresolved for ${instance.sourceId}`);
    const subsystem = subsystemId(subsystemForAssembly(instance.parentAssemblySourceId));
    return {
      id: cadSeedId("cad-instance", instance.sourceId), partDefinitionId,
      intendedSubsystemId: subsystem, intendedMechanismId: mechanismId,
      location: { kind: "installed", subsystemId: subsystem, mechanismId },
      cadSource: "step", cadImportSource: "STEP_UPLOAD", cadEditedAfterImport: false, cadSourceLabel: `${cadSource.sourceFile} — ${instance.instancePath}`,
    };
  });
  return { subsystems, mechanisms, partDefinitions, partInstances };
}
