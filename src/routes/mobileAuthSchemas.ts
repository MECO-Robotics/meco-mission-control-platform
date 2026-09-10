import { z } from "zod";

import { authConfig } from "../config/env";

export const mobileEmailVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(authConfig.emailCodeLength),
  deviceId: z.string().trim().min(1).max(128),
  deviceName: z.string().trim().min(1).max(128).optional(),
});

export const mobileRefreshSchema = z.object({
  refreshToken: z.string().trim().min(1).max(128),
});

export const mobileLogoutSchema = z.object({
  refreshToken: z.string().trim().min(1).max(128).optional(),
});

export const mobileSessionParamsSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
});
