import type { MemberRole } from "../../src/domain/types";

export const authEnv = {
  AUTH_JWT_SECRET: "test-audit-export-secret-1234567",
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  AUTH_MENTOR_EMAILS: "mentor@mecorobotics.org",
} as const;

export async function signTestToken(args: {
  email: string;
  role: MemberRole;
  hostedDomain?: string;
}) {
  const { signSessionToken } = require("../../src/auth/authService") as typeof import("../../src/auth/authService");

  return signSessionToken({
    accountId: args.email,
    authProvider: "google",
    email: args.email,
    hostedDomain: args.hostedDomain ?? "mecorobotics.org",
    name: args.email,
    picture: null,
    role: args.role,
    taskSubteamIds: [],
  });
}
