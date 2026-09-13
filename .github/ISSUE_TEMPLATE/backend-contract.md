---
name: Backend contract
about: Add or change a platform API, payload, auth, validation, or schema contract
title: "contract: "
labels:
  - area/backend
  - area/api
assignees: []
---

### Summary

- What contract is being added or changed:
- Why this is needed now:
- Owning consumer(s) (`web`, `mobile`, integration, other):

### Contract surface

- Endpoint(s) and method(s) affected:
- Request payload changes:
- Response payload changes:
- New/updated validation rules:
- Auth/session/permission behavior:
- Error shape/status code changes:
- Breaking change risk:

### Data, migration, and environment impact

- Entities affected:
- In-memory store / persistence touch points:
- Migration/backfill required:
- Env vars, secrets, flags, or runtime config changed:
- Deployment ordering constraints:

### Validation plan

- Local command(s):
  - `npm run typecheck:test` (`npm.cmd run typecheck:test` on Windows)
  - `npm run test` (`npm.cmd run test` on Windows)
- API smoke check(s):
- Contract fixture/example request:
- Cross-repo verification needed in consumer:

### Evidence and coordination

- Example request/response:
- Docs or type references to update:
- Screenshot/video if a client-visible flow depends on this:
- Related web/mobile issue or PR:

### Risk and rollback notes

- Compatibility risk:
- Data or deploy risk:
- Rollback strategy:
- Blast radius and mitigation:
