import { issueTestMobileToken } from "./sessionAuth";
import type { MemberRole } from "../../src/domain/types";
import { withIntegrationApp } from "./appIntegrationHarness";

export const workflowAuthEnv = {
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
} as const;

const workflowAuthMembers = [
  { name: "jordan", email: "jordan.lee@mecorobotics.org", role: "mentor" as const },
  { name: "priya", email: "priya.patel@mecorobotics.org", role: "lead" as const },
  { name: "maya", email: "maya.ortiz@mecorobotics.org", role: "admin" as const },
];

export function withWorkflowAuthApp(
  run: Parameters<typeof withIntegrationApp>[0],
  options: Parameters<typeof withIntegrationApp>[1] = {},
) {
  return withIntegrationApp(run, {
    ...options,
    env: { ...workflowAuthEnv, ...options?.env },
    members: [...workflowAuthMembers, ...(options?.members ?? [])],
  });
}

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
