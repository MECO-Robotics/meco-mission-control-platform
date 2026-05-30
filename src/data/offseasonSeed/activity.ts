import type { PlatformSnapshot } from "../../domain/types";

export const offseasonWorkLogs = [
    {
      id: "log-27",
      taskId: "drive-module-spares-audit",
      date: "2026-05-28",
      hours: 1.5,
      participantIds: ["diego", "ava"],
      notes: "Sorted module bins and flagged two worn wheel sets for replacement before June scrimmage.",
    },
    {
      id: "log-28",
      taskId: "battery-health-cull",
      date: "2026-05-29",
      hours: 2,
      participantIds: ["olivia", "emma"],
      notes: "Load-tested eight batteries and marked two as retired pending mentor signoff.",
    },
    {
      id: "log-29",
      taskId: "scouting-schema-normalization",
      date: "2026-05-29",
      hours: 2.25,
      participantIds: ["noah", "riley"],
      notes: "Reconciled missing match rows and updated the import notes for scouting tablets.",
    },
    {
      id: "log-30",
      taskId: "auto-replay-suite",
      date: "2026-05-30",
      hours: 1.5,
      participantIds: ["ethan", "emma"],
      notes: "Loaded first replay logs and captured drift notes from the left-start autonomous path.",
    },
    {
      id: "log-31",
      taskId: "rookie-drive-practice-plan",
      date: "2026-05-30",
      hours: 1,
      participantIds: ["sofia", "diego"],
      notes: "Drafted station rotation and reset-crew assignments for the June training night.",
    },
  ] satisfies PlatformSnapshot["workLogs"];

export const offseasonMeetings = [
    {
      id: "offseason-maintenance-review",
      title: "Offseason maintenance review",
      meetingType: "review",
      seasonId: "default-season",
      projectIds: ["project-robot-2026", "project-operations-2026"],
      startDateTime: "2026-05-30T10:00:00-04:00",
      endDateTime: "2026-05-30T12:00:00-04:00",
      location: "MECO shop",
      description: "Review robot service items, battery health, and mentor QA ownership.",
      date: "2026-05-30",
      time: "10:00 AM",
      rsvpsYes: 18,
      rsvpsMaybe: 3,
      openSignIns: 2,
    },
    {
      id: "summer-scrimmage-logistics",
      title: "Summer scrimmage logistics",
      meetingType: "competition",
      seasonId: "default-season",
      projectIds: ["project-operations-2026", "project-training-2026"],
      startDateTime: "2026-06-04T18:30:00-04:00",
      endDateTime: "2026-06-04T19:30:00-04:00",
      location: "Shop conference room",
      description: "Finalize loadout, battery rotation, field reset roles, and scouting station plan.",
      date: "2026-06-04",
      time: "6:30 PM",
      rsvpsYes: 16,
      rsvpsMaybe: 5,
      openSignIns: 4,
    },
  ] satisfies PlatformSnapshot["meetings"];

export const offseasonAttendanceRecords = [
    { id: "att-14", memberId: "diego", date: "2026-05-28", totalHours: 1.5 },
    { id: "att-15", memberId: "emma", date: "2026-05-29", totalHours: 2 },
    { id: "att-16", memberId: "noah", date: "2026-05-29", totalHours: 2.25 },
    { id: "att-17", memberId: "ethan", date: "2026-05-30", totalHours: 1.5 },
    { id: "att-18", memberId: "sofia", date: "2026-05-30", totalHours: 1 },
  ] satisfies PlatformSnapshot["attendanceRecords"];
