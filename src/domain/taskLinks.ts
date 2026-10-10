import type { SnapshotView } from "./types";
import { partInstanceMechanismId, partInstanceSubsystemId } from "./partInstanceLocation";

export function validateTaskPeople(snapshot: SnapshotView, input: {
  ownerId?: string | null;
  mentorId?: string | null;
  assigneeIds?: readonly string[];
}) {
  const contributorIds = [...new Set([
    input.ownerId,
    ...(input.assigneeIds ?? []),
    input.mentorId,
  ].filter((id): id is string => Boolean(id)))];
  if (contributorIds.length === 0) {
    return "Each task must be assigned to at least one student, lead, or mentor.";
  }

  const membersById = new Map(snapshot.members.map((member) => [member.id, member]));
  for (const contributorId of contributorIds) {
    const contributor = membersById.get(contributorId);
    if (!contributor) {
      return "One or more assigned people do not exist.";
    }

    if (contributor.role !== "student" && contributor.role !== "lead" && contributor.role !== "mentor") {
      return "Tasks can only be assigned to students, leads, or mentors.";
    }
  }

  if (input.ownerId) {
    const owner = membersById.get(input.ownerId);
    if (owner?.role !== "student" && owner?.role !== "lead") {
      return "Task owner must be a student or lead.";
    }
  }

  if (input.mentorId && membersById.get(input.mentorId)?.role !== "mentor") {
    return "Task mentor must be a mentor.";
  }
  return null;
}

export function validateTaskLinks(snapshot: SnapshotView, input: {
  projectId: string;
  workTypeId: string;
  responsibleGroupId?: string | null;
  ownerId?: string | null;
  mentorId?: string | null;
  scheduleRefs?: readonly { kind: "meeting" | "event" | "milestone"; id: string }[];
  manufacturingDetails?: import("./types").ReadonlyData<import("./types").Task["manufacturingDetails"]>;
  workstreamIds?: readonly string[];
  subsystemIds: readonly string[];
  mechanismIds?: readonly string[];
  partInstanceIds?: readonly string[];
  assigneeIds?: readonly string[];
  allowArchivedResponsibleGroup?: boolean;
}) {
  const project = snapshot.projects.find((record) => record.id === input.projectId);
  if (!project) {
    return "The selected project does not exist.";
  }

  const workstreamIds = input.workstreamIds ?? [];
  for (const workstreamId of workstreamIds) {
    const workstream = snapshot.workstreams.find((record) => record.id === workstreamId);
    if (!workstream) {
      return "The selected workstream does not exist.";
    }

    if (workstream.projectId !== project.id) {
      return "The selected workstream does not belong to the selected project.";
    }
  }

  const subsystemIds = input.subsystemIds ?? [];
  if (subsystemIds.length === 0) {
    return "Select at least one subsystem, mechanism, or part instance target.";
  }
  for (const subsystemId of subsystemIds) {
    const subsystem = snapshot.subsystems.find((record) => record.id === subsystemId);
    if (!subsystem) {
      return "The selected subsystem does not exist.";
    }
    if (subsystem.projectId !== project.id) {
      return "The selected subsystem does not belong to the selected project.";
    }
  }

  const workType = snapshot.workTypes.find((candidate) => candidate.id === input.workTypeId);
  if (!workType || workType.projectType !== project.projectType || !workType.isActive) {
    return "The selected work type does not belong to the selected project.";
  }
  if (input.responsibleGroupId) {
    const group = snapshot.responsibleGroups.find((candidate) => candidate.id === input.responsibleGroupId);
    const groupProjects = group?.projectIds.map((projectId) => snapshot.projects.find((candidate) => candidate.id === projectId));
    if (!group || (group.isArchived && !input.allowArchivedResponsibleGroup) || group.seasonId !== project.seasonId || (group.projectIds.length > 0 && !group.projectIds.includes(project.id)) || groupProjects?.some((groupProject) => !groupProject || groupProject.seasonId !== group.seasonId)) return "The selected responsible group does not belong to the selected season and project.";
  }
  for (const ref of input.scheduleRefs ?? []) {
    const collection = ref.kind === "meeting" ? snapshot.meetings : ref.kind === "event" ? snapshot.events : snapshot.milestones;
    if (!collection.some((record) => record.id === ref.id)) return `The selected schedule ${ref.kind} does not exist.`;
  }
  if (input.manufacturingDetails) {
    const details = input.manufacturingDetails;
    if (project.projectType !== "robot" || workType.code !== "manufacturing") return "ManufacturingDetails require a Robot Manufacturing work type.";
    if (!snapshot.manufacturingProcesses.some((process) => process.id === details.processId && process.isActive)) return "The selected manufacturing process does not exist.";
    if (details.part.kind === "part-definition" && !snapshot.partDefinitions.some((record) => details.part.kind === "part-definition" && record.id === details.part.partDefinitionId)) return "The selected manufactured part does not exist.";
    if (details.material.kind === "inventory-material" && !snapshot.materials.some((record) => details.material.kind === "inventory-material" && record.id === details.material.materialId)) return "The selected manufacturing material does not exist.";
    if (details.fileArtifactIds.some((artifactId) => !snapshot.artifacts.find((record) => record.id === artifactId))) return "One or more manufacturing files do not exist.";
  }

  const mechanismIds = input.mechanismIds ?? [];
  for (const mechanismId of mechanismIds) {
    const mechanism = snapshot.mechanisms.find((record) => record.id === mechanismId);
    if (!mechanism) {
      return "The selected mechanism does not exist.";
    }

    if (!subsystemIds.includes(mechanism.subsystemId)) {
      return "One or more selected mechanisms do not belong to a selected subsystem.";
    }
  }

  const partInstanceIds = input.partInstanceIds ?? [];
  for (const partInstanceId of partInstanceIds) {
    const partInstance = snapshot.partInstances.find((record) => record.id === partInstanceId);
    if (!partInstance) {
      return "The selected part instance does not exist.";
    }

    if (!subsystemIds.includes(partInstanceSubsystemId(partInstance) ?? "")) {
      return "One or more selected part instances do not belong to a selected subsystem.";
    }

    const mechanismId = partInstanceMechanismId(partInstance);
    if (!mechanismId) {
      return "The selected part instance must be linked to a mechanism.";
    }

    if (!mechanismIds.includes(mechanismId)) {
      return "One or more selected part instances do not belong to a selected mechanism.";
    }
  }


  return validateTaskPeople(snapshot, input);
}
