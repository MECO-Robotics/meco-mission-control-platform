# Platform PR checklist

## Summary

<!-- One concise paragraph for what changed and why -->

## Issue / context

- Closes:
- Related web/mobile coordination:
- Contract owner/reviewer:

## Validation

- [ ] `npm.cmd run typecheck:test`
- [ ] `npm.cmd run test`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd run verify` (only if not run above, or if additional checks are in scope)

### Verification notes

- Command output / results:
- Test coverage changed:
- API smoke checks run:
- Screenshots/video, if a client-visible behavior changed:

## Migration notes

- Migration file(s) touched:
- Backfill or data-corrective work:
- Rollback SQL / compensating operation:
- Migration validation executed:
- Deployment order required:

## Environment variable changes

- Added:
- Updated:
- Removed:
- Any production-only behavior change (auth, CORS, rate limits, other):

## API contract changes

- Endpoints added/changed:
- Request/response schema changes:
- Auth/session behavior changes:
- Validation/error behavior changes:
- Consumer repos/components to coordinate:

## Database impact

- Prisma schema/migration impact:
- Data model risk:
- Seed/reset/runtime persistence assumptions changed:
- Query/index/perf checks:

## Deployment impact

- Expected deploy gate/path:
  - `development` yes / `main` yes / `release` yes / other: specify
- `deploy-vps.yml`/CI steps affected:
- Extra runbook/flag needed for rollout:
- Post-deploy smoke checks:
  - `curl /health`
  - Core API path (list one):

## Rollback / risk notes

- Revert strategy:
- Partial rollback constraints:
- Blast radius and mitigation:
- Data integrity risk:
- Operational risk:
- Required owner signoff for merge:

## Notes

- Any secrets kept out of PR; only variable names and config intent included.
