# Platform API Contributor Guide

This guide orients contributors to the Mission Control platform API route
layout, Prisma workflow, validation commands, auth/session model, and bootstrap
payload contract. Use `docs/backend-overview.md` for the wider backend map and
`docs/api-reference.md` for route lookup.

## Route Layout

The platform API is a Fastify TypeScript service. `src/server.ts` starts the
process, and `src/app.ts` builds the Fastify instance, registers global plugins
and security headers, resets runtime stores, and attaches route modules.

Core Mission Control routes live under `src/routes/`:

- `registerRoutes.ts` and adjacent route modules register the main planning,
  manufacturing, roster, report, risk, and bootstrap endpoints.
- `routeSchemas.ts` keeps shared request and response validation shapes.
- Helper modules in `src/routes/` handle pagination, selected bootstrap scope,
  task targets, task dependencies, roster insights, and link validation.

Auth routes live in `src/routes/authRoutes.ts` and use services under
`src/auth/`. CAD and Onshape routes live under `src/cad/` and `src/onshape/`
because their parsing, sync, and persistence logic is larger than a simple route
file.

When adding a route:

1. Define or reuse a Zod schema for the request and response shape.
2. Register the endpoint in the smallest relevant route module.
3. Enforce role/session requirements before mutating data.
4. Return the repo's standard envelopes, such as `{ item }` for creates and
   `{ items, pagination }` for collections.
5. Add route tests that cover success, validation failure, missing records, and
   auth restrictions.
6. Update `docs/api-reference.md` when the public route surface changes.

## Prisma Migration Flow

Prisma schema lives in `prisma/schema.prisma`. The current production-oriented
workflow uses `prisma db push` scripts rather than checked-in SQL migration
folders.

Use this flow for data-model changes:

1. Update `prisma/schema.prisma`.
2. Run `npm run prisma:generate` if generated client types are needed locally.
3. Use `npm run prisma:deploy` for compatible schema pushes.
4. Never add `--accept-data-loss` to routine deployment or application startup. A destructive schema change requires a separately reviewed maintenance procedure and a verified restore point.
5. Document backfill, deploy order, rollback, and validation notes in the PR.
6. Add or update tests that prove runtime and Prisma-backed paths stay aligned.

Do not rely on runtime stores as a substitute for persisted behavior when the
feature is expected to survive restart or production deploys.

## Test And Verification Commands

Use targeted tests while developing, then run broader validation before handoff.

Common commands:

```bash
npm run typecheck
npm run typecheck:test
npm run test
npm run build
npm run verify
```

`npm test` discovers every `test/**/*.test.ts` file, including web-session and
workflow tests. No filename list needs updating when adding a test. To filter by
name, use `npm test -- --test-name-pattern="your scenario"`.

`npm run verify` runs bootstrap contract verification, Prisma client generation,
test TypeScript checks, the complete test suite, and the production build
(which checks source types as it compiles). Route-specific changes should include focused tests before the full suite.

For bootstrap contract changes, run:

```bash
npm run contracts:verify
```

When changing production health or deploy behavior, use `npm run smoke:test` if
the required environment is available and document any environment assumptions.

## Auth And Session Model

Auth is enabled when `AUTH_JWT_SECRET` is configured and at least one supported
sign-in path is configured. Production requires enabled auth and explicit CORS
origins.

Supported auth paths include:

- Google ID token exchange through `POST /api/auth/google`.
- Email-code start and verify through `/api/auth/email/*`.
- Non-production development bypass through `POST /api/auth/dev-bypass`.

API requests use bearer tokens. Protected routes should reject missing, expired,
or unauthorized sessions instead of returning partial data. Permission checks
must be enforced on the platform even when the web or mobile clients hide a
control.

Use the existing role model for mentor, lead, admin, and student behavior.
The current development bypass creates the fixed local student session and
rejects custom payload fields; it is not a production authorization mechanism.

When adding auth-sensitive behavior:

- Test missing session, expired session, insufficient role, and allowed role.
- Keep raw tokens, secrets, and refresh credentials out of responses.
- Return user-readable validation and auth errors without leaking secret state.
- Coordinate frontend session-expiry behavior when a route can return `401`.

## Bootstrap Payload Shape

`GET /api/bootstrap` is the primary hydration contract for web and mobile. It
returns selected season/project workspace data and must remain internally
consistent.

The bootstrap payload can include seasons, projects, members, subsystems,
disciplines, mechanisms, part definitions, part instances, materials,
manufacturing items, purchases, tasks, dependencies, blockers, events,
milestones, work logs, QA records, reports, risks, audit actions, and supporting
metadata.

When changing bootstrap data:

1. Update the platform source data, selectors, and response shape together.
2. Preserve existing tutorial IDs and compatibility fields unless the consuming
   clients are updated in the same release path.
3. Run `npm run contracts:verify`.
4. Update web and mobile types or normalization where needed.
5. Add tests for selected season/project scope and empty or newly-created
   season behavior.

The platform should be the source of truth. Client-side bootstrap normalization
is useful for compatibility, but new backend work should tighten and document
the server contract instead of expanding client-side patching indefinitely.

## Documentation Updates

Update `docs/api-reference.md` for route, method, auth, or response changes.
Update `docs/backend-overview.md` for source layout, runtime, environment, or
deployment assumptions. Update CAD and Onshape docs when those integration
contracts change.

For documentation-only PRs, confirm the diff is scoped:

```bash
git diff -- docs
```
