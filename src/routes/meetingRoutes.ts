import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  createMeeting,
  findProject,
  getSeasons,
  getSnapshot,
  removeMeeting,
  updateMeeting,
} from "../data/store";
import { validateMilestoneProjectLinks } from "./routeHelpers";
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
  projectIds: string[];
  requestedSeasonId?: string;
}) {
  return args.requestedSeasonId ??
    args.projectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((seasonId): seasonId is string => Boolean(seasonId)) ??
    args.currentSeasonId ??
    null;
}

function validateMeetingSeasonProjectConsistency(seasonId: string | null, projectIds: string[]) {
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

  app.post<{ Body: unknown }>("/api/meetings", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can create meetings.")) {
      return;
    }

    const parsed = meetingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Meeting payload is invalid.",
        issues: parsed.error.flatten(),
      });
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
      endDateTime: parsed.data.endDateTime ?? null,
    });

    return reply.code(201).send({ item: meeting });
  });

  app.patch<{ Body: unknown; Params: { meetingId: string } }>(
    "/api/meetings/:meetingId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can update meetings.")) {
        return;
      }

      const parsed = meetingPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Meeting update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentMeeting = getSnapshot().meetings.find(
        (meeting) => meeting.id === request.params.meetingId,
      );
      if (!currentMeeting) {
        return reply.code(404).send({ message: "Meeting not found." });
      }

      const rawPatch = request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
      const patchHas = (field: string) => Object.prototype.hasOwnProperty.call(rawPatch, field);
      const patchData = { ...parsed.data };
      if (!patchHas("meetingType")) {
        delete patchData.meetingType;
      }
      if (!patchHas("location")) {
        delete patchData.location;
      }
      if (!patchHas("description")) {
        delete patchData.description;
      }

      const projectIds =
        !patchHas("projectIds")
          ? currentMeeting.projectIds ?? []
          : Array.from(new Set(patchData.projectIds ?? []));
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
        ...patchData,
        seasonId: seasonId ?? undefined,
        projectIds,
        endDateTime:
          patchData.endDateTime === undefined
            ? currentMeeting.endDateTime ?? null
            : patchData.endDateTime,
      });

      return { item: meeting };
    },
  );

  app.delete<{ Params: { meetingId: string } }>(
    "/api/meetings/:meetingId",
    async (request, reply) => {
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
