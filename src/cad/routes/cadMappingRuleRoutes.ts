import { parseRouteInput } from "../../routes/helpers/parseRouteInput";
import type { FastifyInstance } from "fastify";

import { cadMappingRuleCreateSchema, cadMappingRulePatchSchema } from "../cadRouteSchemas";
import type { RequireApiSession } from "./cadRouteTypes";

export function registerCadMappingRuleRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.post("/api/cad/mapping-rules", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const parsed = parseRouteInput(
      cadMappingRuleCreateSchema, request.body, reply,
      "CAD mapping rule payload is invalid.",
    );
    if (!parsed) {
      return reply;
    }
    return reply.code(201).send({
      item: await app.cadStore.createMappingRule({
        ...parsed.data,
        seasonId: parsed.data.seasonId ?? null,
        targetId: parsed.data.targetId ?? null,
        createdBy: parsed.data.createdBy ?? null,
        notes: parsed.data.notes ?? null,
      }),
    });
  });

  app.patch<{ Params: { id: string } }>("/api/cad/mapping-rules/:id", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const parsed = parseRouteInput(
      cadMappingRulePatchSchema, request.body, reply,
      "CAD mapping rule patch is invalid.",
    );
    if (!parsed) {
      return reply;
    }
    const item = await app.cadStore.updateMappingRule(request.params.id, parsed.data);
    return item ? { item } : reply.code(404).send({ message: "CAD mapping rule was not found." });
  });
}
