import type { Meeting } from "../../domain/types";
import { uniqueIds } from "../../domain/ids";

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
