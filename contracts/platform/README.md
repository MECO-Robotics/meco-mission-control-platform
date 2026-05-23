# Platform bootstrap contract

The canonical bootstrap contract for `/api/bootstrap` lives at:

- `contracts/platform/bootstrap/v1/contract.json`

This file is the single source of truth for payload shape across Mission Control clients.
Any change to the endpoint response shape should be represented in this contract file and
propagated to consuming clients via follow-up coordinated PRs in `meco-mission-control-web`
and `meco-mission-control-mobile`.

## Versioning

- `x_contract.contractVersion` inside the JSON schema is a shared contract version.
- Backwards-compatible additions should be released as patch/minor updates to the payload in
  sync with clients.
- Breaking shape changes require a **MAJOR** bump and coordinated client rollout.
- If the contract changes, include migration notes in the PR description and update affected
  client contract validation expectations.
