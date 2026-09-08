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

## Validation

Run `npm run verify` for application, package or CI changes. It verifies the bootstrap contract, generates Prisma, checks test types, runs the test suite and builds the server; do not repeat those steps separately on the same revision. Use `npm test` for focused test iteration. Integration tests own temporary preference files; `buildApp({ userPreferencesPath })` selects their storage. Ordinary application startup retains `data/user-preferences.json`, and reopening that path retains saved preferences. Set `TEST_DATABASE_URL` to an isolated, bootstrapped PostgreSQL database when running `npm run verify` to include the production mobile-session persistence/competition test. Without it, that scenario is explicitly skipped. Schema changes also require `npx prisma validate` and a clean-database bootstrap/persistence check. Deployment changes require the relevant workflow tests and compose validation described in the [operator runbook](docs/platform-deployment-recovery.md).

For documentation-only changes, check links, documented commands and `git diff --check`. Record what ran and any limitations in the PR. Never substitute a lower test count for evidence of simplification.

## Pull requests

Use a dedicated worktree and a `feature/*`, `fix/*` or `hotfix/*` branch targeting `development`. Promote reviewed integration changes from `development` to `main` by PR. Existing staging branches accept stabilization PRs from `fix/*` or `hotfix/*`; do not edit promotion branches directly.

The stable `merge-requirements` status enforces branch strategy, CI and snapshot validation; main promotion also requires cross-repository integration health. Preserve configured approving reviews and conversation resolution. Automated review comments do not count as approvals.

Describe the problem, resulting behavior and validation. Include contract changes and affected web/mobile consumers, environment changes, or schema reset/deployment commands when relevant. Prototype data may be discarded explicitly; document what is lost. Keep deployment/recovery guidance accurate before real use.

## Optional shared skills

[Shared skills](docs/shared-skills.md) are ignored local imports, not application or CI dependencies. Edit their canonical repository through its contribution process; never commit imported copies here.
