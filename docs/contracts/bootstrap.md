---
title: Bootstrap API Contract
---

## Canonical contract source

- Source of truth: `src/contracts/bootstrap.ts` in this repository.
- Generated contract artifact: `contracts/platform/bootstrap/v1/contract.json`.
- Runtime validation entrypoint: `GET /api/bootstrap` in `src/routes/registerRoutes.ts` validates
  the response against `bootstrapPayloadSchema`.

## Versioning

- Contract version is tracked by `BOOTSTRAP_CONTRACT_VERSION` in `src/contracts/bootstrap.ts`.
- Current version: `v1`, encoded in `x_contract.contractVersion`.
- Any **breaking payload shape change** (add/remove required top-level fields, or change an existing field type)
  must be treated as a major contract change:
  1. bump `BOOTSTRAP_CONTRACT_VERSION`,
  2. regenerate the artifact with `npm run contracts:generate`,
  3. update copied contract artifacts in dependent repos (`web`, `mobile`),
  4. run `npm run verify` in each touched repo.

## CI / drift gates

- Platform:
  - `npm run verify` now includes `npm run contracts:verify`.
  - `npm run contracts:generate` writes `contracts/platform/bootstrap/v1/contract.json`.
- Web + Mobile:
  - `npm run verify` validates that their copied contract artifact matches the platform source (local checkout or
    GitHub raw URL when available).

## Migration notes

- **v1** intentionally excludes `designIterations` from the runtime payload despite it existing in
  `PlatformSnapshot`. Clients must treat this field as optional and default to `[]` if missing.
- If `designIterations` is added to `GET /api/bootstrap` in a later release, treat that as a contract-capable
  field change and update the contract together with client bootstrap defaults and normalization helpers.
- Note: PR checks in this repository require `development`-targeted PRs with all required checks passing before merge.
