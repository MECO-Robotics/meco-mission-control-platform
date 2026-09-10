import { z } from "zod";
import { authConfig as runtimeAuthConfig } from "../config/env";

const emailCodeLength = runtimeAuthConfig.emailCodeLength;

export const emailSignInRequestSchema = z.object({
  email: z.string().trim().email(),
});

export const emailSignInVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(emailCodeLength),
  deviceId: z.string().trim().min(1).max(128).optional().nullable(),
});

