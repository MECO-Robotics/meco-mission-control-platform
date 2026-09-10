---
name: Migration / deploy change
about: Database, data migration, or deployment workflow change
title: "migration: "
labels:
  - area/backend
  - area/deploy
assignees: []
---

### Change scope

- Type (`db`, `runtime`, `CI/CD`, `infra`):
- Reason / trigger:
- Affected services:
- Affected environment(s) (`dev`, `test`, `prod`):

### Migration plan

- Migration files / scripts:
- Ordered execution steps:
- Backfill jobs / scripts (if any):
- Validation queries/checks:
- Dry-run or rehearsal plan:

### Deployment safety

- Required secrets / runtime config:
- Env vars added/updated/removed:
- API/contract compatibility during rollout:
- Rollback target and command(s):
- Roll-forward contingency:
- Snapshot/baseline impact (if touching production behavior):
- Estimated recovery point / RTO:

### API and contract impact

- Endpoints affected:
- Request/response/schema behavior affected:
- Cross-repo consumers to notify:
- Screenshots/video if the deploy changes a visible client behavior:

### Smoke testing

- Local verification:
- Post-deploy verification command(s):
- Acceptance criteria before closing:

### Risk notes

- Data integrity risk:
- Downtime or degraded-mode risk:
- Monitoring/alerting to watch:
- Owner signoff needed:
