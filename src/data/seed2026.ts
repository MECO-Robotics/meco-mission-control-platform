import source from "./season2026Seed.json";
import { INITIAL_WORK_TYPES } from "../domain/taskDisciplines";
import type { MilestoneType, PlatformSnapshot, ProjectType, ResponsibleGroupIcon, ScheduleEvent, SeasonType, TaskStatus } from "../domain/types";

const seedRecordedAt = "2026-10-23T00:00:00.000Z";
const areas = ["robot", "operations", "outreach", "media", "strategy", "training"] as const;
const icons: Record<(typeof areas)[number], ResponsibleGroupIcon> = {
  robot: "wrench", operations: "briefcase", outreach: "megaphone", media: "clapperboard", strategy: "target", training: "graduation-cap",
};
const colors: Record<(typeof areas)[number], string> = {
  robot: "#2563EB", operations: "#64748B", outreach: "#059669", media: "#9333EA", strategy: "#D97706", training: "#0891B2",
};
const projectId = (area: string | null | undefined) => `project-${areas.includes(area as (typeof areas)[number]) ? area : "operations"}-2026`;
const slug = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pseudonyms = ["Avery Reed", "Cameron Ellis", "Jordan Vale", "Riley Quinn", "Casey Rowan", "Morgan Hayes", "Skyler Bennett", "Devin Parker", "Kendall Brooks", "Jamie Foster", "Logan Avery", "Dakota Flynn", "Harper Lewis", "Emerson Blake", "Sage Monroe", "Parker Vaughn", "Finley Cross", "Reese Dalton", "Bailey Sinclair", "Arden Wells", "Micah Sutton", "Taylor Mercer", "Rowan Clarke", "Drew Winslow", "Blair Jennings", "Lane Whitaker", "Noel Pierce", "Emery Knox"];
const pseudonymByPersonId = new Map(source.members.map((member, index) => [member.id.replace(/^member-/, "").toLocaleLowerCase(), pseudonyms[index]!]));
const pseudonymFor = (value: string) => pseudonymByPersonId.get(value.replace(/^member-/, "").toLocaleLowerCase()) ?? "Team member";
const safeText = (value: string | null | undefined) => (value ?? "").replace(/person-(\d+)/gi, (_match, number: string) => pseudonymByPersonId.get(`person-${number}`.toLocaleLowerCase()) ?? "Team member").trim();
const sourceDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
};

function classifyMaterial(name: string): "metal" | "plastic" | "filament" | "electronics" | "hardware" | "consumable" | "other" {
  const text = name.toLocaleLowerCase();
  if (/filament|onyx|pla\b|petg|abs\b/.test(text)) return "filament";
  if (/polycarbonate|plexi|acrylic|plastic|nylon|delrin|uhmw|hdpe|3d print/.test(text)) return "plastic";
  if (/aluminum|aluminium|steel|metal|tube|shaft|plate|angle|sheet|bracket|bar stock/.test(text)) return "metal";
  if (/wire|electrical|battery|motor|radio|connector|sensor|pdp|pdh|limelight|cable|switch|breaker|electronics/.test(text)) return "electronics";
  if (/bolt|screw|nut|washer|rivet|fastener|hardware|spacer|bearing|gear|belt|chain|pinion/.test(text)) return "hardware";
  if (/tape|glue|paint|zip tie|safety glasses|gloves|consumable/.test(text)) return "consumable";
  return "other";
}

function workTypeFor(area: (typeof areas)[number], title: string) {
  const text = title.toLocaleLowerCase();
  const choices = INITIAL_WORK_TYPES.filter((item) => item.projectType === area);
  const keyword = area === "robot"
    ? /code|program|auto|pathplanner|pid/.test(text) ? "programming" : /test|tune|practice|drive/.test(text) ? "testing" : /wire|electrical|radio|limelight|sensor/.test(text) ? "electrical" : /build|assemble|machine|fabricat|cut|print|deliver/.test(text) ? "manufacturing" : "design"
    : area === "operations" ? /grant|research|find|look up/.test(text) ? "research" : /money|budget|cost|purchase|order/.test(text) ? "finance" : /document|binder|record|checklist/.test(text) ? "documentation" : "planning"
    : area === "outreach" ? /impact|document|award/.test(text) ? "documentation" : /media|photo|video|social|post/.test(text) ? "media-production" : /sponsor|partner/.test(text) ? "partnerships" : "engagement"
    : area === "media" ? /photo/.test(text) ? "photography" : /video|edit|film/.test(text) ? "video" : /website|web/.test(text) ? "web" : /social|post/.test(text) ? "social-media" : "graphics"
    : area === "strategy" ? /scout/.test(text) ? "scouting" : /risk/.test(text) ? "risk-review" : /data|analy/.test(text) ? "data-analysis" : "game-analysis"
    : /practice/.test(text) ? "practice" : /curriculum|lesson/.test(text) ? "curriculum" : /safety|train|teach|presentation/.test(text) ? "instruction" : "planning";
  return choices.find((item) => item.code === keyword)?.id ?? choices[0]!.id;
}

function exactDueDate(candidate: { explicitDueText?: string | null; sourceDate?: string | null }) {
  const text = candidate.explicitDueText ?? "";
  const sourceDate = candidate.sourceDate ?? "";
  const full = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  const monthDay = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  const ordinal = text.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i);
  let year = sourceDate.slice(0, 4);
  let month: number;
  let day: number;
  if (full) {
    month = Number(full[1]); day = Number(full[2]); year = full[3]!.length === 2 ? `20${full[3]}` : full[3]!;
  } else if (monthDay) {
    month = Number(monthDay[1]); day = Number(monthDay[2]);
  } else if (ordinal && sourceDate) {
    month = Number(sourceDate.slice(5, 7)); day = Number(ordinal[1]);
  } else return null;
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function milestoneType(title: string, declared: string | null): MilestoneType {
  if (declared && ["practice", "competition", "deadline", "internal-review", "demo"].includes(declared)) return declared as MilestoneType;
  const text = title.toLocaleLowerCase();
  if (/due|deadline|submit|submission|grant/.test(text)) return "deadline";
  if (/regional|competition|event/.test(text)) return "competition";
  if (/practice|scrimmage/.test(text)) return "practice";
  if (/demo|showcase|presentation/.test(text)) return "demo";
  return "internal-review";
}

export function apply2026SeasonSeed(snapshot: PlatformSnapshot) {
  const season = source.season;
  const projects = source.projects.map((project) => ({
    id: project.id, teamId: project.teamId, seasonId: project.seasonId, name: project.name, projectType: project.projectType as ProjectType,
    description: `${project.description} Status is active based on documented 2026 activity; individual ownership is unassigned where sources do not identify it.`, status: "active" as const,
  }));
  const members = source.members.map((member) => ({
    id: member.id, name: pseudonymFor(member.id.replace(/^member-/, "")), email: "", role: "unknown" as const, elevated: false,
    seasonId: season.id, activeSeasonIds: [season.id],
  }));
  const groups = areas.map((area) => ({
    id: `group-${area}-2026`, seasonId: season.id, name: projects.find((project) => project.projectType === area)!.name,
    icon: icons[area], color: colors[area], projectIds: [projectId(area)],
    workTypeIds: INITIAL_WORK_TYPES.filter((workType) => workType.projectType === area).map((workType) => workType.id),
    memberIds: [] as string[], primaryMemberIds: [] as string[], isArchived: false,
  }));
  const meetingNotes = new Map<string, string[]>();
  for (const note of source.meetingNotes) {
    const lines = meetingNotes.get(note.meetingId) ?? [];
    lines.push(safeText(note.text)); meetingNotes.set(note.meetingId, lines);
  }
  const tasksByEntry = new Map<string, string[]>();
  for (const task of source.taskCandidates) {
    const entryId = task.sourceEntryId ?? "";
    const titles = tasksByEntry.get(entryId) ?? [];
    titles.push(safeText(task.title)); tasksByEntry.set(entryId, titles);
  }
  const meetings = source.meetings.map((meeting) => {
    const date = sourceDate(meeting.date);
    const notes = meetingNotes.get(meeting.id) ?? [];
    const tasks = tasksByEntry.get(meeting.id) ?? [];
    const sourceLine = `${meeting.source}; source date label: ${meeting.dateLabel}`;
    return {
      id: meeting.id, title: meeting.date ? `MECO team meeting — ${meeting.date}` : `MECO meeting date needs review — ${meeting.dateLabel}`,
      meetingType: "general" as const, seasonId: season.id, projectIds: [], date, dateLabel: meeting.dateLabel, startAt: null, endAt: null,
      location: "", description: [sourceLine, notes.length ? `Meeting notes:\n${notes.map((line) => `• ${line}`).join("\n")}` : "", tasks.length ? `Planned work (${tasks.length} items) is linked as tasks.` : ""].filter(Boolean).join("\n\n"),
      rsvpsYes: 0, rsvpsMaybe: 0, openSignIns: 0,
    };
  }).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.dateLabel.localeCompare(b.dateLabel));
  const meetingIds = new Set(meetings.map((meeting) => meeting.id));
  const taskCandidates = [...source.taskCandidates].sort((left, right) =>
    (left.sourceDate ?? "9999-99-99").localeCompare(right.sourceDate ?? "9999-99-99"),
  );
  for (const { taskId, prerequisiteTaskId } of source.sequenceDependencies) {
    const dependentIndex = taskCandidates.findIndex(({ id }) => id === taskId);
    const prerequisiteIndex = taskCandidates.findIndex(({ id }) => id === prerequisiteTaskId);
    if (dependentIndex < 0 || prerequisiteIndex < 0 || prerequisiteIndex < dependentIndex) continue;
    if (taskCandidates[dependentIndex]!.sourceDate !== taskCandidates[prerequisiteIndex]!.sourceDate) continue;
    const [prerequisite] = taskCandidates.splice(prerequisiteIndex, 1);
    taskCandidates.splice(dependentIndex, 0, prerequisite!);
  }
  const tasks = taskCandidates.map((candidate) => {
    const area = areas.includes(candidate.projectArea as (typeof areas)[number]) ? candidate.projectArea as (typeof areas)[number] : "operations";
    const title = safeText(candidate.title) || "Untitled source task";
    const exactDue = exactDueDate(candidate);
    const status: TaskStatus = candidate.status === "complete" || candidate.status === "in-progress" ? candidate.status : "unrecorded";
    const notes = [
      `Source: ${candidate.sourceLabels.join(", ")}${candidate.sourceEntryId ? `; entry ${candidate.sourceEntryId}` : ""}; date ${candidate.sourceDateLabel ?? "not stated"}.`,
      candidate.statusEvidence ? `Progress context: ${safeText(candidate.statusEvidence)} Status remains unrecorded because the source does not establish a workflow state.` : "Source did not establish a workflow status; status left unrecorded.",
      candidate.dueDateEvidence ? `Due-date evidence: ${safeText(candidate.dueDateEvidence)}.` : exactDue ? `Explicit due date: ${exactDue}.` : "No explicit task due date was stated.",
      candidate.sequenceEvidence ? `Sequence evidence: ${safeText(candidate.sequenceEvidence)}.` : "",
      candidate.projectArea ? "Project area classified from source wording." : "Project area was not explicit; grouped under Operations for review.",
    ].join(" ");
    const assignees = (candidate.ownerIds ?? []).filter((id: string) => members.some((member) => member.id === id));
    return {
      id: candidate.id, projectId: projectId(area), workTypeId: workTypeFor(area, title), responsibleGroupId: `group-${area}-2026`, requestedById: null,
      scheduleRefs: candidate.sourceEntryId && meetingIds.has(candidate.sourceEntryId) ? [{ kind: "meeting" as const, id: candidate.sourceEntryId }] : [],
      manufacturingDetails: null, workstreamIds: [], subsystemIds: [`season-work-${area}-2026`], mechanismIds: [], partInstanceIds: [],
      title, summary: notes, ownerId: null, assigneeIds: assignees, mentorId: null,
      startDate: null, dueDate: exactDue, priority: /critical|urgent|must/i.test(title) ? "high" as const : "medium" as const,
      status, checklistItems: [], estimatedHours: 0, actualHours: 0, requiresDocumentation: false,
    };
  });
  const taskDependencies = source.sequenceDependencies.map((dependency) => ({
    id: dependency.id, taskId: dependency.taskId, kind: "task" as const, refId: dependency.prerequisiteTaskId,
    requiredState: "complete" as const, dependencyType: "hard" as const, createdAt: seedRecordedAt,
  }));
  const milestones = source.milestoneCandidates.map((candidate) => {
    const date = exactDueDate(candidate) ?? (/\bdeliver\b/i.test(candidate.title) ? sourceDate(candidate.sourceDate) : null);
    const area = areas.includes(candidate.projectArea as (typeof areas)[number]) ? candidate.projectArea as (typeof areas)[number] : null;
    return {
      id: candidate.id, seasonId: season.id, title: safeText(candidate.title), type: milestoneType(candidate.title, candidate.type), date,
      dateLabel: candidate.sourceDateLabel, startAt: null, endAt: null, isExternal: false,
      description: `${candidate.source}; source entry ${candidate.sourceEntryId}.${candidate.explicitDueText ? ` Explicit due text: ${safeText(candidate.explicitDueText)}.` : ""}${date ? " Date is from the source plan." : " No milestone date is stated."}`,
      projectIds: area ? [projectId(area)] : [], status: "planned" as const, photoUrl: "",
    };
  }).sort((left, right) => (left.date ?? "9999").localeCompare(right.date ?? "9999") || left.title.localeCompare(right.title));
  const events = source.events.map((event) => ({
    id: event.id, seasonId: season.id, projectIds: [projectId(event.eventType === "competition" ? "operations" : "outreach")],
    title: safeText(event.title), description: `${event.source.join("; ")}${event.dateNote ? ` ${safeText(event.dateNote)}` : ""}${event.packDate ? ` Pack: ${event.packDate}.` : ""}${event.unpackDate ? ` Unpack: ${event.unpackDate}.` : ""}`,
    date: event.startDate ?? null, startAt: null, endAt: null, location: event.location ?? "", eventType: event.eventType as ScheduleEvent["eventType"],
  })).sort((left, right) => (left.date ?? "9999").localeCompare(right.date ?? "9999") || left.title.localeCompare(right.title));
  const vendorNames = [...new Set(source.materials.map((material) => material.vendorName).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
  const vendors = vendorNames.map((name) => ({ id: `vendor-${slug(name)}`, name, website: null, isArchived: false }));
  const imageBySku = new Map(source.verifiedProductImages.filter((image) => image.sku).map((image) => [String(image.sku).toLocaleLowerCase(), image.imageUrl]));
  const imageByProduct = new Map(source.verifiedProductImages.map((image) => [String(image.product).toLocaleLowerCase(), image.imageUrl]));
  const materials = source.materials.map((material) => {
    const sourceRows = material.sourceEvidence.map((row) => `${row.sheet} row ${row.row}${row.receivedDate ? ` received ${row.receivedDate}` : ""}`).join("; ");
    const unresolved = [material.unit ? "" : "Unit not specified by purchase source.", material.location ? "" : "Storage location not stated.", material.reorderPoint == null ? "Reorder point not stated." : ""].filter(Boolean).join(" ");
    return {
      id: material.id, name: safeText(material.name), category: material.category ?? classifyMaterial(material.name),
      unit: material.unit ?? "Not specified", onHandQuantity: material.quantityKnown ? material.quantity : null,
      reorderPoint: material.reorderPoint, location: material.location ?? "Not specified",
      preferredVendorId: material.vendorName ? `vendor-${slug(material.vendorName)}` : null,
      notes: [safeText(material.notes), material.sku ? `SKU: ${safeText(material.sku)}.` : "SKU not stated.", sourceRows ? `Received purchase sources: ${sourceRows}.` : "", unresolved].filter(Boolean).join(" "),
      photoUrl: material.photoUrl ?? (material.sku ? imageBySku.get(String(material.sku).toLocaleLowerCase()) : undefined) ?? imageByProduct.get(String(material.name).toLocaleLowerCase()),
    };
  });
  const transactionRows = [
    ...source.openingMaterialTransactions.map((row) => ({
      id: row.id, operationId: row.idempotencyKey, materialId: row.materialId, movementType: "receipt" as const,
      quantityDelta: row.quantityDelta, reason: `${row.reason} Source: ${row.sourceEvidence.sheet} row ${row.sourceEvidence.row}.`,
      recordedAt: seedRecordedAt, actorMemberId: null, occurredAt: sourceDate(row.occurredDate),
      sourceReference: `MECO Purchase List.xlsx — ${row.sourceEvidence.sheet}, row ${row.sourceEvidence.row}`,
      ...(row.taskId ? { taskId: row.taskId } : {}), ...(row.projectId ? { projectId: row.projectId } : {}),
    })),
    ...source.unquantifiedReceivedRows.map((row) => ({
      id: `unknown-receipt-${row.purchaseId}`, operationId: `seed:${row.purchaseId}`, materialId: row.materialId,
      movementType: "receipt" as const, quantityDelta: null,
      reason: `${row.reason} Source: ${row.sourceSheet} row ${row.sourceRow}.`, recordedAt: seedRecordedAt, actorMemberId: null,
      occurredAt: null, sourceReference: `MECO Purchase List.xlsx — ${row.sourceSheet}, row ${row.sourceRow}`,
    })),
  ];
  const componentsBySubsystem = new Map<string, typeof source.stepComponents>();
  for (const component of source.stepComponents) {
    const name = String(component.mappedSubsystemName).replace(/ hardware$/i, "");
    const rows = componentsBySubsystem.get(name) ?? [];
    rows.push(component); componentsBySubsystem.set(name, rows);
  }
  const subsystems = [...componentsBySubsystem.entries()].map(([name, components]) => ({
    id: `step-subsystem-${slug(name)}`, projectId: "project-robot-2026", name: name.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase()),
    description: `Mapped from MAIN ASSEMBLY.step. Clearly labeled CAD components: ${components.map((component) => safeText(component.name)).join(", ")}. Installed CAD components do not represent stock quantity.`,
    isCore: false, parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [], iteration: 1, isArchived: false,
  }));
  const taskGroupingSubsystems = areas.map((area) => ({
    id: `season-work-${area}-2026`, projectId: projectId(area), name: "Season work (not a CAD component)",
    description: "Organizational target for sourced 2026 tasks that do not identify a specific robot component.",
    isCore: false, parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [], iteration: 1, isArchived: false,
  }));
  const subsystemIdByMap = new Map([...componentsBySubsystem.keys()].map((name) => [name, `step-subsystem-${slug(name)}`]));
  const mechanisms = source.stepComponents.map((component) => {
    const mapped = String(component.mappedSubsystemName).replace(/ hardware$/i, "");
    return {
      id: component.id, subsystemId: subsystemIdByMap.get(mapped)!, name: safeText(component.name),
      description: `Named ${component.componentKind} from MAIN ASSEMBLY.step. ${safeText(component.sourceConfidence)}. ${safeText(component.quantityMeaning)}.`,
      iteration: 1, isArchived: false, cadSource: "step" as const, cadImportSource: "STEP_UPLOAD" as const,
      cadEditedAfterImport: false, cadSourceLabel: "MAIN ASSEMBLY.step",
    };
  });
  Object.assign(snapshot, {
    snapshotSchemaVersion: 3,
    seasons: [{ id: season.id, name: season.name, type: season.type as SeasonType, startDate: season.firstDatedActivity, endDate: season.lastDatedActivity, description: `${season.dateBoundaryBasis} Date bounds represent documented activity only; official season boundaries were not stated.` }],
    projects, workTypes: INITIAL_WORK_TYPES, responsibleGroups: groups, workstreams: [], vendors, members,
    subsystems: [...subsystems, ...taskGroupingSubsystems], mechanisms, materials, materialTransactions: transactionRows,
    artifacts: [], partDefinitions: [], partInstances: [], tasks, milestones, milestoneRequirements: [], taskDependencies,
    qaReports: [], teamReports: [], qaRequests: [], testResults: [], qaFindings: [], testFindings: [], designIterations: [], risks: [], workLogs: [],
    meetings, events, attendanceRecords: [], purchaseItems: [], escalations: [], actions: [],
  } satisfies Partial<PlatformSnapshot>);
}
