import { issueTestMobileToken } from "../helpers/sessionAuth";
import type { MemberRole } from "../../src/domain/types";

export const authEnv = {
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  AUTH_MENTOR_EMAILS: "mentor@mecorobotics.org",
} as const;

export async function signTestToken(args: {
  email: string;
  role: MemberRole;
  hostedDomain?: string;
}) {

  return await issueTestMobileToken({
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
