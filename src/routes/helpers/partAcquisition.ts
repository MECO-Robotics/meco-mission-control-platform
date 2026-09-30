import type { z } from "zod";
import {
  findProject, findSubsystem, getMembers, getSeasons,
  type PartAcquisitionPlan, type PartDefinitionInput,
} from "../../data/store";
import type { partDefinitionSchema } from "../routeSchemas";
import { validatePartDefinitionMaterialId, validateSubsystemPeople } from "./linkValidation";
import { uniqueIds } from "../../domain/ids";
import { normalizeTaskTargets } from "./taskTargets";

export function preparePartAcquisition(
  input: z.infer<typeof partDefinitionSchema>,
  actorMemberId: string | null,
): { error: string } | { definition: PartDefinitionInput; plan: PartAcquisitionPlan | null } {
  const { acquisition, ...fields } = input;
  const definition = { ...fields, materialId: fields.materialId ?? null };
  const materialError = validatePartDefinitionMaterialId(definition.materialId);
  if (materialError) {
    return { error: materialError };
  }
  if (!acquisition || acquisition.method === "stock") {
    return { definition, plan: null };
  }

  const subsystem = findSubsystem(acquisition.subsystemId);
  const project = subsystem && findProject(subsystem.projectId);
  if (!subsystem || subsystem.isArchived || !project) {
    return { error: "Select an active subsystem in an existing project." };
  }
  const seasonId = definition.seasonId ?? project.seasonId;
  const activeSeasonIds = uniqueIds([...(definition.activeSeasonIds ?? []), seasonId]);
  if (seasonId !== project.seasonId || activeSeasonIds.some((id) => !getSeasons().some((season) => season.id === id))) {
    return { error: "The part definition must belong to the subsystem project's season and reference existing seasons." };
  }
  if (definition.isArchived) {
    return { error: "Archived part definitions cannot start acquisition work." };
  }
  const owner = getMembers().find((member) => member.id === acquisition.ownerId);
  const mentor = getMembers().find((member) => member.id === acquisition.mentorId);
  if (!owner || owner.role === "external") {
    return { error: "Select an internal roster member as the acquisition owner." };
  }
  if (!mentor || (mentor.role !== "mentor" && mentor.role !== "admin")) {
    return { error: "Select a mentor or admin as the acquisition mentor." };
  }
  const peopleError = validateSubsystemPeople({
    projectId: project.id,
    responsibleEngineerId: owner.id,
    mentorIds: [mentor.id],
  });
  if (peopleError) {
    return { error: peopleError };
  }
  const targets = normalizeTaskTargets({ subsystemIds: [subsystem.id] });
  const task = {
    ...targets,
    projectId: project.id,
    title: `Acquire ${definition.name}`,
    summary: acquisition.method === "manufacture"
      ? `Manufacture ${definition.name} and move it through QA.`
      : `Purchase ${definition.name} and confirm it is ready for installation.`,
    workTypeId: acquisition.workTypeId,
    responsibleGroupId: null,
    requestedById: actorMemberId,
    scheduleRefs: [],
    manufacturingDetails: acquisition.method === "manufacture" ? {
      part: { kind: "part-definition" as const, partDefinitionId: "" },
      quantity: 1,
      processId: "cnc",
      fulfillmentSource: acquisition.method === "manufacture" ? acquisition.fulfillmentSource : "in-house",
      material: definition.materialId ? { kind: "inventory-material" as const, materialId: definition.materialId } : { kind: "specified-material" as const, name: definition.type },
      fileArtifactIds: [],
      tolerances: [],
      qaRequirements: [],
    } : null,
    ownerId: owner.id,
    assigneeIds: [],
    mentorId: mentor.id,
    targetMilestoneId: null,
    startDate: acquisition.dueDate,
    dueDate: acquisition.dueDate,
    priority: "medium" as const,
    status: "not-started" as const,
    estimatedHours: 0,
    requiresDocumentation: false,
  };
  return {
    definition: { ...definition, seasonId, activeSeasonIds },
    plan: { method: acquisition.method, requestedById: actorMemberId, task },
  };
}
