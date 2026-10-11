import type { Meeting } from "../../domain/types";
import { uniqueIds } from "../../domain/ids";

export function assertCalendarInterval(startAt: string, endAt: string | null | undefined) {
  if (!Number.isFinite(Date.parse(startAt)) || (endAt != null && (!Number.isFinite(Date.parse(endAt)) || Date.parse(endAt) < Date.parse(startAt)))) {
    throw Object.assign(new Error("Calendar end must be at or after its valid start."), { statusCode: 400 });
  }
}

export function normalizeMeetingSchedule(meeting: Meeting, fallbackSeasonId: string): Meeting {
  return {
    ...meeting,
    meetingType: meeting.meetingType ?? "general",
    seasonId: meeting.seasonId ?? fallbackSeasonId,
    projectIds: uniqueIds(meeting.projectIds ?? []),
    startAt: meeting.startAt,
    endAt: meeting.endAt ?? null,
    location: meeting.location ?? "",
    description: meeting.description ?? "",
  };
}
