import type { FastifyReply } from "fastify";
import type { ZodType } from "zod";

export function parseRouteInput<T>(schema: ZodType<T>, input: unknown, reply: FastifyReply, message: string) {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed;
  }

  reply.code(400).send({
    message,
    issues: parsed.error.flatten(),
  });
  return null;
}
