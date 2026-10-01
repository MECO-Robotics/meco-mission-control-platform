import { parseRouteInput } from "./helpers/parseRouteInput";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  createMeeting,
  findProject,
  getSeasons,
  getSnapshot,
  removeMeeting,
  updateMeeting,
} from "../data/store";
import { validateMilestoneProjectLinks } from "./helpers/linkValidation";
import { meetingPatchSchema, meetingSchema } from "./routeSchemas";

type ApiSessionGuard = (request: FastifyRequest, reply: FastifyReply) => boolean;

interface MeetingRoutesOptions {
  requireApiSessionIfEnabled: ApiSessionGuard;
  requireMentorPermission: (
    request: Parameters<ApiSessionGuard>[0],
    reply: Parameters<ApiSessionGuard>[1],
    message: string,
  ) => boolean;
}

function resolveMeetingSeasonId(args: {
  currentSeasonId?: string | null;
  projectIds: readonly string[];
  requestedSeasonId?: string;
}) {
  return args.requestedSeasonId ??
    args.projectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((seasonId): seasonId is string => Boolean(seasonId)) ??
    args.currentSeasonId ??
    null;
}

function validateMeetingSeasonProjectConsistency(seasonId: string | null, projectIds: readonly string[]) {
  if (seasonId && !getSeasons().some((candidate) => candidate.id === seasonId)) {
    return "The selected season does not exist.";
  }

  const projectSeasonIds = Array.from(
    new Set(
      projectIds
        .map((projectId) => findProject(projectId)?.seasonId ?? null)
        .filter((projectSeasonId): projectSeasonId is string => Boolean(projectSeasonId)),
    ),
  );

  if (projectSeasonIds.length > 1) {
    return "Meeting projects must belong to the same season.";
  }

  if (seasonId && projectSeasonIds.some((projectSeasonId) => projectSeasonId !== seasonId)) {
    return "Meeting season and related projects must belong to the same season.";
  }

  return null;
}

export function registerMeetingRoutes(app: FastifyInstance, options: MeetingRoutesOptions) {
  const { requireApiSessionIfEnabled, requireMentorPermission } = options;

  app.get("/api/meetings", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      meetings: getSnapshot().meetings,
      attendance: getSnapshot().attendanceRecords,
      workLogs: getSnapshot().workLogs,
    };
  });

  app.post<{ Body: unknown }>("/api/meetings", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can create meetings.")) {
      return;
    }

    const parsed = parseRouteInput(meetingSchema, request.body, reply, "Meeting payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const projectIds = Array.from(new Set(parsed.data.projectIds ?? []));
    const meetingProjectValidation = validateMilestoneProjectLinks(projectIds);
    if (meetingProjectValidation) {
      return reply.code(400).send({ message: meetingProjectValidation });
    }
    const seasonId = resolveMeetingSeasonId({
      projectIds,
      requestedSeasonId: parsed.data.seasonId,
    });
    const meetingSeasonValidation = validateMeetingSeasonProjectConsistency(seasonId, projectIds);
    if (meetingSeasonValidation) {
      return reply.code(400).send({ message: meetingSeasonValidation });
    }

    const meeting = createMeeting({
      ...parsed.data,
      seasonId: seasonId ?? undefined,
      projectIds,
      endAt: parsed.data.endAt ?? null,
    });

    return reply.code(201).send({ item: meeting });
  });

  app.patch<{ Body: unknown; Params: { meetingId: string } }>(
    "/api/meetings/:meetingId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can update meetings.")) {
        return;
      }

      const parsed = parseRouteInput(meetingPatchSchema, request.body, reply, "Meeting update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentMeeting = getSnapshot().meetings.find(
        (meeting) => meeting.id === request.params.meetingId,
      );
      if (!currentMeeting) {
        return reply.code(404).send({ message: "Meeting not found." });
      }

      const projectIds =
        parsed.data.projectIds === undefined
          ? currentMeeting.projectIds ?? []
          : Array.from(new Set(parsed.data.projectIds));
      const meetingProjectValidation = validateMilestoneProjectLinks(projectIds);
      if (meetingProjectValidation) {
        return reply.code(400).send({ message: meetingProjectValidation });
      }
      const seasonId = resolveMeetingSeasonId({
        currentSeasonId: currentMeeting.seasonId,
        projectIds,
        requestedSeasonId: parsed.data.seasonId,
      });
      const meetingSeasonValidation = validateMeetingSeasonProjectConsistency(seasonId, projectIds);
      if (meetingSeasonValidation) {
        return reply.code(400).send({ message: meetingSeasonValidation });
      }

      const meeting = updateMeeting(request.params.meetingId, {
        ...parsed.data,
        seasonId: seasonId ?? undefined,
        projectIds: [...projectIds],
        endAt:
          parsed.data.endAt === undefined
            ? currentMeeting.endAt ?? null
            : parsed.data.endAt,
      });

      return { item: meeting };
    },
  );

  app.delete<{ Params: { meetingId: string } }>(
    "/api/meetings/:meetingId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can delete meetings.")) {
        return;
      }

      const meeting = removeMeeting(request.params.meetingId);
      if (!meeting) {
        return reply.code(404).send({ message: "Meeting not found." });
      }

      return { item: meeting };
    },
  );
}
