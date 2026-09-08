# MECO Mission Control Platform

Backend API for MECO Mission Control manufacturing, planning, and operations workflows.

## Hosting direction

This repo now targets a self-managed Linux VPS instead of App Platform.

The current recommended low-cost target is:

- `Hetzner CX23` in Germany for the cheapest sensible x86 starting point

The deployment path is intentionally provider-neutral, so the same repo can also run on:

- Hetzner
- DigitalOcean Droplets
- Vultr
- nearly any Ubuntu VPS with Docker installed

That keeps costs down and gives you one inexpensive box for:

- the Fastify API
- PostgreSQL
- Docker-based deployment

For an MVP, `1 vCPU / 2 GB RAM` is the minimum I’d be comfortable with when Node and Postgres are sharing one machine.

## Included in this starter

- Fastify + TypeScript API shell with typed route responses
- Completion-gating logic for work logs, mentor QA approval, and documentation evidence
- Prisma schema for web/mobile sessions and CAD persistence; core workspace data uses the platform snapshot model
- `docker-compose.prod.yml` for API + Postgres on one VPS
- GitHub Actions workflow that deploys over SSH to the VPS
- `deploy/bootstrap-vps.sh` for first-time Docker setup on Ubuntu

## API endpoints

- `GET /health`
- `GET /api/auth/config`
- `POST /api/auth/google`
- `POST /api/auth/email/start`
- `POST /api/auth/email/verify`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/home`
- `POST /api/media/presign-upload`
- `GET /api/tasks`
- `GET /api/meetings`
- `GET /api/manufacturing`
- `GET /api/purchases`
- `GET /api/qa`
- `GET /api/metrics`

## Request protection

- The server enforces a 64 KB JSON body limit to reject oversized payloads early.
- `GET /api/*` requests are rate limited per IP so a single client cannot flood the API.
- Auth routes have their own per-IP budget, and the email sign-in flow uses a stricter limit.
- Email verification still keeps its existing per-address cooldown and wrong-code attempt cap.
- Tuning knobs live in `API_RATE_LIMIT_MAX_REQUESTS`, `AUTH_RATE_LIMIT_MAX_REQUESTS`, and `AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS` plus their matching `*_WINDOW_SECONDS` settings.

## Local commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run smoke:test
```

## Repository labels

Use the shared Mission Control label vocabulary when filing or triaging issues.
Every issue should have at least one area label, one type label, and one
priority label. Add a workflow label when the issue is blocked or waiting on
design input.

Area labels:

- `area:platform` - platform API, persistence, auth, deployment, or backend operations.
- `area:docs` - repository documentation, runbooks, checklists, or contributor guidance.
- `area:backend` - API contracts, route behavior, service logic, or server integrations.
- `area:data` - seed data, fallback data, bootstrap records, or data integrity.
- `area:qa` - test coverage, smoke checks, validation workflows, or release verification.

Type labels:

- `type:bug` - incorrect behavior or regression.
- `type:feature` - new user-facing behavior or workflow.
- `type:tech-debt` - cleanup, refactor, dependency, or maintainability work.
- `type:docs` - documentation-only work.
- `type:test` - test-only or validation-only work.

Priority labels:

- `priority:p0` - production-blocking or release-blocking.
- `priority:p1` - high-impact work needed soon.
- `priority:p2` - normal backlog priority.
- `priority:p3` - low-priority polish or follow-up.

Workflow labels:

- `blocked` - cannot proceed until an external dependency is resolved.
- `needs-design` - needs UI, content, or workflow design input before implementation.

## Local env example

Use this shape for a local `.env` file when the web app is running on Vite's
default `http://localhost:5173` origin:

```env
NODE_ENV=development
PORT=8080
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public
API_RATE_LIMIT_MAX_REQUESTS=300
API_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_RATE_LIMIT_MAX_REQUESTS=60
AUTH_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS=10
AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS=60
GOOGLE_CLIENT_ID=your-local-or-primary-google-client-id.apps.googleusercontent.com
# AUTH_JWT_SECRET=
GOOGLE_ALLOWED_HOSTED_DOMAIN=mecorobotics.org
AUTH_TOKEN_TTL=1h
AUTH_LEGACY_BEARER_ENABLED=false
# AUTH_LEGACY_BEARER_CUTOFF=2026-09-01T00:00:00Z
# Legacy mobile JWT issuance is disabled unless explicitly enabled for a bounded migration.
AUTH_DEVICE_TOKEN_TTL=3650d
AUTH_LEGACY_MOBILE_JWT_ENABLED=false
# AUTH_LEGACY_MOBILE_JWT_CUTOFF=2026-09-01T00:00:00Z
# Manage member roles, external access, and subteam preferences through the apps.
# AUTH_MENTOR_EMAILS=mentor.one@mecorobotics.org,mentor.two@mecorobotics.org
# Local SMTP sink for email-code testing.
AUTH_EMAIL_SMTP_HOST=127.0.0.1
AUTH_EMAIL_SMTP_PORT=1025
AUTH_EMAIL_FROM="MECO Robotics <no-reply@mecorobotics.org>"
AUTH_EMAIL_CODE_TTL_MINUTES=10
AUTH_EMAIL_CODE_LENGTH=6
AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS=60
AUTH_EMAIL_MAX_VERIFY_ATTEMPTS=5
S3_ACCESS_KEY_ID=your-s3-access-key
S3_SECRET_ACCESS_KEY=your-s3-secret-key
S3_ENDPOINT=https://your-s3-endpoint.example
S3_PUBLIC_BASE_URL=https://your-public-cdn-or-bucket-host.example
S3_REGION=us-east-1
S3_BUCKET_PREFIX=meco-pm
S3_PRESIGN_TTL_SECONDS=300
MEDIA_IMAGE_UPLOAD_MAX_BYTES=15728640
MEDIA_VIDEO_UPLOAD_MAX_BYTES=262144000
MEDIA_UPLOAD_QUOTA_BYTES_PER_HOUR=1073741824
CAD_STEP_UPLOAD_MAX_BYTES=33554432
CAD_STEP_PARSER_MAX_CONCURRENCY=2
CAD_STEP_PARSER_MAX_QUEUE=4
CAD_STEP_PARSER_MAX_OLD_SPACE_MB=256
CAD_STEP_PARSER_MAX_RESULT_BYTES=16777216
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_ALERT_USERGROUP_HANDLES=allmentors,allstudents
SLACK_CHANNEL_BUILD_ID=C03171JMMB4
SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID=C03MXBFGAM6
SLACK_CHANNEL_PROGRAMMING_ID=C02BLURKRED
SLACK_CHANNEL_SCOUTING_STRATEGY_ID=C05SW57962E
SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID=C088N9VC6H4
```

If you keep separate Google OAuth clients for local and production, you can
comma-separate them in `GOOGLE_CLIENT_ID` and put the client you want the web
app to use first.

To inspect local email deliveries, run the bundled SMTP sink in another
terminal:

```bash
npm run smtp:dev
```

It listens on `127.0.0.1:1025` and logs each received message to the console so
you can copy the sign-in code during local testing.

When the server runs with auth configured outside production, it also exposes a
development-only `/api/auth/dev-bypass` endpoint that the web app can use for a
local access button. Send either an empty request body for the default local
student session or `{ "role": "student" | "mentor" }` to test a specific local
role. Production builds do not register that route.

## Production files

- `docker-compose.prod.yml`: production stack for the VPS
- `.env.production`: runtime environment file on the VPS
- `.github/workflows/deploy-vps.yml`: CI + deployment workflow
- `deploy/bootstrap-vps.sh`: first-time Docker bootstrap for Ubuntu
- `docs/platform-deployment-recovery.md`: production env, VPS deploy path, backups, restore expectations, and rollback options
- `docs/production-smoke-test-checklist.md`: production smoke-test checklist
- `docs/backup-restore-drill.md`: backup command, disposable restore target, restore verification, and failure handling

## First-time VPS setup

1. Create an Ubuntu VPS.
2. If you want the cheapest suggested option, start with `Hetzner CX23`.
3. SSH into it as your deploy user.
4. Run `deploy/bootstrap-vps.sh` once.
5. Make sure `/opt/pm-server` exists and is writable by your deploy user.
6. Configure a TLS reverse proxy and firewall before enabling production traffic. The API container binds only to loopback and must not be exposed directly.

## Required GitHub secrets

Add these secrets to `MECO-Robotics/meco-mission-control-platform`:

- `VPS_HOST`: public IP or hostname of the server
- `VPS_USER`: deploy user, for example `root` or `deploy`
- `VPS_SSH_KEY`: private SSH key used by GitHub Actions
- `VPS_SSH_KNOWN_HOSTS`: reviewed `known_hosts` entry for the production VPS
- `PRODUCTION_ENV_FILE`: full contents of the `.env.production` file, including SMTP settings if you want email sign-in enabled
- `RESEND_API_KEY`: optional Resend API key for email sign-in

## Example production env file

Use this shape for the `PRODUCTION_ENV_FILE` secret:

```env
NODE_ENV=production
PORT=8080
PUBLIC_PORT=8080
POSTGRES_DB=meco_platform
POSTGRES_USER=meco
POSTGRES_PASSWORD=change-this
DATABASE_URL=postgresql://meco:change-this@postgres:5432/meco_platform?schema=public
# Production deployments must use explicit web origins. Use a comma-separated list if needed.
CORS_ORIGIN=https://your-web-domain.example
API_RATE_LIMIT_MAX_REQUESTS=300
API_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_RATE_LIMIT_MAX_REQUESTS=60
AUTH_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS=10
AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS=60
GOOGLE_ALLOWED_HOSTED_DOMAIN=mecorobotics.org
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
# AUTH_JWT_SECRET=
AUTH_TOKEN_TTL=1h
AUTH_LEGACY_BEARER_ENABLED=false
# AUTH_LEGACY_BEARER_CUTOFF=2026-09-01T00:00:00Z
# Legacy mobile JWT issuance is disabled unless explicitly enabled for a bounded migration.
AUTH_DEVICE_TOKEN_TTL=3650d
AUTH_LEGACY_MOBILE_JWT_ENABLED=false
# AUTH_LEGACY_MOBILE_JWT_CUTOFF=2026-09-01T00:00:00Z
# Manage member roles, external access, and subteam preferences through the apps.
# AUTH_MENTOR_EMAILS=mentor.one@mecorobotics.org,mentor.two@mecorobotics.org
AUTH_EMAIL_SMTP_HOST=smtp.your-provider.example
AUTH_EMAIL_SMTP_PORT=587
AUTH_EMAIL_SMTP_USER=your-smtp-username
AUTH_EMAIL_SMTP_PASS=your-smtp-password
AUTH_EMAIL_FROM="MECO Robotics <no-reply@mecorobotics.org>"
AUTH_EMAIL_CODE_TTL_MINUTES=10
AUTH_EMAIL_CODE_LENGTH=6
AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS=60
AUTH_EMAIL_MAX_VERIFY_ATTEMPTS=5
S3_ACCESS_KEY_ID=your-s3-access-key
S3_SECRET_ACCESS_KEY=your-s3-secret-key
S3_ENDPOINT=https://your-s3-endpoint.example
S3_PUBLIC_BASE_URL=https://your-public-cdn-or-bucket-host.example
S3_REGION=us-east-1
S3_BUCKET_PREFIX=meco-pm
S3_PRESIGN_TTL_SECONDS=300
MEDIA_IMAGE_UPLOAD_MAX_BYTES=15728640
MEDIA_VIDEO_UPLOAD_MAX_BYTES=262144000
MEDIA_UPLOAD_QUOTA_BYTES_PER_HOUR=1073741824
CAD_STEP_UPLOAD_MAX_BYTES=33554432
CAD_STEP_PARSER_MAX_CONCURRENCY=2
CAD_STEP_PARSER_MAX_QUEUE=4
CAD_STEP_PARSER_MAX_OLD_SPACE_MB=256
CAD_STEP_PARSER_MAX_RESULT_BYTES=16777216
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_ALERT_USERGROUP_HANDLES=allmentors,allstudents
SLACK_CHANNEL_BUILD_ID=C03171JMMB4
SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID=C03MXBFGAM6
SLACK_CHANNEL_PROGRAMMING_ID=C02BLURKRED
SLACK_CHANNEL_SCOUTING_STRATEGY_ID=C05SW57962E
SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID=C088N9VC6H4
```

## Google SSO

Google Identity Services sends a Google ID token to the web app, and the web app exchanges that token with `POST /api/auth/web/google`.

- The server verifies the Google token against `GOOGLE_CLIENT_ID`.
- The server enforces the hosted-domain check with `GOOGLE_ALLOWED_HOSTED_DOMAIN`.
- Browser sign-in creates a 12-hour revocable server session and an HttpOnly, SameSite=Lax cookie. Unsafe cookie-authenticated API requests also require the session CSRF token and an allowed Origin.
- Mobile email sign-in uses a per-install device ID to create a revocable server-side session. Access tokens last one hour, sessions expire after 30 days without a refresh or after 90 days absolutely, and refresh tokens rotate on every use.
- Manage mentor/admin roles, external access emails, and member details through the roster Config/Directory UI. Hosted-domain users not present in the roster default to student access unless listed in `AUTH_MENTOR_EMAILS` for first-operator bootstrap access.
- User subteam choices are stored through `PATCH /api/users/me/preferences` in `data/user-preferences.json`; they are no longer configured through server env email maps.
- The server does not need a Google client secret for this flow.
- For localhost development, add your frontend origin such as `http://localhost:5173` to the OAuth web client's Authorized JavaScript origins in Google Cloud Console.
- If you use separate Google OAuth client IDs for local and production, set `GOOGLE_CLIENT_ID` to a comma-separated list and put the client ID you want the frontend to use first.

For production, the web origin must be configured in the Google Cloud Console OAuth client and served over HTTPS before SSO is enabled on the public site.
If you only have a static IP, use a mapped HTTPS hostname (for example `178-104-192-162.nip.io` or `178-104-192-162.sslip.io`) while testing and add that exact HTTPS origin in the OAuth client.

## Mobile session API

`POST /api/auth/mobile/email/verify` accepts `{ email, code, deviceId, deviceName? }` and returns the access token as `token`, a single-use `refreshToken`, both expiry timestamps, the device-session summary, and `user`. Refresh with `POST /api/auth/mobile/refresh`; each successful refresh invalidates the previous access and refresh credentials. Reusing an already consumed refresh token revokes the whole device session.

Authenticated mobile clients can use `GET /api/auth/mobile/sessions`, `DELETE /api/auth/mobile/sessions/:sessionId`, `POST /api/auth/mobile/logout`, and `POST /api/auth/mobile/logout-all`. The platform stores only SHA-256 token hashes. Bounded background-on-use cleanup retains invalid token rows for seven days and device-session metadata for 30 days.

Legacy `/api/auth/email/verify` requests containing `deviceId` receive HTTP 426 with code `mobile_client_upgrade_required` unless `AUTH_LEGACY_MOBILE_JWT_ENABLED=true` and the optional `AUTH_LEGACY_MOBILE_JWT_CUTOFF` is still in the future. Legacy non-mobile bearer issuance and replay are disabled in production unless `AUTH_LEGACY_BEARER_ENABLED=true` and its optional UTC cutoff is still active. Keep either exception time-bounded.

## Web session API

Browser clients use `POST /api/auth/web/google`, `POST /api/auth/web/email/verify`, `GET /api/auth/web/session`, and `POST /api/auth/web/logout`. Non-production builds also expose `POST /api/auth/web/dev-bypass`. The session token is stored only in an HttpOnly cookie; the response returns an in-memory CSRF token for unsafe API methods. Logout revokes the server record before clearing the cookie.

## Email sign-in fallback

If you add SMTP settings with `AUTH_EMAIL_SMTP_HOST` and `AUTH_EMAIL_FROM`, or set `RESEND_API_KEY` with `AUTH_EMAIL_FROM`, the server will also expose `POST /api/auth/email/start` and `POST /api/auth/email/verify`.

Brevo SMTP settings:
- `AUTH_EMAIL_SMTP_HOST=smtp-relay.brevo.com`
- `AUTH_EMAIL_SMTP_PORT=587`
- `AUTH_EMAIL_SMTP_USER`: Brevo SMTP login from the SMTP page
- `AUTH_EMAIL_SMTP_PASS`: Brevo SMTP key
- `AUTH_EMAIL_FROM`: verified Brevo sender, for example `"MECO Robotics <no-reply@mecorobotics.org>"`

Resend-specific settings:
- `RESEND_API_KEY`: set in GitHub Secrets as `RESEND_API_KEY` to keep this credential out of the `.env.production` secret blob
- `AUTH_EMAIL_FROM="MECO Robotics <no-reply@mecorobotics.org>"`

When `RESEND_API_KEY` is present and no explicit `AUTH_EMAIL_SMTP_HOST` is configured, the server uses:
- host: `smtp.resend.com`
- user: `resend`
- password: API key value
- Explicit `AUTH_EMAIL_SMTP_*` settings from `PRODUCTION_ENV_FILE` take precedence over this fallback.
- Your `AUTH_EMAIL_FROM` address must use a domain verified in your Resend account (for example, verify `mecorobotics.org` at resend.com/domains).

- The address must end in `@mecorobotics.org` unless you change `GOOGLE_ALLOWED_HOSTED_DOMAIN`.
- On localhost, the bundled SMTP sink gives you a no-password listener at `127.0.0.1:1025`.
- The server sends a one-time code to the entered address. Supported web and mobile clients exchange it through their dedicated session endpoints.
- Pending codes are stored in memory, so a server restart clears them.

## Deployment behavior

Use `docs/platform-deployment-recovery.md` as the canonical operator runbook for
production env, VPS deploy path, backups, restore expectations, and rollback
options.

On every push to `main`, GitHub Actions will:

1. install dependencies
2. typecheck and build the server
3. validate the Prisma schema
4. verify the reviewed VPS host key and connect over SSH
5. create and validate file, environment, and database backups; any required backup failure stops deployment
6. sync the repo to `/opt/pm-server` and write `.env.production`
7. start PostgreSQL, build the new application image, apply the Prisma schema from that image, then start the application
8. check `/health` through the loopback-bound API port

The server refuses to start in production unless authentication is configured and `CORS_ORIGIN` is an explicit allowlist.

Schema application is an explicit pre-start deployment step. The application container does not use `--accept-data-loss` and does not modify the schema on ordinary restarts.

### Tutorial fixture dates

Fresh seed data and tutorial starts/baseline resets use the current UTC month and Monday–Sunday week. Seasons span the month; fixture activity is scaled chronologically into the part of the week inside that month, including month/year boundaries. Each start/reset reads the clock again; active sessions keep their dates and edits until reset. Session exit still restores the pre-tutorial workspace. Stored application data is not re-dated.
