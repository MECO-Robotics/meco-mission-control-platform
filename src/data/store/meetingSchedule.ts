import type { Meeting } from "../../domain/types";

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function dateOnlyFromDateTime(value: string) {
  return value.slice(0, 10);
}

export function formatTimeFromDateTime(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) {
    return "";
  }

  const rawHour = Number.parseInt(match[1] ?? "0", 10);
  const minute = match[2] ?? "00";
  const period = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}

function parseLegacyMeetingTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) {
    return "18:00:00";
  }

  const rawHour = Number.parseInt(match[1] ?? "6", 10);
  const minute = match[2] ?? "00";
  const period = (match[3] ?? "PM").toUpperCase();
  const hour =
    period === "PM"
      ? rawHour === 12
        ? 12
        : rawHour + 12
      : rawHour === 12
        ? 0
        : rawHour;
  return `${hour.toString().padStart(2, "0")}:${minute}:00`;
}

export function normalizeMeetingSchedule(meeting: Meeting, fallbackSeasonId: string): Meeting {
  const date = meeting.date || dateOnlyFromDateTime(meeting.startDateTime ?? "");
  const startDateTime =
    meeting.startDateTime ??
    `${date}T${parseLegacyMeetingTime(meeting.time || "")}`;

  return {
    ...meeting,
    meetingType: meeting.meetingType ?? "general",
    seasonId: meeting.seasonId ?? fallbackSeasonId,
    projectIds: uniqueIds(meeting.projectIds ?? []),
    startDateTime,
    endDateTime: meeting.endDateTime ?? null,
    location: meeting.location ?? "",
    description: meeting.description ?? "",
    date: dateOnlyFromDateTime(startDateTime),
    time: meeting.time || formatTimeFromDateTime(startDateTime),
  };
}
