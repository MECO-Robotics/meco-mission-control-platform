import { randomUUID } from "node:crypto";
import { MobileSessionService } from "../../src/auth/mobileSessionService";
import type { SessionUser } from "../../src/auth/authService";
import { MobileSessionMemoryStore } from "./mobileSessionMemoryStore";

export const testMobileSessionStore = new MobileSessionMemoryStore();
export async function issueTestMobileToken(user: SessionUser) {
  return (await new MobileSessionService(testMobileSessionStore).create(user, randomUUID(), "Integration test")).token;
}
