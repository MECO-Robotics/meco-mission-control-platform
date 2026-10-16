# Contributing

Follow the [shared contribution conventions](https://github.com/MECO-Robotics/mission-control-skills/blob/development/CONTRIBUTING.md). This page covers platform-specific setup and checks.

## Setup

Use Node.js 22 (see `.nvmrc`), npm and PostgreSQL. Bash is needed for the optional shell scripts; Windows contributors can use Git Bash or WSL.

```sh
npm ci
cp .env.example .env
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

Before applying the schema, create the local database and set `DATABASE_URL` in `.env`. Review the example settings for your local services; do not use production credentials. The API listens on port 8080 by default. See [README](README.md) for authentication and the optional `npm run smtp:dev` email sink. Core workspace state uses snapshots; Prisma owns sessions and CAD persistence.

Task records and commands use `workstreamIds`, `subsystemIds`, `mechanismIds` and `partInstanceIds`; stored records require all four arrays. Artifact associations are authoritative on each artifact's `targetRefs`, not in a task `artifactIds` array. PATCH omission retains existing targets and explicit arrays replace the selected set. Nested part/mechanism targets still infer their required ancestors. Workstreams are independent selections and are never inferred from subsystem names. A normalized completion-relevant scope change requires a newly reviewed mentor QA pass ordered after the change before the task can complete. Bootstrap may return the optional server-owned `completionScopeReviewOrder` watermark; it is output metadata, not command input. Legacy snapshots without it continue to load unchanged, with no reset required.

Snapshots containing malformed JSON, incompatible schema versions, singular task target fields, missing target arrays or duplicate target IDs fail startup and remain unchanged. Startup never archives or reseeds an existing invalid snapshot. Review and back up the file first. To explicitly archive it and bootstrap a fresh canonical seed, stop the API, then run the following from the repository root with the same environment used by the API and restart:

```sh
npm run snapshot:reset
```

The reset command preserves the original bytes in a timestamped archive; it does not migrate or reset Prisma or CAD storage. A fresh snapshot retains writes across ordinary restarts in development and production.

## Validation

Run `npm run verify` for application, package or CI changes. It verifies the bootstrap contract, generates Prisma, checks test types, runs the test suite and builds the server; do not repeat those steps separately on the same revision. Use `npm test` for focused test iteration. Integration tests own temporary preference files; `buildApp({ userPreferencesPath })` selects their storage. Ordinary application startup retains `data/user-preferences.json`, and reopening that path retains saved preferences. Set `TEST_DATABASE_URL` to an isolated, bootstrapped PostgreSQL database when running `npm run verify` to include the production mobile-session persistence/competition test. Without it, that scenario is explicitly skipped. Schema changes also require `npx prisma validate` and a clean-database bootstrap/persistence check. Deployment changes require the relevant workflow tests and compose validation described in the [operator runbook](docs/platform-deployment-recovery.md).

`buildApp` creates independent runtime CAD and Onshape owners. Its platform owner is durable in every NODE_ENV: it loads the resolved snapshot at construction and atomically commits each successful global mutation before sending the HTTP response. Apps using that same resolved file share their workspace coordinator and mutation queue. Direct domain operations should create a `createPlatformStore()` owner, pass it as `buildApp({ platformStore })`, and execute operations inside `platformStore.run(...)`. Tests and previews must explicitly use `createPlatformStore({ durability: "memory" })`, which neither loads nor writes the configured/default snapshot. Task commands own target inference and link/people validation; routes own authorization and request parsing. Task creation and updates publish their normalized records and audit entry together. Subsystem/mechanism creation retains automatic integration/wiring tasks: contributors come from eligible active parent people, or the explicit command actor when that actor is a student/lead or mentor. Without a legal contributor, creation fails before publishing the structure, task or audit entries; direct scripts must supply an actor or assigned parent. Generated wiring and integration tasks require their exact active WorkType; an absent/inactive workflow rejects creation rather than assigning an unrelated type.

Durable owners strictly load and validate an existing snapshot during construction; an invalid file causes startup to fail without modifying or archiving it. A snapshot is seeded only when its configured path is absent. Snapshot commits write a same-directory temporary file and atomically rename it over the authoritative snapshot before publishing the in-memory owner state. If that write fails, the request receives an error and the staged mutation remains unpublished; an orphaned `*.tmp` file is ignored during recovery. This provides process-restart durability after a completed commit, but does not fsync file and directory metadata, so it does not promise survival of sudden power or storage failure. Coordination is process-local; run one API process per snapshot path.

The dependency lock includes patched Fastify, multipart parser and URI parser releases. `deepmerge-ts` is overridden to 8.0.0 for the Prisma configuration dependency's recursive-graph exhaustion fix; keep Prisma generation and configuration validation in the verification path when updating this override.

Route schemas define PATCH omission: absent fields retain saved values; explicit empty arrays, nulls and false values follow the field’s domain rules. Share constraints through field schemas without defaults, then add defaults only to create schemas. Do not derive PATCH schemas from schemas containing defaults: Zod 4 can apply those defaults inside optional fields. Keep unknown-field policies and create-only fields explicit, and verify unrelated fields survive a partial HTTP update.

For documentation-only changes, check links, documented commands and `git diff --check`. Record what ran and any limitations in the PR. Never substitute a lower test count for evidence of simplification.

## Pull requests

Use a dedicated worktree and a `feature/*`, `fix/*` or `hotfix/*` branch targeting `development`. Promote reviewed integration changes from `development` to `main` by PR. Existing staging branches accept stabilization PRs from `fix/*` or `hotfix/*`; do not edit promotion branches directly.

The stable `merge-requirements` status enforces branch strategy, CI and snapshot validation; main promotion also requires cross-repository integration health. Preserve configured approving reviews and conversation resolution. Automated review comments do not count as approvals.

Describe the problem, resulting behavior and validation. Include contract changes and affected web/mobile consumers, environment changes, or schema reset/deployment commands when relevant. Prototype data may be discarded explicitly; document what is lost. Keep deployment/recovery guidance accurate before real use.

## Optional shared skills

[Shared skills](docs/shared-skills.md) are ignored local imports, not application or CI dependencies. Edit their canonical repository through its contribution process; never commit imported copies here.

Graphify output is local tooling state under ignored `graphify-out/`. Query an existing graph before browsing source and run `graphify update .` after code changes. Keep generated graphs, caches and diagnostics out of commits; record maintained architecture guidance in `docs/` instead.

Calendar commands accept ISO local or offset datetime strings and validate the merged start/end interval before publishing. Cross-project subsystem/mechanism moves return 409; create structure in the destination project instead. Part definitions referenced by manufacturing work return 409 on deletion until that work is retargeted or removed. Deleting hierarchy removes dependencies owned by deleted tasks; remaining hard dependencies retain their missing target and stay blocked.

Purchase approval and order metadata use dedicated commands. `POST /api/purchases/:id/transition` accepts the current order state to edit `finalCost` and `purchaseOrderNumber`; repeated state commands preserve order/delivery timestamps. Only mentor/admin workflow actors can issue them. Risk creation accepts optional `createdByMemberId`, derives it from the signed-in roster member when authentication is enabled, and preserves it on PATCH. Help requests use attributed, task-targeted risks rather than a separate local collection.

STEP occurrence source IDs now include root and occurrence ancestry. This is a deliberate CAD import identity change for repeated subassemblies; reimport disposable development STEP snapshots rather than comparing old occurrence IDs. Mapping updates reject supplied nonexistent domain targets before any batch writes, and finalize rejects stale target mappings even with `allowUnresolved`.
