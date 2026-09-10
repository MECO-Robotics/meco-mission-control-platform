import { z } from "zod";

import {
  normalizeUrl,
  parseCorsOrigins,
  parseCsv,
  parseGoogleClientIds,
  pickFirstString,
} from "./envHelpers";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  TRUST_PROXY_IPS: z.string().refine((value) => value.split(",").every((ip) => z.ipv4().safeParse(ip.trim()).success || z.ipv6().safeParse(ip.trim()).success), "TRUST_PROXY_IPS must contain IP addresses").optional(),
  CORS_ORIGIN: z.string().min(1).default("*"),
  API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_ALLOWED_HOSTED_DOMAIN: z.string().min(1).default("mecorobotics.org"),
  AUTH_EMAIL_SMTP_HOST: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_PORT: z.coerce.number().int().positive().optional(),
  AUTH_EMAIL_SMTP_NAME: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_USER: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_PASS: z.string().min(1).optional(),
  AUTH_EMAIL_FROM: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  AUTH_EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  AUTH_EMAIL_CODE_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_EMAIL_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_MENTOR_EMAILS: z.string().min(1).optional(),
  AUTH_MEMBER_SUBTEAMS_BY_EMAIL: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_PUBLIC_BASE_URL: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET_PREFIX: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
  MEDIA_IMAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().max(50 * 1024 * 1024).default(15 * 1024 * 1024),
  MEDIA_VIDEO_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().max(500 * 1024 * 1024).default(250 * 1024 * 1024),
  MEDIA_UPLOAD_QUOTA_BYTES_PER_HOUR: z.coerce.number().int().positive().max(10 * 1024 * 1024 * 1024).default(1024 * 1024 * 1024),
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  SLACK_ALERT_USERGROUP_HANDLES: z.string().min(1).default("allmentors,allstudents"),
  SLACK_CHANNEL_BUILD_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_PROGRAMMING_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_SCOUTING_STRATEGY_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID: z.string().min(1).optional(),
  ONSHAPE_BASE_URL: z.string().min(1).default("https://cad.onshape.com"),
  ONSHAPE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  ONSHAPE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  ONSHAPE_OAUTH_REDIRECT_URI: z.string().min(1).optional(),
  ONSHAPE_OAUTH_AUTHORIZATION_URL: z.string().min(1).default("https://oauth.onshape.com/oauth/authorize"),
  ONSHAPE_OAUTH_TOKEN_URL: z.string().min(1).default("https://oauth.onshape.com/oauth/token"),
  ONSHAPE_OAUTH_SCOPES: z.string().min(1).default("OAuth2Read"),
  ONSHAPE_OAUTH_ACCESS_TOKEN: z.string().min(1).optional(),
  ONSHAPE_OAUTH_REFRESH_TOKEN: z.string().min(1).optional(),
  ONSHAPE_OAUTH_TOKEN_EXPIRES_AT: z.string().min(1).optional(),
  ONSHAPE_OAUTH_TOKEN: z.string().min(1).optional(),
  ONSHAPE_CREDENTIAL_REFERENCE: z.string().min(1).optional(),
  CAD_STORE_DRIVER: z.enum(["prisma", "runtime"]).default("prisma"),
  PLATFORM_SNAPSHOT_PATH: z.string().trim().min(1).default("data/platform-snapshot.json"),
  CAD_STEP_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().max(64 * 1024 * 1024).default(32 * 1024 * 1024),
  CAD_STEP_PARSER_MODE: z.enum(["auto", "step_text", "json_fixture", "placeholder"]).default("auto"),
  CAD_STEP_PARSER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CAD_STEP_PARSER_MAX_CONCURRENCY: z.coerce.number().int().positive().max(8).default(2),
  CAD_STEP_PARSER_MAX_QUEUE: z.coerce.number().int().min(0).max(32).default(4),
  CAD_STEP_PARSER_MAX_OLD_SPACE_MB: z.coerce.number().int().min(64).max(1024).default(256),
  CAD_STEP_PARSER_MAX_RESULT_BYTES: z.coerce.number().int().positive().max(64 * 1024 * 1024).default(16 * 1024 * 1024),
});

const cadStepParserModes = ["auto", "step_text", "json_fixture", "placeholder"] as const;

export const env = envSchema.parse(process.env);

const googleClientIds = parseGoogleClientIds(env.GOOGLE_CLIENT_ID);
const resolvedResendApiKey = pickFirstString(env.RESEND_API_KEY);
const resolvedExplicitEmailSmtpHost = env.AUTH_EMAIL_SMTP_HOST;
const usesExplicitEmailSmtp = Boolean(resolvedExplicitEmailSmtpHost);
if (Boolean(env.AUTH_EMAIL_SMTP_USER) !== Boolean(env.AUTH_EMAIL_SMTP_PASS)) {
  throw new Error("AUTH_EMAIL_SMTP_USER and AUTH_EMAIL_SMTP_PASS must be configured together.");
}
if (!usesExplicitEmailSmtp && (env.AUTH_EMAIL_SMTP_USER || env.AUTH_EMAIL_SMTP_PASS)) {
  throw new Error("SMTP credentials require AUTH_EMAIL_SMTP_HOST.");
}
const resolvedEmailSmtpHost = resolvedExplicitEmailSmtpHost ?? (resolvedResendApiKey ? "smtp.resend.com" : undefined);
const resolvedEmailSmtpPort = env.AUTH_EMAIL_SMTP_PORT ?? 587;
const resolvedEmailSmtpUser = usesExplicitEmailSmtp ? env.AUTH_EMAIL_SMTP_USER : resolvedResendApiKey ? "resend" : undefined;
const resolvedEmailSmtpPass = usesExplicitEmailSmtp ? env.AUTH_EMAIL_SMTP_PASS : resolvedResendApiKey;
const resolvedEmailSmtpName = env.AUTH_EMAIL_SMTP_NAME;
const resolvedEmailFrom = env.AUTH_EMAIL_FROM;
const s3Endpoint = normalizeUrl(env.S3_ENDPOINT);
const s3PublicBaseUrl = normalizeUrl(env.S3_PUBLIC_BASE_URL) ?? s3Endpoint;
const s3BucketPrefix = env.S3_BUCKET_PREFIX;
export const emailSmtpConfig = {
  host: resolvedEmailSmtpHost,
  port: resolvedEmailSmtpPort,
  name: resolvedEmailSmtpName,
  user: resolvedEmailSmtpUser,
  pass: resolvedEmailSmtpPass,
  from: resolvedEmailFrom,
} as const;
const hasEmailDeliveryConfig =
  Boolean(emailSmtpConfig.host) && Boolean(emailSmtpConfig.from);
const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
const taskSubteamIds = new Set([
  "programming",
  "mechanical",
  "electrical",
  "media-marketing",
  "business",
  "scouting",
]);

function parseMemberSubteamsByEmail(value: string | undefined) {
  const entries = value?.trim();
  if (!entries) {
    return {};
  }

  return entries.split(";").reduce<Record<string, string[]>>((mapping, entry) => {
    const [rawEmail, rawSubteams] = entry.split("=", 2);
    const email = rawEmail?.trim().toLowerCase();
    const subteams = rawSubteams
      ?.split(",")
      .map((subteam) => subteam.trim())
      .filter((subteam) => taskSubteamIds.has(subteam));

    if (email && subteams && subteams.length > 0) {
      mapping[email] = subteams;
    }

    return mapping;
  }, {});
}

export const authConfig = {
  enabled: Boolean(
    googleClientIds.length > 0 || hasEmailDeliveryConfig,
  ),
  googleClientId: googleClientIds[0] ?? null,
  googleClientIds,
  hostedDomain: env.GOOGLE_ALLOWED_HOSTED_DOMAIN.toLowerCase(),
  mentorEmails: new Set(parseCsv(env.AUTH_MENTOR_EMAILS).map((email) => email.toLowerCase())),
  memberSubteamsByEmail: parseMemberSubteamsByEmail(env.AUTH_MEMBER_SUBTEAMS_BY_EMAIL),
  emailEnabled: hasEmailDeliveryConfig,
  emailCodeTtlMinutes: env.AUTH_EMAIL_CODE_TTL_MINUTES,
  emailCodeLength: env.AUTH_EMAIL_CODE_LENGTH,
  emailCodeResendCooldownSeconds: env.AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
  emailMaxVerifyAttempts: env.AUTH_EMAIL_MAX_VERIFY_ATTEMPTS,
};

export const corsConfig = {
  origins: corsOrigins,
  allowsAnyOrigin: corsOrigins.length === 1 && corsOrigins[0] === "*",
} as const;

function assertProductionSecurityConfig() {
  if (env.NODE_ENV !== "production") {
    return;
  }


  if (!authConfig.enabled) {
    throw new Error(
      "Production deployments must configure either Google or SMTP sign-in before the server starts.",
    );
  }


  if (corsConfig.allowsAnyOrigin) {
    throw new Error(
      "Production deployments must set CORS_ORIGIN to one or more explicit origins.",
    );
  }

  if (env.CAD_STEP_PARSER_MODE === "placeholder") {
    throw new Error(
      "Production deployments cannot use CAD_STEP_PARSER_MODE=placeholder.",
    );
  }

  const credentialedUrls = {
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_PUBLIC_BASE_URL: env.S3_PUBLIC_BASE_URL,
    ONSHAPE_BASE_URL: env.ONSHAPE_BASE_URL,
    ONSHAPE_OAUTH_REDIRECT_URI: env.ONSHAPE_OAUTH_REDIRECT_URI,
    ONSHAPE_OAUTH_AUTHORIZATION_URL: env.ONSHAPE_OAUTH_AUTHORIZATION_URL,
    ONSHAPE_OAUTH_TOKEN_URL: env.ONSHAPE_OAUTH_TOKEN_URL,
  };
  for (const [name, value] of Object.entries(credentialedUrls)) {
    if (!value) {
      continue;
    }
    let protocol: string;
    try {
      protocol = new URL(value).protocol;
    } catch {
      throw new Error(`Production ${name} must be a valid HTTPS URL.`);
    }
    if (protocol !== "https:") {
      throw new Error(`Production ${name} must use HTTPS.`);
    }
  }
}

assertProductionSecurityConfig();

export const requestLimitConfig = {
  api: {
    maxRequests: env.API_RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.API_RATE_LIMIT_WINDOW_SECONDS * 1000,
  },
  auth: {
    maxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
  },
  authEmail: {
    maxRequests: env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS * 1000,
  },
} as const;

export const mediaUploadConfig = {
  enabled: Boolean(
    env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY &&
      env.S3_ENDPOINT &&
      env.S3_REGION &&
      (s3BucketPrefix || env.S3_BUCKET),
  ),
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  endpoint: s3Endpoint,
  publicBaseUrl: s3PublicBaseUrl,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  bucketPrefix: s3BucketPrefix,
  presignTtlSeconds: env.S3_PRESIGN_TTL_SECONDS,
  imageMaxBytes: env.MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  videoMaxBytes: env.MEDIA_VIDEO_UPLOAD_MAX_BYTES,
  quotaBytesPerHour: env.MEDIA_UPLOAD_QUOTA_BYTES_PER_HOUR,
} as const;

export const slackConfig = {
  enabled: Boolean(env.SLACK_BOT_TOKEN),
  botToken: env.SLACK_BOT_TOKEN,
  alertUsergroupHandles: parseCsv(env.SLACK_ALERT_USERGROUP_HANDLES),
  channels: {
    build: env.SLACK_CHANNEL_BUILD_ID,
    meetingPlansRecaps: env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID,
    programming: env.SLACK_CHANNEL_PROGRAMMING_ID,
    scoutingStrategy: env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID,
    transportationAttendance: env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID,
  },
} as const;

export const onshapeConfig = {
  enabled: Boolean(
    (env.ONSHAPE_OAUTH_CLIENT_ID &&
      env.ONSHAPE_OAUTH_CLIENT_SECRET &&
      env.ONSHAPE_OAUTH_REDIRECT_URI) ||
      env.ONSHAPE_OAUTH_ACCESS_TOKEN ||
      env.ONSHAPE_OAUTH_TOKEN ||
      env.ONSHAPE_OAUTH_REFRESH_TOKEN,
  ),
  baseUrl: normalizeUrl(env.ONSHAPE_BASE_URL) ?? "https://cad.onshape.com",
  oauthClientId: env.ONSHAPE_OAUTH_CLIENT_ID,
  oauthClientSecret: env.ONSHAPE_OAUTH_CLIENT_SECRET,
  oauthRedirectUri: env.ONSHAPE_OAUTH_REDIRECT_URI,
  oauthAuthorizationUrl: normalizeUrl(env.ONSHAPE_OAUTH_AUTHORIZATION_URL) ?? "https://oauth.onshape.com/oauth/authorize",
  oauthTokenUrl: normalizeUrl(env.ONSHAPE_OAUTH_TOKEN_URL) ?? "https://oauth.onshape.com/oauth/token",
  oauthScopes: parseCsv(env.ONSHAPE_OAUTH_SCOPES),
  oauthAccessToken: env.ONSHAPE_OAUTH_ACCESS_TOKEN ?? env.ONSHAPE_OAUTH_TOKEN,
  oauthRefreshToken: env.ONSHAPE_OAUTH_REFRESH_TOKEN,
  oauthTokenExpiresAt: env.ONSHAPE_OAUTH_TOKEN_EXPIRES_AT,
  credentialReference: env.ONSHAPE_CREDENTIAL_REFERENCE ?? null,
} as const;

export const cadPersistenceConfig = {
  storeDriver: env.CAD_STORE_DRIVER,
} as const;

export const cadStepUploadConfig = {
  maxBytes: env.CAD_STEP_UPLOAD_MAX_BYTES,
} as const;

export const cadStepParserConfig = {
  mode: env.CAD_STEP_PARSER_MODE,
  timeoutMs: env.CAD_STEP_PARSER_TIMEOUT_MS,
  maxConcurrency: env.CAD_STEP_PARSER_MAX_CONCURRENCY,
  maxQueue: env.CAD_STEP_PARSER_MAX_QUEUE,
  maxOldSpaceMb: env.CAD_STEP_PARSER_MAX_OLD_SPACE_MB,
  maxResultBytes: env.CAD_STEP_PARSER_MAX_RESULT_BYTES,
} as const;

export function resolveCadStepParserMode() {
  const requestedMode = process.env.CAD_STEP_PARSER_MODE;
  if (cadStepParserModes.some((mode) => mode === requestedMode)) {
    if (process.env.NODE_ENV === "production" && requestedMode === "placeholder") {
      throw new Error("Production deployments cannot use CAD_STEP_PARSER_MODE=placeholder.");
    }
    return requestedMode as (typeof cadStepParserModes)[number];
  }
  return cadStepParserConfig.mode;
}
