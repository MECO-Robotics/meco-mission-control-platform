import source from "./season2026Seed.json";
import historicalPlans from "./meetingPlans2024-2025.json";
import purchaseSource from "./purchaseRecords2026.json";
import sourceSupplement from "./sourceSeedSupplement.json";
import { INITIAL_WORK_TYPES } from "../domain/taskDisciplines";
import { artifactSchema, reportSchema } from "../routes/routeSchemas";
import type { MilestoneType, PlatformSnapshot, ProjectType, ResponsibleGroupIcon, ScheduleEvent, SeasonType, TaskStatus } from "../domain/types";
import { buildCadSeed } from "./seedCadModel";
import { buildSeedRisks, buildSeedTaskDependencies, contextualTaskProjectAreas, hasExplicitOpenProgressEvidence, inferTaskProjectArea, isActionableSeedTask, taskScheduleWindow } from "./taskScheduleSeed";

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
// Public #outreach STEMventure staffing post (2026-08-22) identifies area mentors and student shifts.
// Public Slack role announcements/profile evidence identifies the two current subteam leads.
const roleByMemberId: Record<string, "student" | "lead" | "mentor"> = {
  "member-person-13": "student",
  "member-person-14": "lead",
  "member-person-15": "student",
  "member-person-16": "mentor",
  "member-person-17": "mentor",
  "member-person-18": "student",
  "member-person-20": "student",
  "member-person-21": "student",
  "member-person-23": "mentor",
  "member-person-24": "mentor",
  "member-person-25": "lead",
  "member-person-26": "student",
  "member-person-27": "mentor",
  "member-person-28": "mentor",
  "member-person-29": "mentor",
  "member-person-30": "student",
  "member-person-32": "student",
  "member-person-33": "student",
  "member-person-34": "student",
  "member-person-39": "mentor",
};
const pseudonymFor = (value: string) => pseudonymByPersonId.get(value.replace(/^member-/, "").toLocaleLowerCase()) ?? "Team member";
const safeText = (value: string | null | undefined) => (value ?? "").replace(/person-(\d+)/gi, (_match, number: string) => pseudonymByPersonId.get(`person-${number}`.toLocaleLowerCase()) ?? "Team member").trim();
const historicalNameAliases: [string, string][] = ([
  ["Carrie Udowychenko", "Milo Anders"],
  ["Noah Sherkow", "Nina Calder"],
  ["Dayana Chanson", "Jasper Hsu"],
  ["Barbara Chanson", "Tessa Sloan"],
  ["Mason Brown", "Vera Kim"],
  ["Nathan Gelino", "Caleb Finch"],
  ["Mason B", "Mira Patel"],
  ["Mason T", "Leo Sato"],
  ["Kelly Breen", "Zara Mendez"],
  ["Nikki", "Theo Wilder"],
  ["Dayana", "Ava Carver"],
  ["Sage", "Nico Delaney"],
  ["Phelan", "Iris Cole"],
  ["Moses", "Owen Shaw"],
  ["Nate", "Lena Moss"],
  ["Kaleb", "Ezra Park"],
  ["Lily", "Maya Cross"],
  ["Rex", "Eli Stone"],
  ["Hailey", "Uma Voss"],
  ["Ryan", "Ivan Pike"],
  ["Aidan", "Ruby Chen"],
  ["Conrad", "Felix March"],
  ["Becky", "Cleo Hart"],
  ["Mason", "Rafael Venn"],
  ["Daniel", "Sienna Frost"],
  ["Grant", "Dante Vale"],
  ["Steven", "Sylvie Gray"],
  ["Bianca", "Ronan Lake"],
  ["Jerry", "Freya Penn"],
  ["Kris", "Arlo Rhodes"],
  ["Brennan", "Esme Wells"],
  ["Francisco", "Soren Hayes"],
  ["Doug", "Noemi Clarke"],
  ["Bunn", "Gideon Brooks"],
  ["Paul", "Priya Kane"],
  ["Neil", "Ansel Webb"],
  ["Michelle", "Nola Hart"],
  ["Yosmar", "Basil Reed"],
  ["Aurora", "Anika Bell"],
  ["Krys", "Cormac Dale"],
  ["Jab", "Elodie King"],
  ["Manny", "Amara Solis"],
  ["Sarah", "Tomas Evers"],
  ["Jaz", "Veda Monroe"],
  ["Scott", "Juno Harlow"],
  ["Ethan", "Kieran Lowe"],
  ["Misha", "Mina Kestrel"],
  ["Atalya", "Orson Tate"],
  ["Amadeus", "Lior Wade"],
  ["Keller", "Naomi French"],
  ["Brian", "Casper Rowan"],
  ["Wendy", "Seren Fox"],
  ["Susan", "Remy Arquette"],
  ["Kat", "Stellan James"],
  ["Connor", "Lucca Shaw"],
  ["Reasha", "Maren Vail"],
  ["Cady", "Cyrus Bell"],
  ["Tiara", "Luca Hale"],
]).sort(([left], [right]) => right.length - left.length) as [string, string][];
const safeHistoricalText = (value: string) => historicalNameAliases.reduce(
  (text, [name, alias]) => text.replace(new RegExp(`\\b${name}\\b`, "g"), alias),
  value,
);
const sourceDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
};

function classifyMaterial(name: string): "metal" | "plastic" | "filament" | "electronics" | "hardware" | "consumable" | "other" {
  const text = name.toLocaleLowerCase();
  if (/filament|onyx|pla\b|petg|abs\b/.test(text)) return "filament";
  if (/\b(?:nylon )?fabric\b|\bbumper fabric\b|hook and loop|sew on velcro|polycord|round belting|hardware cloth|wheel tread|cat'?s? (?:tounge|tongue) tape|low friction tape|heat shrink|open[- ]ended.*timing belt|roller chain.*\b(?:feet|ft)\b/.test(text)) return "other";
  if (/polycarbonate|plexi|acrylic|plastic|nylon|delrin|uhmw|hdpe|3d print/.test(text)) return "plastic";
  if (/aluminum|aluminium|steel|metal|tube|shaft|plate|angle|sheet|bracket|bar stock/.test(text)) return "metal";
  if (/wire|electrical|battery|motor|radio|connector|sensor|pdp|pdh|limelight|cable|switch|breaker|electronics/.test(text)) return "electronics";
  if (/bolt|screw|nut|washer|rivet|fastener|hardware|spacer|bearing|gear|belt|chain|pinion/.test(text)) return "hardware";
  if (/tape|glue|paint|zip tie|safety glasses|gloves|consumable/.test(text)) return "consumable";
  return "other";
}

// Materials is the fabrication-input catalog: stock that must be cut, formed,
// machined, sewn, printed, or terminated before it becomes a robot component.
function isStockMaterial(name: string): boolean {
  const text = name.toLocaleLowerCase();
  if (isShopTool(name)) return false;
  if (/wheel tread|cat'?s? (?:tounge|tongue) tape|low friction tape|heat shrink|heat-shrink/.test(text)) return true;
  if (/\bled\b|paper plates?|shaft collar|versaroller|roller hub|sprocket|gear|bearing|bracket|support|mount|hub|plug|wheel|block|\bcable\b|\bcord\b|connector|terminal|\bchain drive\b/.test(text)) return false;
  if (/\b(?:open[- ]ended|open end)\b.*\btiming belt\b|\bround belting\b|\bpolycord\b|\broller chain\b.*\b(?:feet|ft)\b|\b(?:hook and loop|velcro).*\b\d+\s*(?:yd|yds|ft|feet)\b|\bsew on velcro\b|\b\d+\s*(?:awg|gauge)\b.*\bwire\b|\bcan wire\b|\bbonded wire\b|\bnylon fabric\b|\bbumper fabric\b|\bhardware cloth\b|\bfilament\b|\bpet[- ]?g\b|\bmagnet sticks?\b/.test(text)) return true;
  return /\bshaft(?:s)?\b|\bhex (?:lite )?(?:stock|bar)\b|\bchurro\b|\b(?:round |box |aluminum |aluminium )?tube(?:s| stock| extrusion)?\b|\btubing\b|\bextrusion(?:s)?\b|\b(?:aluminum |aluminium |steel |polycarbonate |polycarb )?plate(?:s| stock)?\b|\b(?:aluminum|aluminium|polycarbonate|polycarb|plastic|acrylic)\b.*\bsheets?\b|\bsheets?\b.*\b(?:aluminum|aluminium|polycarbonate|polycarb|plastic|acrylic)\b|\bbar stock\b/.test(text) || /^polycarb(?:onate)?$/.test(text);
}

function isShopTool(name: string): boolean {
  if (/filament|printer paper|label maker (?:ribbon|tape)|(?:hacksaw|bandsaw|drop saw|saw) blades?|\bdrill bits?\b|countersink bits?|thread taps?|file brushes|shop vac carpet attachment/i.test(name)) return false;
  return /center punch|torque wrench|hot ?glue gun|\ballen keys?\b|needle[- ]nose pliers|wood chisel|rivet removal tool|wire stripper|wire crimper|\bcalipers?\b|rubber mallet|cordless vacuum|shop vac|battery discharger|digital multimeter|cordless rivet gun|solder sucker|fume extractor|drill press|battery charger|cordless miter saw|locking clamps|\btape measures?\b|\bwrenches?\b|\bclamps?\b|\bvises?\b|\bvice\b|drill bushings?|chain tools?|label maker(?:$|[^ -])|\b(?:3d )?printer\b/i.test(name);
}

function isRobotPart(name: string): boolean {
  return !NON_ROBOT_CATALOG_ITEM.test(name);
}

const NON_ROBOT_CATALOG_ITEM = /center punch|torque wrench|\bchisel|hacksaw|\bdrill bits?\b|drill tap|drill bushings?|end mill|needle[- ]nose pliers|hand broom|broom handle|\bwrench\b|file brushes|acid shop brushes|\bstrip brushes\b|wire stripper|wire crimper|\bcrimpers?\b|\bcalipers\b|rivet removal tool|rivet gun|sanding (?:belts|disks)|\bvacuum\b|shop vac|air filters?|cordless miter saw|drill press|saw blade|bandsaw blade|drop saw blade|battery charger|battery charging station|battery discharger|solder sucker|soldering iron|soldering iorn|fume extractor|\bbit set\b|\ballen keys?\b|countersink bits?|thread taps?|hot ?glue gun|plastic drop cloths?|rubber mallet|chain tools?|locking clamps|\bsafety glasses\b|ear muffs|ear plugs|\bgloves\b|eye wash|first aid|finger splints?|thermometer|cold packs?|ice packs?|hand sanitizer|paper towels|disinfectant wipes|dry erase wipes|whiteboard cleaner|\bwhiteboard\b|water dispenser|air conditioner|rat zapper|feminine hygiene|trash bags?|trashcans|flight suits?|serving utensils|\bforks\b|hair ties|ear wire hooks|clip earrings|nametag|science stampers|button (?:maker|box|sets|supplies)|button making machine|\bbuttons?\b|\bjournals\b|\bcardstock\b|note cards?|printer paper|dry erase markers|wet erase markers|\bsharpies?\b|\bpens\b|pen leashes|label maker|square labels|yard signs|garden stakes|sign holders|\blanyards\b|tent bag|medication|laptop|Acer Aspire|\bprinter\b|Quest 3S|cord reel|extension cord|Goo Gone|cutting oil|paper plates?|plastic forks|\bdispenser\b|\borganizer\b|Lego container|\bfurniture dollies\b|\bwagon\b|\bramps for loading\b|\bshop infrastructure\b|LED replacement tubes?|dimmable LED tube lights|lights for closet|software|licen[cs]e|subscription|\bgame pieces?\b|fuel game piece|pool noodles?|foam display board|velcro belt for wrapping floor tiles|\b(?:AA|AAA|D) batteries\b|\bCR ?2032 batteries\b|spindle motor kit/i;

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
  const historicalYears = [2023, 2024, 2025] as const;
  const seasonActivityDates = (year: number) => [
    ...historicalPlans.entries.filter((entry) => entry.date.startsWith(`${year}-`)).map((entry) => entry.date),
    ...purchaseSource.filter((row) => row.sourceSheet.startsWith(String(year))).flatMap((row) =>
      [row.requestedAt, row.orderedAt, row.receivedAt, row.expectedDeliveryDate].map(sourceDate).filter((date): date is string => date !== null),
    ),
  ].sort();
  const seasons = [
    ...historicalYears.map((year) => {
      const dates = seasonActivityDates(year);
      return {
        id: `season-${year}-meco`, name: year === 2023 ? "MECO Robotics 2023 purchase history" : `MECO Robotics ${year} historical season`,
        type: year === 2023 ? "initiative" as const : "season" as const, startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null,
        description: year === 2023 ? "Purchase history only; the provided sources do not include a 2023 meeting plan." : `Meeting-plan and purchase records for ${year}. Date bounds show source activity only, not official FRC season dates.`,
      };
    }),
    { id: season.id, name: season.name, type: season.type as SeasonType, startDate: season.firstDatedActivity, endDate: season.lastDatedActivity, description: `${season.dateBoundaryBasis} Date bounds represent documented activity only; official season boundaries were not stated.` },
    { id: "season-2027-meco", name: "MECO Robotics 2027 planning season (2026–27)", type: "season" as const, startDate: null, endDate: null, description: "A 2026–27 season is identified by FY 2027 purchase records and 2027-season mentor minutes. Official season date bounds are not stated." },
  ];
  const projects = source.projects.map((project) => ({
    id: project.id, teamId: project.teamId, seasonId: project.seasonId, name: project.name, projectType: project.projectType as ProjectType,
    description: `${project.description} Status is active based on documented 2026 activity; individual ownership is unassigned where sources do not identify it.`, status: "active" as const,
  }));
  const historicalProjects = historicalYears.map((year) => ({
    id: `project-operations-${year}`, teamId: "meco-robotics", seasonId: `season-${year}-meco`, name: "Operations", projectType: "operations" as const,
    description: `Source grouping for historical ${year} records; separate project workstreams were not inferred.`, status: "complete" as const,
  }));
  const historicalRobotProjects = historicalYears.map((year) => ({
    id: `project-robot-${year}`, teamId: "meco-robotics", seasonId: `season-${year}-meco`, name: "Robot", projectType: "robot" as const,
    description: `Source grouping for robot catalog purchases recorded in ${year}; task links and robot-specific project plans are not inferred.`, status: "complete" as const,
  }));
  const nextSeasonProjects = [
    { id: "project-operations-2027", teamId: "meco-robotics", seasonId: "season-2027-meco", name: "Operations", projectType: "operations" as const, description: "2026–27 registration and team operations documents; exact competition-season bounds are not stated.", status: "active" as const },
    { id: "project-training-2027", teamId: "meco-robotics", seasonId: "season-2027-meco", name: "Training", projectType: "training" as const, description: "Mentor planning documented for the 2027 season; no additional training tasks are inferred.", status: "active" as const },
    { id: "project-robot-2027", teamId: "meco-robotics", seasonId: "season-2027-meco", name: "Robot", projectType: "robot" as const, description: "Robot-related FY 2027 purchase records; no new robot design or build tasks are inferred.", status: "active" as const },
  ];
  const members = source.members.map((member) => ({
    id: member.id, name: pseudonymFor(member.id.replace(/^member-/, "")), email: "", role: roleByMemberId[member.id] ?? "unknown", elevated: false,
    seasonId: season.id, activeSeasonIds: [season.id],
  }));
  const memberAreas = new Map<string, Map<(typeof areas)[number], number>>();
  for (const candidate of source.taskCandidates) {
    const area = areas.includes(candidate.projectArea as (typeof areas)[number])
      ? candidate.projectArea as (typeof areas)[number]
      : contextualTaskProjectAreas[candidate.id];
    if (!area) continue;
    for (const memberId of candidate.ownerIds ?? []) {
      const counts = memberAreas.get(memberId) ?? new Map<(typeof areas)[number], number>();
      counts.set(area, (counts.get(area) ?? 0) + 1);
      memberAreas.set(memberId, counts);
    }
  }
  const leadByArea: Record<(typeof areas)[number], string> = {
    robot: "member-person-25",
    operations: "member-person-14",
    outreach: "member-person-14",
    media: "member-person-25",
    strategy: "member-person-14",
    training: "member-person-25",
  };
  const groups = areas.map((area) => ({
    id: `group-${area}-2026`, seasonId: season.id, name: projects.find((project) => project.projectType === area)!.name,
    icon: icons[area], color: colors[area], projectIds: [projectId(area)],
    workTypeIds: INITIAL_WORK_TYPES.filter((workType) => workType.projectType === area).map((workType) => workType.id),
    memberIds: [leadByArea[area]], primaryMemberIds: [] as string[], isArchived: false,
  }));
  // Preserve source-backed work-area assignments; distribute the remaining pseudonymous roster
  // evenly so nobody is left off a default team. The lead assignments are provisional where
  // Slack did not identify a current lead for that area or map names to these member IDs.
  const groupByArea = new Map(groups.map((group) => [group.id.replace(/^group-/, "").replace(/-2026$/, "") as (typeof areas)[number], group]));
  members.forEach((member, index) => {
    const counts = memberAreas.get(member.id);
    const sourceAreas = counts ? [...counts.keys()] : [];
    const primaryArea = sourceAreas.length
      ? [...sourceAreas].sort((left, right) => (counts!.get(right)! - counts!.get(left)!) || areas.indexOf(left) - areas.indexOf(right))[0]!
      : areas[index % areas.length]!;
    const primaryGroup = groupByArea.get(primaryArea)!;
    if (!primaryGroup.memberIds.includes(member.id)) primaryGroup.memberIds.push(member.id);
    if (member.role === "student" || member.role === "lead") primaryGroup.primaryMemberIds.push(member.id);
    for (const secondaryArea of sourceAreas.filter((candidateArea) => candidateArea !== primaryArea)) {
      const secondaryGroup = groupByArea.get(secondaryArea)!;
      if (!secondaryGroup.memberIds.includes(member.id)) secondaryGroup.memberIds.push(member.id);
    }
  });
  for (const area of areas) {
    const group = groupByArea.get(area)!;
    if (group.primaryMemberIds.some((memberId) => members.find((member) => member.id === memberId)?.role === "student")) continue;
    const donor = [...groups]
      .filter((candidate) => candidate !== group)
      .sort((left, right) => right.primaryMemberIds.filter((id) => members.find((member) => member.id === id)?.role === "student").length - left.primaryMemberIds.filter((id) => members.find((member) => member.id === id)?.role === "student").length)[0];
    const studentId = donor?.primaryMemberIds.find((id) => members.find((member) => member.id === id)?.role === "student");
    if (donor && studentId) {
      donor.primaryMemberIds = donor.primaryMemberIds.filter((id) => id !== studentId);
      if (!group.memberIds.includes(studentId)) group.memberIds.push(studentId);
      group.primaryMemberIds.push(studentId);
    }
  }
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
  const historicalMeetings = historicalPlans.entries.map((entry, index) => ({
    id: `meeting-${entry.date.replaceAll("-", "")}-${index + 1}`, title: `MECO meeting plan — ${entry.sourceDate}`,
    meetingType: "general" as const, seasonId: entry.date.slice(0, 4) === "2024" ? "season-2024-meco" : "season-2025-meco",
    projectIds: [], date: sourceDate(entry.date), dateLabel: entry.sourceDate, startAt: null, endAt: null, location: "",
    description: [entry.source, entry.dateNote, entry.actionsAndAgenda.length ? `Planned agenda:\n${entry.actionsAndAgenda.map((line) => `• ${safeHistoricalText(line)}`).join("\n")}` : "", entry.meetingNotes.length ? `Notes:\n${entry.meetingNotes.map((line) => `• ${safeHistoricalText(line)}`).join("\n")}` : ""].filter(Boolean).join("\n\n"),
    rsvpsYes: 0, rsvpsMaybe: 0, openSignIns: 0,
  }));
  const meetingIds = new Set(meetings.map((meeting) => meeting.id));
  const taskCandidates = [...source.taskCandidates].filter((candidate) => isActionableSeedTask(candidate.title)).sort((left, right) =>
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
  const robotSubsystemForTask = (title: string) => {
    if (/shooter|flywheel|hood/i.test(title)) return "step-subsystem-shooter";
    if (/convey[eo]r|hopper/i.test(title)) return "step-subsystem-conveyer";
    if (/intake|rack|roller/i.test(title)) return "step-subsystem-intake";
    return "step-subsystem-chassis";
  };
  const tasks = taskCandidates.map((candidate) => {
    const inferredArea = inferTaskProjectArea(candidate.title);
    const area = areas.includes(candidate.projectArea as (typeof areas)[number]) ? candidate.projectArea as (typeof areas)[number] : contextualTaskProjectAreas[candidate.id] ?? inferredArea ?? "operations";
    const title = safeText(candidate.title) || "Untitled source task";
    const subsystemId = area === "robot" ? robotSubsystemForTask(title) : `season-work-${area}-2026`;
    const exactDue = exactDueDate(candidate);
    const schedule = taskScheduleWindow(candidate, area, sourceDate(candidate.sourceDate), exactDue);
    const sourceTaskDate = sourceDate(candidate.sourceDate);
    const hasPassedSourceDate = Boolean(sourceTaskDate && sourceTaskDate <= "2026-10-23");
    const status: TaskStatus = candidate.status === "complete" || candidate.status === "in-progress"
      ? candidate.status
      : hasExplicitOpenProgressEvidence(candidate) || ["task-src-523b57b9b07057", "task-src-87e563935cd25a"].includes(candidate.id) ? "in-progress"
      : hasPassedSourceDate ? "complete" : "in-progress";
    const progressEvidence = candidate.statusEvidence ?? (candidate.id === "task-src-523b57b9b07057"
      ? "Oct 4 recap set a CAD completion goal for Oct 6; Oct 8 and Oct 10 recaps confirm intake CAD and cut plates were still being finished and not installed. Source: https://mecorobotics.slack.com/archives/C03MXBFGAM6/p1791496927328879 https://mecorobotics.slack.com/archives/C03MXBFGAM6/p1791665847534219"
      : candidate.id === "task-src-87e563935cd25a"
        ? "Oct 13 recap says the Roboticon post was not planned yet; Oct 20 says the social post had only been started. Source: https://mecorobotics.slack.com/archives/C03MXBFGAM6/p1791943411998309 https://mecorobotics.slack.com/archives/C03MXBFGAM6/p1792540360791729"
        : null);
    const notes = [
      `Source: ${candidate.sourceLabels.join(", ")}${candidate.sourceEntryId ? `; entry ${candidate.sourceEntryId}` : ""}; date ${candidate.sourceDateLabel ?? "not stated"}.`,
      progressEvidence
        ? `Progress context: ${safeText(progressEvidence)}`
        : hasPassedSourceDate
          ? "Status inference: the source date has passed, and the public recap crawl found no later report that this task remained open. Marked complete per user direction; this is an inference, not direct confirmation."
          : "Status inference: this source-dated task is still in the future; kept active because the user asked for scheduled work without a not-started state. Confirm progress in a later recap.",
      candidate.dueDateEvidence ? `Due-date evidence: ${safeText(candidate.dueDateEvidence)}.` : exactDue ? `Explicit due date: ${exactDue}.` : "No explicit task due date was stated.",
      schedule.note,
      candidate.sequenceEvidence ? `Sequence evidence: ${safeText(candidate.sequenceEvidence)}.` : "",
      candidate.projectArea ? "Project area classified from source wording." : contextualTaskProjectAreas[candidate.id] ? "Project area classified as Robot from linked design/integration context." : inferredArea ? `Project area inferred from task title as ${inferredArea}; source did not label the area.` : "Project area was not explicit; grouped under Operations for review.",
      area === "robot" ? `Robot subsystem grouped by task-title keywords to ${subsystemId.replace("step-subsystem-", "")}; general robot work defaults to Chassis for coordination.` : "",
    ].join(" ");
    const assignees = (candidate.ownerIds ?? []).filter((id: string) => members.some((member) => member.id === id));
    return {
      id: candidate.id, projectId: projectId(area), workTypeId: workTypeFor(area, title), responsibleGroupId: `group-${area}-2026`, requestedById: null,
      scheduleRefs: candidate.sourceEntryId && meetingIds.has(candidate.sourceEntryId) ? [{ kind: "meeting" as const, id: candidate.sourceEntryId }] : [],
      manufacturingDetails: null, workstreamIds: [], subsystemIds: [subsystemId], mechanismIds: [], partInstanceIds: [],
      title, summary: notes, ownerId: null, assigneeIds: assignees, mentorId: null,
      startDate: schedule.startDate, dueDate: schedule.dueDate, priority: /critical|urgent|must/i.test(title) ? "high" as const : "medium" as const,
      status, checklistItems: [], estimatedHours: 0, actualHours: 0, requiresDocumentation: false,
    };
  });
  const taskIds = new Set(tasks.map((task) => task.id));
  const taskDependencies = buildSeedTaskDependencies(taskIds, seedRecordedAt);
  const risks = buildSeedRisks(seedRecordedAt);
  const milestoneProjectArea = (candidate: (typeof source.milestoneCandidates)[number]) => {
    if (areas.includes(candidate.projectArea as (typeof areas)[number])) return candidate.projectArea as (typeof areas)[number];
    if (/deliver all subsystems|deliver (?:conveyer|intake|bumpers|complete autos)/i.test(candidate.title)) return "robot" as const;
    if (/student presentation/i.test(candidate.title)) return "training" as const;
    if (/leadership application/i.test(candidate.title)) return "training" as const;
    if (/research grants|all orders/i.test(candidate.title)) return "operations" as const;
    return null;
  };
  const milestoneStatus: Record<string, "planned" | "active" | "complete"> = {
    "milestone-src-339d567d1e5178": "complete", // The matching Impact Award entry is explicitly confirmed submitted in the Feb 11 recap.
    "milestone-src-676efb24aeee8f": "complete", // Mar 15 retrospective says all subsystems were finished before competition.
  };
  const milestones = source.milestoneCandidates.map((candidate) => {
    const conflictingDate = candidate.id === "milestone-src-2538cd2c478a8b";
    const date = conflictingDate ? null : exactDueDate(candidate) ?? (/\bdeliver\b|\bimpact submission\b/i.test(candidate.title) ? sourceDate(candidate.sourceDate) : null);
    const area = milestoneProjectArea(candidate);
    return {
      id: candidate.id, seasonId: season.id, title: safeText(candidate.title), type: milestoneType(candidate.title, candidate.type), date,
      dateLabel: candidate.sourceDateLabel, startAt: null, endAt: null, isExternal: false,
      description: `${candidate.source}; source entry ${candidate.sourceEntryId}.${candidate.explicitDueText ? ` Explicit due text: ${safeText(candidate.explicitDueText)}.` : ""}${conflictingDate ? " Date withheld for review: the entry is under Mon, 3/2 but says tomorrow (03/01/26), so the source conflicts." : date ? " Date is from the source plan." : " No milestone due date is stated."}${milestoneStatus[candidate.id] ? " Status is confirmed by a matching recap." : " Completion status is not confirmed by a matching recap."}`,
      projectIds: area ? [projectId(area)] : [], status: milestoneStatus[candidate.id] ?? "planned", photoUrl: "",
    };
  }).sort((left, right) => (left.date ?? "9999").localeCompare(right.date ?? "9999") || left.title.localeCompare(right.title));
  const events = source.events.map((event) => {
    const inferredMakerFaire = event.id === "event-maker-faire-2026-candidate";
    const date = inferredMakerFaire ? "2026-11-07" : event.startDate ?? null;
    const dateNote = inferredMakerFaire
      ? "Inferred as Nov 7–8 from the Oct 20 public #outreach post (Saturday the 7th, Sunday the 8th) and the dated November meeting plan; month is inferred from context. https://mecorobotics.slack.com/archives/C02343MKTNF/p1792536048949139"
      : event.dateNote;
    return {
      id: event.id, seasonId: season.id, projectIds: [projectId(event.eventType === "competition" ? "operations" : "outreach")],
      title: safeText(event.title), description: `${event.source.join("; ")}${dateNote ? ` ${safeText(dateNote)}` : ""}${inferredMakerFaire ? " Event dates: Nov 7–8, 2026." : ""}${event.packDate ? ` Pack: ${event.packDate}.` : ""}${event.unpackDate ? ` Unpack: ${event.unpackDate}.` : ""}`,
      date, startAt: null, endAt: null, location: inferredMakerFaire ? "Orange County Fairgrounds" : event.location ?? "", eventType: event.eventType as ScheduleEvent["eventType"],
    };
  }).sort((left, right) => (left.date ?? "9999").localeCompare(right.date ?? "9999") || left.title.localeCompare(right.title));
  const vendorNames = [...new Set(source.materials.map((material) => material.vendorName).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
  const purchaseVendors = purchaseSource.flatMap((item) => item.vendor ? [String(item.vendor)] : []);
  const vendors = [...new Set([...vendorNames, ...purchaseVendors])].sort((a, b) => a.localeCompare(b)).map((name) => ({ id: `vendor-${slug(name)}`, name, website: null, isArchived: false }));
  const imageBySku = new Map(source.verifiedProductImages.filter((image) => image.sku).map((image) => [String(image.sku).toLocaleLowerCase(), image.imageUrl]));
  const imageByProduct = new Map(source.verifiedProductImages.map((image) => [String(image.product).toLocaleLowerCase(), image.imageUrl]));
  const stockSources = source.materials.filter((material) => isStockMaterial(material.name));
  const toolSources = source.materials.filter((material) => isShopTool(material.name));
  const partSources = source.materials.filter((material) => !isStockMaterial(material.name) && !isShopTool(material.name) && isRobotPart(material.name));
  const catalogStockSources = [...stockSources, ...toolSources];
  const materials = catalogStockSources.map((material) => {
    const sourceRows = material.sourceEvidence.map((row) => `${row.sheet} row ${row.row}${row.receivedDate ? ` received ${row.receivedDate}` : ""}`).join("; ");
    const unresolved = [material.unit ? "" : "Unit not specified by purchase source.", material.location ? "" : "Storage location not stated.", material.reorderPoint == null ? "Reorder point not stated." : ""].filter(Boolean).join(" ");
    return {
      id: material.id, name: safeText(material.name), category: isShopTool(material.name) ? "tool" as const : material.category ?? classifyMaterial(material.name),
      unit: material.unit ?? "Not specified", onHandQuantity: material.quantityKnown ? material.quantity : null,
      reorderPoint: material.reorderPoint, location: material.location ?? "Not specified",
      preferredVendorId: material.vendorName ? `vendor-${slug(material.vendorName)}` : null,
      notes: [safeText(material.notes), material.sku ? `SKU: ${safeText(material.sku)}.` : "SKU not stated.", sourceRows ? `Received purchase sources: ${sourceRows}.` : "", unresolved].filter(Boolean).join(" "),
      photoUrl: material.photoUrl ?? (material.sku ? imageBySku.get(String(material.sku).toLocaleLowerCase()) : undefined) ?? imageByProduct.get(String(material.name).toLocaleLowerCase()),
    };
  });
  const partDefinitionBySourceId = new Map(partSources.map((item) => [item.id, `purchase-catalog-${item.id}`] as const));
  const partDefinitions = partSources.map((item) => {
    const image = (item.sku ? imageBySku.get(String(item.sku).toLocaleLowerCase()) : undefined)
      ?? imageByProduct.get(String(item.name).toLocaleLowerCase());
    return {
      id: partDefinitionBySourceId.get(item.id)!, seasonId: season.id, activeSeasonIds: [season.id],
      name: safeText(item.name), partNumber: safeText(item.sku ?? item.id), vendorPartNumbers: item.sku ? { [item.vendorName ?? "Source"]: safeText(item.sku) } : {},
      revision: "", iteration: 1, isArchived: false, isHardware: /bolt|screw|nut|washer|rivet|fastener|spacer|pin\b/i.test(item.name),
      type: classifyMaterial(item.name), defaultAcquisitionMethod: "purchase-cots" as const, materialId: null,
      description: `Imported from MECO Purchase List.xlsx. ${safeText(item.notes)}${item.sourceEvidence.length ? ` Source rows: ${item.sourceEvidence.map((row) => `${row.sheet} row ${row.row}`).join(", ")}.` : ""}`,
      ...(image ? { photoUrl: image } : {}),
    };
  });
  const purchaseSeasonId = (sheet: string) => sheet === "2023 offseason" ? "season-2023-meco" : sheet.startsWith("2024") ? "season-2024-meco" : sheet.startsWith("2025") ? "season-2025-meco" : sheet === "FY 2027" ? "season-2027-meco" : season.id;
  const materialByPurchaseId = new Map(catalogStockSources.flatMap((material) => material.purchaseIds.map((id: string) => [id, material] as const)));
  const partByPurchaseId = new Map(partSources.flatMap((item) => item.purchaseIds.map((id: string) => [id, item] as const)));
  const receiptsByPurchaseId = new Map<string, Array<{ id: string; operationId: string; quantity: number; location: string; receivedAt: string | null; partInstanceIds: string[] }>>();
  for (const movement of [...source.openingMaterialTransactions, ...source.unquantifiedReceivedRows.map((row) => ({ id: `unknown-receipt-${row.purchaseId}`, idempotencyKey: `seed:${row.purchaseId}`, purchaseId: row.purchaseId, materialId: row.materialId, quantityDelta: null, sourceEvidence: { sheet: row.sourceSheet, row: row.sourceRow } }))]) {
    if (!movement.purchaseId) continue;
    const item = purchaseSource.find((candidate) => candidate.id === movement.purchaseId);
    const receipts = receiptsByPurchaseId.get(movement.purchaseId) ?? [];
    if (movement.quantityDelta === null || movement.quantityDelta === undefined) continue;
    receipts.push({ id: `receipt-${movement.purchaseId}`, operationId: movement.idempotencyKey, quantity: movement.quantityDelta, location: materialByPurchaseId.get(movement.purchaseId)?.location ?? "Not specified", receivedAt: item?.receivedAt ?? null, partInstanceIds: [] });
    receiptsByPurchaseId.set(movement.purchaseId, receipts);
  }
  const purchaseItems = purchaseSource.map((row) => {
    const material = materialByPurchaseId.get(row.id);
    const partDefinition = partByPurchaseId.get(row.id);
    const status = String(row.status ?? "").trim();
    const canceled = /^canceled|cancelled$/i.test(status);
    const receipts = receiptsByPurchaseId.get(row.id) ?? [];
    const received = receipts.length > 0 || /^arrived/i.test(status) || Boolean(row.receivedAt);
    const ordered = received || Boolean(row.orderedAt) || /^ordered|shipped/i.test(status);
    const vendorId = row.vendor ? `vendor-${slug(String(row.vendor))}` : null;
    const amount = typeof row.total === "number" && row.total >= 0 ? { amount: row.total, currency: "USD" } : null;
    const quoteId = `quote-${row.id}`;
    const quotes = vendorId && amount ? [{ id: quoteId, vendorId, reference: row.orderNumber ? String(row.orderNumber) : null, amount, ...(row.url ? { url: String(row.url) } : {}), quotedAt: sourceDate(row.requestedAt) }] : [];
    const purchaseSeason = purchaseSeasonId(row.sourceSheet);
    const robotCatalogItem = Boolean(material || partDefinition);
    const purchaseProjectId = robotCatalogItem ? `project-robot-${purchaseSeason.slice(7, 11)}` : `project-operations-${purchaseSeason.slice(7, 11)}`;
    return {
      id: row.id, taskId: null, seasonId: purchaseSeason, projectId: purchaseProjectId,
      sourceStatus: row.status == null ? null : String(row.status),
      sourceReference: `MECO Purchase List.xlsx — ${row.sourceSheet}, row ${row.sourceRow}${row.purpose ? `. Purpose: ${safeHistoricalText(String(row.purpose))}` : ". Purpose not recorded in the source row."}`,
      kind: "cots-goods" as const, partDefinitionId: partDefinition ? partDefinitionBySourceId.get(partDefinition.id) ?? null : null, materialId: material?.id ?? null, title: safeText(String(row.title)),
      quantity: typeof row.quantity === "number" ? row.quantity : null, quotes, selectedQuoteId: quotes.length ? quoteId : null,
      approvalStatus: canceled ? "rejected" as const : ordered ? "approved" as const : "pending" as const,
      approvedById: null, approvedAt: null, purchaseOrderNumber: row.orderNumber ? String(row.orderNumber) : null,
      orderStatus: canceled ? "cancelled" as const : received ? "delivered" as const : /^shipped/i.test(status) ? "shipped" as const : ordered ? "ordered" as const : "not-ordered" as const,
      finalCost: null, expectedDeliveryDate: sourceDate(row.expectedDeliveryDate), trackingNumber: null, trackingUrl: null,
      orderedAt: sourceDate(row.orderedAt), deliveredAt: sourceDate(row.receivedAt), receipts,
    };
  });
  const artifacts = sourceSupplement.artifacts.map(({ id, ...artifact }) => {
    const historicalYear = artifact.title.includes("Meeting Plan 2024") ? 2024 : artifact.title.includes("Meeting Plan 2025") ? 2025 : null;
    const nextSeasonProject = artifact.title.startsWith("Mentor minutes - 2027") ? "project-training-2027"
      : artifact.title.startsWith("How to register - mentor 2026-27") ? "project-operations-2027" : null;
    const scopedProjectId = historicalYear ? `project-operations-${historicalYear}` : nextSeasonProject ?? artifact.projectId;
    const scopedArtifact = scopedProjectId === artifact.projectId ? artifact : {
      ...artifact, projectId: scopedProjectId, targetRefs: [{ kind: "project" as const, id: scopedProjectId }],
    };
    return { ...artifactSchema.parse(scopedArtifact), id, updatedAt: artifact.updatedAt ?? seedRecordedAt };
  });
  const reports = sourceSupplement.reports.map(({ id, ...report }) => ({ ...reportSchema.parse(report), id }));
  const qaReports = reports.filter((report) => report.reportType === "qa");
  const teamReports = reports.filter((report) => report.reportType !== "qa");
  const purchaseIdSet = new Set(purchaseItems.map((item) => item.id));
  const receiptIdByOperation = new Map(purchaseItems.flatMap((item) => (item.receipts ?? []).map((receipt) => [receipt.operationId, receipt.id] as const)));
  const transactionRows = [
    ...source.openingMaterialTransactions.filter((row) => materials.some((material) => material.id === row.materialId)).map((row) => ({
      id: row.id, operationId: row.idempotencyKey, materialId: row.materialId, movementType: "receipt" as const,
      quantityDelta: row.quantityDelta, reason: `${row.reason} Source: ${row.sourceEvidence.sheet} row ${row.sourceEvidence.row}.`,
      recordedAt: seedRecordedAt, actorMemberId: null, occurredAt: sourceDate(row.occurredDate),
      sourceReference: `MECO Purchase List.xlsx — ${row.sourceEvidence.sheet}, row ${row.sourceEvidence.row}`,
      ...(row.purchaseId && purchaseIdSet.has(row.purchaseId) ? { purchaseItemId: row.purchaseId } : {}),
      ...(receiptIdByOperation.has(row.idempotencyKey) ? { purchaseReceiptId: receiptIdByOperation.get(row.idempotencyKey)! } : {}),
      ...(row.taskId ? { taskId: row.taskId } : {}), ...(row.projectId ? { projectId: row.projectId } : {}),
    })),
    ...source.unquantifiedReceivedRows.filter((row) => materials.some((material) => material.id === row.materialId)).map((row) => ({
      id: `unknown-receipt-${row.purchaseId}`, operationId: `seed:${row.purchaseId}`, materialId: row.materialId,
      movementType: "receipt" as const, quantityDelta: null,
      reason: `${row.reason} Source: ${row.sourceSheet} row ${row.sourceRow}.`, recordedAt: seedRecordedAt, actorMemberId: null,
      occurredAt: null, sourceReference: `MECO Purchase List.xlsx — ${row.sourceSheet}, row ${row.sourceRow}`,
      ...(purchaseIdSet.has(row.purchaseId) ? { purchaseItemId: row.purchaseId } : {}),
    })),
  ];
  const taskGroupingSubsystems = areas.filter((area) => area !== "robot").map((area) => ({
    id: `season-work-${area}-2026`, projectId: projectId(area), name: "Season work (not a CAD component)",
    description: "Organizational target for sourced 2026 tasks that do not identify a specific robot component.",
    isCore: false, parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [], iteration: 1, isArchived: false,
  }));
  const { subsystems: robotSubsystems, mechanisms, partDefinitions: cadPartDefinitions, partInstances: cadPartInstances } = buildCadSeed();
  Object.assign(snapshot, {
    snapshotSchemaVersion: 3,
    seasons, projects: [...projects, ...historicalProjects, ...historicalRobotProjects, ...nextSeasonProjects], workTypes: INITIAL_WORK_TYPES, responsibleGroups: groups, workstreams: [], vendors, members,
    subsystems: [...robotSubsystems, ...taskGroupingSubsystems], mechanisms, materials, materialTransactions: transactionRows,
    artifacts, partDefinitions: [...partDefinitions, ...cadPartDefinitions], partInstances: cadPartInstances, tasks, milestones, milestoneRequirements: [], taskDependencies,
    qaReports, teamReports, qaRequests: [], testResults: [], qaFindings: [], testFindings: [], designIterations: [], risks, workLogs: [],
    meetings: [...meetings, ...historicalMeetings].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.title.localeCompare(b.title)), events, attendanceRecords: [], purchaseItems, escalations: [], actions: [],
  } satisfies Partial<PlatformSnapshot>);
}
