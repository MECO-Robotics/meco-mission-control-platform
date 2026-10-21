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

Contract version 2 requires every responsible group to store an `icon` from the
supported team icon enum and a six-digit `#RRGGBB` `color`. Team creation requires
both fields; PATCH omission retains the saved identity. The generated
`x_commands.responsibleGroup` and `responsibleGroupPatch` describe these inputs.
Identity is explicit and does not follow the team's name or task work types.

Platform snapshots now use schema version 2 and require those same fields.
Earlier snapshots fail startup without modification. Disposable local data can
be archived with `npm run snapshot:reset` while the API is stopped, then reseeded
on restart. A reviewed one-off local snapshot upgrade may instead assign
explicit identities to existing team IDs and set `snapshotSchemaVersion` to 2;
validate the complete copy before atomically replacing the stopped API's file.
There is no automatic legacy snapshot importer or identity inference.
