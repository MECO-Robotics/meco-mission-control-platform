import { issueTestMobileToken } from "./sessionAuth";
import type { MemberRole } from "../../src/domain/types";

export const workflowAuthEnv = {
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
} as const;

const identities: Record<Exclude<MemberRole, "external">, { accountId: string; email: string }> = {
  student: { accountId: "ava", email: "ava.chen@mecorobotics.org" },
  lead: { accountId: "priya", email: "priya.patel@mecorobotics.org" },
  mentor: { accountId: "jordan", email: "jordan.lee@mecorobotics.org" },
  admin: { accountId: "maya", email: "maya.ortiz@mecorobotics.org" },
};

export async function createWorkflowAuthHeaders(role: Exclude<MemberRole, "external">) {

  const identity = identities[role];
  const token = await issueTestMobileToken({
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
