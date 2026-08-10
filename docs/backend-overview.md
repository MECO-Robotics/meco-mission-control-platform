# Backend Overview

This document orients contributors to the Mission Control backend codebase. Use `docs/api-reference.md` for route lookup, `docs/cad-step-mapping.md` for STEP import behavior, and `docs/onshape-integration.md` for Onshape-specific workflow details.

## Runtime

- The server is a Fastify TypeScript API with the entry point in `src/server.ts`.
- `src/app.ts` builds the Fastify instance, registers CORS and multipart handling, applies security headers, resets runtime stores on startup, and registers all routes.
- The default port is `8080`, controlled by `PORT`.
- JSON request bodies use Fastify's `2 MiB` body limit.
- STEP multipart uploads use the separate `CAD_STEP_UPLOAD_MAX_BYTES` limit, defaulting to `250 MiB`.

## Source Layout

- `src/routes/` contains the main Mission Control route registration, route schemas, route helpers, and small helper modules for bootstrap selection, pagination, task targets, link validation, and roster insights.
- `src/data/` contains the current seeded snapshot store and TypeScript input types for core platform entities.
- `src/domain/` contains shared workflow, task dependency, discipline, and platform type logic.
- `src/auth/` contains Google, email-code, JWT session, and development-bypass auth behavior.
- `src/security/` contains request limit guards.
- `src/storage/` contains S3-compatible presigned upload support.
- `src/slack/` contains Slack home and alert-adjacent service logic.
- `src/cad/` contains generic CAD import, STEP parsing, mapping, diff, hierarchy review, Prisma/runtime store selection, and CAD routes.
- `src/onshape/` contains Onshape URL parsing, OAuth, request budgeting, BOM import normalization, and Onshape routes.

## Data Model

- The main app state starts from `src/data/mockData.ts` and is reset during app creation.
- Core platform reads and writes go through `src/data/store.ts`.
- Per-user preferences are stored outside git in `data/user-preferences.json`.
- Member roles and external access emails are managed through roster records, while subteam preferences are stored per user.
- Prisma schema lives in `prisma/schema.prisma` and includes core planning/manufacturing entities plus CAD import tables.
- Work logs record an optional creator, manufacturing review records include reviewer/time metadata, and purchase approval records include the derived approver and workflow timestamps. Existing rows remain valid with null metadata until their next protected workflow action.
- Generic CAD import persistence defaults to Prisma through `CAD_STORE_DRIVER=prisma`.
- Runtime CAD storage remains available through `CAD_STORE_DRIVER=runtime` for tests and compatibility flows.
- The Onshape MVP route path currently stores runtime Onshape data separately from the generic CAD Prisma store.

## Authentication And Security

- Auth is enabled when `AUTH_JWT_SECRET` is configured and either Google client IDs or email delivery config are available.
- Production startup requires enabled auth and explicit `CORS_ORIGIN` values.
- Google sign-in verifies Google Identity Services ID tokens against `GOOGLE_CLIENT_ID` and `GOOGLE_ALLOWED_HOSTED_DOMAIN`.
- Email sign-in can use explicit SMTP settings or Resend SMTP via `RESEND_API_KEY`.
- Non-production builds register `POST /api/auth/dev-bypass` when auth is configured, with student and mentor role modes for local permission testing.
- API, auth, and email-auth requests use separate per-IP rate limit budgets.
- API responses get no-store cache headers, content sniffing protection, frame denial, referrer policy, permissions policy, and production HSTS.
- Work-log mutation and purchase/manufacturing approval or deletion require mentor/admin roles; leads do not inherit these safety and financial permissions. Manufacturing progress may be advanced by any internal user only after active mentor review.

## Audit Retention

Mission Control audit history is a safety and accountability record for team operations. It should remain available long enough to support season reviews, incident follow-up, and mentor oversight while avoiding indefinite retention of student activity records.

- Keep audit history for active seasons and for three years after the season end date.
- If a season has no configured end date, measure the three-year retention window from the last day of that calendar year.
- Keep audit history tied to an open safety, financial, compliance, or conduct review until that review is closed, even if the normal retention window has elapsed.
- Review retained audit history at least once per year before the next competition season begins.
- Treat audit history as student activity data when it contains member names, emails, task ownership, work logs, QA decisions, or roster changes.
- Do not export audit history to public channels, training data, or shared documents unless student identifiers are removed or the export is limited to approved mentors/admins.
- Prefer redacted summaries for retrospectives and public season reports.
- Delete or anonymize audit records after the retention window unless a documented review hold still applies.
- Do not store authentication secrets, OAuth tokens, email codes, or raw private media in audit details. Audit details should reference the affected entity and summarized field changes only.
- Archived seasons keep audit history read-only for review; archive operations must not silently drop audit history that is still inside the retention window.
- Deletion after the retention window should remove or anonymize member-identifying audit fields, including actor, member, email, and free-text details that identify a student.
- Deletion should preserve aggregate counts only when they no longer identify individual students.
- Backup retention should not intentionally extend audit history beyond this policy. Expired records may remain in immutable backups until those backups age out under the deployment recovery policy.
- The current bootstrap payload includes scoped audit actions for authenticated, non-external users, so audit details must remain minimal and non-sensitive.
- Bulk export, retention override, archive, and deletion tools are admin-only operations.
- Admins should record the reason for retention overrides, review holds, and manual deletions.
- Exported audit files should include the export timestamp, requesting admin, filters, and redaction mode.
- New audit routes should enforce role checks before returning audit data and should support season/project, entity type, date range, and redaction filters where relevant.
- Retention jobs should run in dry-run mode before deletion and report the seasons, date ranges, and record counts affected.
- Tests for retention or export behavior should cover role restrictions, date boundaries, review holds, and redaction of student-identifying fields.

## Integrations

- S3-compatible storage powers image and video presign routes when all required `S3_*` settings are configured. Media buckets are derived per project team as `<S3_BUCKET_PREFIX>-<teamId>`; legacy `S3_BUCKET` is still accepted as the prefix.
- Slack support is enabled by `SLACK_BOT_TOKEN` and channel/usergroup environment variables.
- STEP CAD imports run through `StepParserClient`, parser mode config, mapping review, hierarchy validation, and snapshot finalization.
- Onshape integration uses OAuth, saved document references, sync estimates, request logs, runtime budget tracking, and explicit sync runs.
- Deep-release Onshape sync and OAuth credential management are restricted to leads, mentors, and admins when auth is enabled.

## Local Workflow

- Install dependencies with `npm install`.
- Run the API in watch mode with `npm run dev`.
- Run the local SMTP sink with `npm run smtp:dev` when testing email-code sign-in.
- Use `.env.example` as the local environment shape.
- Run `npm run typecheck` for TypeScript-only validation.
- Run `npm run test` for the Node test suite.
- Run `npm run verify` before handing off larger backend changes.

## Deployment

- Production is designed for one self-managed Linux VPS running Docker.
- `docker-compose.prod.yml` starts the API and PostgreSQL services.
- `deploy/bootstrap-vps.sh` prepares a first-time Ubuntu VPS with Docker.
- `.env.production.example` documents the runtime environment shape.
- Production should deploy only from `main`, release tags, or an explicit release manifest.
- `docs/platform-deployment-recovery.md` is the canonical runbook for production env, VPS deploy path, backup behavior, restore expectations, and rollback options.
- Take VPS backups immediately before production deploys, including files, environment, and database dump.

## Documentation Maintenance

- Update `docs/api-reference.md` when a route is added, removed, renamed, or changes auth behavior.
- Update `docs/cad-step-mapping.md` when STEP parser behavior, CAD store selection, mapping review, diffing, or finalization changes.
- Update `docs/onshape-integration.md` when OAuth, document references, sync levels, Onshape budgets, or Onshape route behavior changes.
- Update `docs/platform-deployment-recovery.md` when production env, deploy, backup, restore, or rollback behavior changes.
- Update this overview when top-level source layout, runtime assumptions, required environment variables, deployment workflow, audit retention policy, or verification commands change.
- Keep Word requirement/spec snapshots as historical source artifacts; do not use them as the only living docs for implemented behavior.
