import {
  findArtifact,
  findMilestone,
  findMaterial,
  findMechanism,
  findPartDefinition,
  findPartInstance,
  findProject,
  findSubsystem,
  findWorkstream,
  getMilestones,
  getMembers,
  getQaReports,
  getReports,
  getRisks,
  getTasks,
  getTestResults,
  getSnapshot,
} from "../../data/store";
import { uniqueIds } from "../../domain/ids";
import { isActiveInSeason } from "../../domain/seasonMembership";
import { partInstanceMechanismId, partInstanceSubsystemId } from "../../domain/partInstanceLocation";
import type { PartInstance, PurchaseItem } from "../../domain/types";

function taskParticipantLinksError(taskId: string, participantIds: readonly string[]) {
  if (!getTasks().some((task) => task.id === taskId)) {
    return "The selected task does not exist.";
  }

  const memberIds = new Set(getMembers().map((member) => member.id));
  const missingParticipant = participantIds.find(
    (participantId) => !memberIds.has(participantId),
  );
  return missingParticipant ? "One or more selected participants do not exist." : null;
}

export function validateWorkLogLinks(input: {
  taskId: string;
  participantIds: readonly string[];
}) {
  return taskParticipantLinksError(input.taskId, input.participantIds);
}

function validateTargetReferences(targetRefs: readonly { kind: string; id: string }[] = []) {
  const snapshot = getSnapshot();
  const collections: Record<string, readonly { id: string }[]> = {
    project: snapshot.projects, workstream: snapshot.workstreams, "responsible-group": snapshot.responsibleGroups,
    task: snapshot.tasks, subsystem: snapshot.subsystems, mechanism: snapshot.mechanisms,
    "part-definition": snapshot.partDefinitions, "part-instance": snapshot.partInstances, material: snapshot.materials,
    vendor: snapshot.vendors, "manufacturing-details": snapshot.tasks.filter((task) => task.manufacturingDetails),
    "purchase-item": snapshot.purchaseItems, meeting: snapshot.meetings, event: snapshot.events,
    milestone: snapshot.milestones, "qa-request": snapshot.qaRequests ?? [], "test-result": snapshot.testResults,
    report: [...snapshot.qaReports.map(({ id }) => ({ id })), ...snapshot.testResults.map(({ id }) => ({ id }))],
    artifact: snapshot.artifacts, "qa-finding": snapshot.qaFindings, "test-finding": snapshot.testFindings,
    "task-dependency": snapshot.taskDependencies, risk: snapshot.risks, "design-iteration": snapshot.designIterations,
  };
  for (const target of targetRefs) {
    if (!collections[target.kind]?.some((record) => record.id === target.id)) {
      return `The selected ${target.kind} target does not exist.`;
    }
  }
  return null;
}

export function validateQaReportLinks(input: {
  targetRefs?: readonly { kind: string; id: string }[];
  taskId?: string;
  participantIds: readonly string[];
}) {
  const linkError = input.taskId
    ? taskParticipantLinksError(input.taskId, input.participantIds)
    : input.participantIds.some((id) => !getMembers().some((member) => member.id === id))
      ? "One or more selected participants do not exist."
      : null;
  if (linkError) {
    return linkError;
  }
  const targetError = validateTargetReferences(input.targetRefs);
  if (targetError) return targetError;

  return null;
}

export function validateQaRequestLinks(input: {
  projectId?: string;
  targetRefs?: readonly { kind: string; id: string }[];
  mentorId?: string | null;
  requestedById?: string | null;
}) {
  const targetError = validateTargetReferences(input.targetRefs);
  if (targetError) return targetError;
  const memberIds = new Set(getMembers().map((member) => member.id));
  if (input.mentorId && !memberIds.has(input.mentorId)) {
    return "The selected mentor does not exist.";
  }

  if (input.requestedById && !memberIds.has(input.requestedById)) {
    return "The selected requester does not exist.";
  }

  return null;
}

export function validateTestResultLinks(input: { projectId: string; targetRefs: readonly { kind: string; id: string }[] }) {
  const targetError = validateTargetReferences(input.targetRefs);
  if (targetError) return targetError;
  return getSnapshot().projects.some((project) => project.id === input.projectId) ? null : "The selected project does not exist.";
}

export function validateRiskLinks(input: {
  projectId: string;
  source: { kind: string; id?: string };
  relatedTargets: readonly { kind: string; id: string }[];
  mitigationTaskId?: string | null;
  ownerGroupId?: string | null;
}) {
  const snapshot = getSnapshot();
  if (!snapshot.projects.some((project) => project.id === input.projectId)) return "The selected project does not exist.";
  if (input.source.kind !== "manual") {
    const sourceExists = input.source.kind === "manufacturing-details"
      ? snapshot.tasks.some((task) => task.id === input.source.id && task.manufacturingDetails !== null)
      : input.source.kind === "report"
        ? getReports().some((report) => report.id === input.source.id)
        : input.source.kind === "task-dependency"
          ? snapshot.taskDependencies.some((record) => record.id === input.source.id)
          : input.source.kind === "qa-finding"
            ? snapshot.qaFindings.some((record) => record.id === input.source.id)
            : input.source.kind === "test-finding"
              ? snapshot.testFindings.some((record) => record.id === input.source.id)
              : input.source.kind === "qa-request"
                ? snapshot.qaRequests?.some((record) => record.id === input.source.id)
                : input.source.kind === "test-result"
                  ? snapshot.testResults.some((record) => record.id === input.source.id)
                  : input.source.kind === "event"
                    ? snapshot.events.some((record) => record.id === input.source.id)
                    : input.source.kind === "milestone"
                      ? snapshot.milestones.some((record) => record.id === input.source.id)
                      : input.source.kind === "part-instance"
                        ? snapshot.partInstances.some((record) => record.id === input.source.id)
                        : input.source.kind === "material"
                          ? snapshot.materials.some((record) => record.id === input.source.id)
                          : snapshot.tasks.some((record) => record.id === input.source.id);
    if (!sourceExists) return `The selected ${input.source.kind} source does not exist.`;
  }
  const collections: Record<string, readonly { id: string }[]> = {
    project: snapshot.projects, workstream: snapshot.workstreams, "responsible-group": snapshot.responsibleGroups,
    task: snapshot.tasks, subsystem: snapshot.subsystems, mechanism: snapshot.mechanisms,
    "part-definition": snapshot.partDefinitions, "part-instance": snapshot.partInstances, material: snapshot.materials,
    vendor: snapshot.vendors, "manufacturing-details": snapshot.tasks, "purchase-item": snapshot.purchaseItems,
    meeting: snapshot.meetings, event: snapshot.events, milestone: snapshot.milestones,
    "qa-request": snapshot.qaRequests ?? [], "test-result": snapshot.testResults, report: getReports(),
    artifact: snapshot.artifacts, "qa-finding": snapshot.qaFindings, "test-finding": snapshot.testFindings,
    "task-dependency": snapshot.taskDependencies, risk: snapshot.risks, "design-iteration": snapshot.designIterations,
  };
  for (const target of input.relatedTargets) {
    if (!collections[target.kind]?.some((record) => record.id === target.id)) return `The selected ${target.kind} target does not exist.`;
  }
  if (input.mitigationTaskId && !snapshot.tasks.some((task) => task.id === input.mitigationTaskId && task.projectId === input.projectId)) return "The selected mitigation task does not exist in this project.";
  if (input.ownerGroupId && !snapshot.responsibleGroups.some((group) => group.id === input.ownerGroupId)) return "The selected responsible group does not exist.";
  return null;
}

export function validateTaskPeople(input: {
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

  const membersById = new Map(getMembers().map((member) => [member.id, member]));
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

export function validateTaskLinks(input: {
  projectId: string;
  workTypeId: string;
  responsibleGroupId?: string | null;
  ownerId?: string | null;
  mentorId?: string | null;
  scheduleRefs?: readonly { kind: "meeting" | "event" | "milestone"; id: string }[];
  manufacturingDetails?: import("../../domain/types").ReadonlyData<import("../../domain/types").Task["manufacturingDetails"]>;
  workstreamIds?: readonly string[];
  subsystemIds: readonly string[];
  mechanismIds?: readonly string[];
  partInstanceIds?: readonly string[];
  assigneeIds?: readonly string[];
  allowArchivedResponsibleGroup?: boolean;
}) {
  const project = findProject(input.projectId);
  if (!project) {
    return "The selected project does not exist.";
  }

  const workstreamIds = input.workstreamIds ?? [];
  for (const workstreamId of workstreamIds) {
    const workstream = findWorkstream(workstreamId);
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
    const subsystem = findSubsystem(subsystemId);
    if (!subsystem) {
      return "The selected subsystem does not exist.";
    }
    if (subsystem.projectId !== project.id) {
      return "The selected subsystem does not belong to the selected project.";
    }
  }

  const workType = getSnapshot().workTypes.find((candidate) => candidate.id === input.workTypeId);
  if (!workType || workType.projectType !== project.projectType || !workType.isActive) {
    return "The selected work type does not belong to the selected project.";
  }
  if (input.responsibleGroupId) {
    const group = getSnapshot().responsibleGroups.find((candidate) => candidate.id === input.responsibleGroupId);
    const groupProjects = group?.projectIds.map((projectId) => getSnapshot().projects.find((candidate) => candidate.id === projectId));
    if (!group || (group.isArchived && !input.allowArchivedResponsibleGroup) || group.seasonId !== project.seasonId || (group.projectIds.length > 0 && !group.projectIds.includes(project.id)) || groupProjects?.some((groupProject) => !groupProject || groupProject.seasonId !== group.seasonId)) return "The selected responsible group does not belong to the selected season and project.";
  }
  for (const ref of input.scheduleRefs ?? []) {
    const collection = ref.kind === "meeting" ? getSnapshot().meetings : ref.kind === "event" ? getSnapshot().events : getMilestones();
    if (!collection.some((record) => record.id === ref.id)) return `The selected schedule ${ref.kind} does not exist.`;
  }
  if (input.manufacturingDetails) {
    const details = input.manufacturingDetails;
    if (project.projectType !== "robot" || workType.code !== "manufacturing") return "ManufacturingDetails require a Robot Manufacturing work type.";
    if (!getSnapshot().manufacturingProcesses.some((process) => process.id === details.processId && process.isActive)) return "The selected manufacturing process does not exist.";
    if (details.part.kind === "part-definition" && !findPartDefinition(details.part.partDefinitionId)) return "The selected manufactured part does not exist.";
    if (details.material.kind === "inventory-material" && !findMaterial(details.material.materialId)) return "The selected manufacturing material does not exist.";
    if (details.fileArtifactIds.some((artifactId) => !findArtifact(artifactId))) return "One or more manufacturing files do not exist.";
  }

  const mechanismIds = input.mechanismIds ?? [];
  for (const mechanismId of mechanismIds) {
    const mechanism = findMechanism(mechanismId);
    if (!mechanism) {
      return "The selected mechanism does not exist.";
    }

    if (!subsystemIds.includes(mechanism.subsystemId)) {
      return "One or more selected mechanisms do not belong to a selected subsystem.";
    }
  }

  const partInstanceIds = input.partInstanceIds ?? [];
  for (const partInstanceId of partInstanceIds) {
    const partInstance = findPartInstance(partInstanceId);
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

  for (const ref of input.scheduleRefs ?? []) {
    const records = ref.kind === "meeting" ? getSnapshot().meetings
      : ref.kind === "event" ? getSnapshot().events
        : getMilestones();
    if (!records.some((record) => record.id === ref.id)) {
      return `The selected ${ref.kind} does not exist.`;
    }
  }

  return validateTaskPeople(input);
}

export function validateArtifactLinks(input: {
  projectId: string;
  targetRefs?: readonly { kind: string; id: string }[];
}) {
  const project = findProject(input.projectId);
  if (!project) {
    return "The selected project does not exist.";
  }

  const snapshot = getSnapshot();
  const collections: Record<string, readonly { id: string }[]> = {
    project: snapshot.projects, workstream: snapshot.workstreams, "responsible-group": snapshot.responsibleGroups,
    task: snapshot.tasks, subsystem: snapshot.subsystems, mechanism: snapshot.mechanisms,
    "part-definition": snapshot.partDefinitions, "part-instance": snapshot.partInstances,
    material: snapshot.materials, vendor: snapshot.vendors, "manufacturing-details": snapshot.tasks,
    "purchase-item": snapshot.purchaseItems, meeting: snapshot.meetings, event: snapshot.events,
    milestone: snapshot.milestones, "qa-request": snapshot.qaRequests ?? [], "test-result": snapshot.testResults,
    artifact: snapshot.artifacts, "qa-finding": snapshot.qaFindings, "test-finding": snapshot.testFindings,
    "task-dependency": snapshot.taskDependencies, risk: snapshot.risks, "design-iteration": snapshot.designIterations,
  };
  for (const target of input.targetRefs ?? []) {
    if (!collections[target.kind]?.some((record) => record.id === target.id)) {
      return `The selected ${target.kind} target does not exist.`;
    }
  }

  return null;
}

function validatePartDefinitionLink(partDefinitionId: string | null | undefined) {
  if (!partDefinitionId) {
    return "Please select a real part from the Parts tab.";
  }

  if (!findPartDefinition(partDefinitionId)) {
    return "Please select a real part from the Parts tab.";
  }

  return null;
}

export function validatePartDefinitionMaterialId(materialId: string | null | undefined) {
  if (materialId === undefined || materialId === null) {
    return null;
  }

  if (!findMaterial(materialId)) {
    return "The selected material does not exist.";
  }

  return null;
}

export function validatePartInstanceLinks(input: Pick<PartInstance, "location" | "intendedSubsystemId" | "intendedMechanismId" | "partDefinitionId">) {
  const subsystemId = input.location.kind === "installed" ? input.location.subsystemId : input.intendedSubsystemId;
  const mechanismId = input.location.kind === "installed" ? input.location.mechanismId : input.intendedMechanismId;
  if (subsystemId && !findSubsystem(subsystemId)) return "The selected subsystem does not exist.";
  if (mechanismId) {
    const mechanism = findMechanism(mechanismId);
    if (!mechanism) {
      return "The selected mechanism does not exist.";
    }

    if (mechanism.subsystemId !== subsystemId) {
      return "The selected mechanism does not belong to the selected subsystem.";
    }
  }

  return validatePartDefinitionLink(input.partDefinitionId);
}

export function validatePurchaseItemLinks(input: { taskId: string; kind: PurchaseItem["kind"]; partDefinitionId: string | null; materialId: string | null; quotes: readonly Pick<PurchaseItem["quotes"][number], "id" | "vendorId">[]; selectedQuoteId: string | null }) {
  const snapshot = getSnapshot();
  const task = snapshot.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) return "The associated procurement task does not exist.";
  if (input.kind === "cots-goods" && task.manufacturingDetails) return "COTS purchasing tasks cannot carry ManufacturingDetails.";
  if (input.kind === "manufacturing-service") {
    const workType = snapshot.workTypes.find((candidate) => candidate.id === task.workTypeId);
    const project = snapshot.projects.find((candidate) => candidate.id === task.projectId);
    if (!task.manufacturingDetails || task.manufacturingDetails.fulfillmentSource !== "outsourced" || project?.projectType !== "robot" || workType?.projectType !== "robot" || workType.code !== "manufacturing") return "Manufacturing service purchases must link to an outsourced Robot manufacturing task.";
  }
  if (input.partDefinitionId && !snapshot.partDefinitions.some((part) => part.id === input.partDefinitionId)) return "The selected part definition does not exist.";
  if (input.materialId && !snapshot.materials.some((material) => material.id === input.materialId)) return "The selected material does not exist.";
  if (input.quotes.some((quote) => !snapshot.vendors.some((vendor) => vendor.id === quote.vendorId))) return "Every quote must reference an existing vendor.";
  if (input.selectedQuoteId && !input.quotes.some((quote) => quote.id === input.selectedQuoteId)) return "The selected quote does not exist on this purchase item.";
  return null;
}

export function validateSubsystemPeople(input: {
  projectId: string;
  responsibleEngineerId?: string | null;
  mentorIds?: readonly string[];
}) {
  const members = getMembers();
  const project = findProject(input.projectId);
  const seasonId = project?.seasonId ?? null;

  if (
    input.responsibleEngineerId &&
    !members.some((member) => member.id === input.responsibleEngineerId)
  ) {
    return "The selected responsible engineer does not exist.";
  }
  if (
    seasonId &&
    input.responsibleEngineerId &&
    !members.some(
      (member) =>
        member.id === input.responsibleEngineerId &&
        isActiveInSeason(member, seasonId),
    )
  ) {
    return "The responsible engineer must belong to the project's season.";
  }

  if (input.mentorIds) {
    const invalidMentor = input.mentorIds.find(
      (mentorId) => !members.some((member) => member.id === mentorId),
    );

    if (invalidMentor) {
      return "One of the selected mentors does not exist.";
    }
    if (
      seasonId &&
      input.mentorIds.some(
        (mentorId) =>
          !members.some(
            (member) =>
              member.id === mentorId && isActiveInSeason(member, seasonId),
          ),
      )
    ) {
      return "Mentors must belong to the project's season.";
    }
  }

  return null;
}

export function wouldCreateSubsystemCycle(
  subsystemId: string,
  parentSubsystemId: string | null,
) {
  const visitedSubsystemIds = new Set<string>();
  let nextParentSubsystemId = parentSubsystemId;

  while (nextParentSubsystemId) {
    if (nextParentSubsystemId === subsystemId) {
      return true;
    }

    if (visitedSubsystemIds.has(nextParentSubsystemId)) {
      return true;
    }

    visitedSubsystemIds.add(nextParentSubsystemId);
    nextParentSubsystemId =
      findSubsystem(nextParentSubsystemId)?.parentSubsystemId ?? null;
  }

  return false;
}

export function validateMilestoneProjectLinks(projectIds: readonly string[]) {
  const unknownProjectId = projectIds.find((projectId) => !findProject(projectId));

  if (unknownProjectId) {
    return "One or more related projects do not exist.";
  }

  return null;
}
