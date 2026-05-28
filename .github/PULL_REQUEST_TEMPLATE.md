# Platform PR checklist

## Summary

<!-- One concise paragraph for what changed and why -->

## Validation

- [ ] `npm.cmd run typecheck:test`
- [ ] `npm.cmd run test`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd run verify` (only if not run above, or if additional checks are in scope)

### Verification notes

- Command output / results:
- Test coverage changed:

## Migration notes

- Migration file(s) touched:
- Backfill or data-corrective work:
- Rollback SQL / compensating operation:
- Migration validation executed:

## Environment variable changes

- Added:
- Updated:
- Removed:
- Any production-only behavior change (e.g., auth/CORS/rate limits):

## API contract changes

- Endpoints added/changed:
- Request/response schema changes:
- Auth/session behavior changes:
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
- Required owner signoff for merge:

## Notes

- Any secrets kept out of PR; only variable names and config intent included.
