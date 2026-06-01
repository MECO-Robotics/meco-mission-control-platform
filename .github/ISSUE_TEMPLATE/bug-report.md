---
name: Bug report
about: Report a platform regression, backend fault, or contract mismatch
title: "bug: "
labels:
  - bug
  - area/backend
assignees: []
---

### Description

- What is broken:
- Expected behavior:
- Actual behavior:

### Reproduction

1.
2.
3.

### Scope and contract impact

- Endpoint(s) / route(s):
- Client(s) affected (`web`, `mobile`, internal script, other):
- Environment (`dev`, `test`, `prod`):
- Request/response contract affected:
- Validation/schema/auth behavior affected:
- Migration or data state involved:
- Env/config/secrets involved:
- Recent change or commit that introduced issue:

### Evidence

- Request/response snippet:
- Logs / error messages:
- Relevant request-id or trace:
- Screenshot/video, if a client-visible behavior is affected:

### Validation

- [ ] Reproduced locally or in the named environment.
- [ ] Verified expected backend route/schema behavior.
- [ ] Ran relevant command(s):
  - `npm run typecheck:test` (`npm.cmd run typecheck:test` on Windows)
  - `npm run test` (`npm.cmd run test` on Windows)
  - Other:
- [ ] Confirmed downstream client impact (`web`/`mobile`) or marked not applicable.

### Risk and rollback notes

- User/customer impact:
- Data integrity risk:
- Workaround:
- Rollback or mitigation path:
- Urgency / priority:
