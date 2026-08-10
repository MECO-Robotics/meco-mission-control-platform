import type { MemberRole } from "../../src/domain/types";

export const workflowAuthEnv = {
  AUTH_JWT_SECRET: "test-workflow-authorization-secret-123456",
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
} as const;

const identities: Record<Exclude<MemberRole, "external">, { accountId: string; email: string }> = {
  student: { accountId: "ava", email: "ava.chen@mecorobotics.org" },
  lead: { accountId: "priya", email: "priya.patel@mecorobotics.org" },
  mentor: { accountId: "jordan", email: "jordan.lee@mecorobotics.org" },
  admin: { accountId: "maya", email: "maya.ortiz@mecorobotics.org" },
};

export function createWorkflowAuthHeaders(role: Exclude<MemberRole, "external">) {
  const { signSessionToken } = require("../../src/auth/authService") as typeof import("../../src/auth/authService");
  const identity = identities[role];
  const token = signSessionToken({
    accountId: identity.accountId,
    authProvider: "email",
    email: identity.email,
    hostedDomain: "mecorobotics.org",
    name: identity.email,
    picture: null,
    role,
    taskSubteamIds: [],
  });

  return { authorization: `Bearer ${token}` };
}
