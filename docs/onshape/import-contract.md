# Onshape Object Import Contract

This contract defines the Onshape-to-Mission Control object boundary for the current backend importer. It is intentionally about accepted references, normalized records, and durable identity rules; it does not define a new Onshape endpoint integration.

## Accepted References

Mission Control accepts URLs from `cad.onshape.com` or another `*.onshape.com` host with this path shape:

```text
/documents/:documentId/(w|v|m)/:referenceId[/e/:elementId]
```

- `w/:workspaceId` creates a workspace reference. Workspaces are allowed for draft sync, but they are mutable and emit a warning during import.
- `v/:versionId` creates an immutable version reference. Use versions for design review and release snapshots.
- `m/:microversionId` creates an immutable microversion reference. Use microversions when the exact document state matters.
- `e/:elementId` is optional for link-only storage, but BOM sync normally needs an assembly element. Missing element IDs emit a warning.
- Query parameters and rendering flags are ignored for identity.

Rejected inputs include non-URL strings, non-Onshape hosts, URLs without `documentId`, and URLs without one of `workspaceId`, `versionId`, or `microversionId`.

## Normalized Records

The Onshape client must return one normalized graph:

- Subsystem records: `NormalizedCadAssemblyNode` records with `inferredType: "subsystem_candidate"`. The runtime store persists these as `CadAssemblyNode` rows; `subsystemId` stays `null` until a reviewer maps the candidate to an existing Mission Control subsystem.
- Mechanism records: `NormalizedCadAssemblyNode` records with `inferredType: "mechanism_candidate"`. The runtime store persists these as `CadAssemblyNode` rows; `mechanismId` stays `null` until a reviewer maps the candidate.
- Part definition records: `NormalizedCadPartDefinition` records keyed by a stable part identity. They describe the logical part across one or more instances, including `documentId`, `elementId`, `partId`, `versionId` or `microversionId`, `configuration`, part number, material, mass, custom properties, optional `missionControlExternalKey`, and optional `metadataHash`.
- Part instance records: `NormalizedCadPartInstance` records keyed by a stable occurrence identity. They link to a part definition through `partDefinitionSourceId`, link to an assembly through `parentAssemblySourceId`, and carry occurrence details such as `instanceId`, `instancePath`, quantity, suppression state, configuration, transform, and metadata.

The importer also accepts already-normalized fixtures with `assemblyNodes`, `partDefinitions`, and `partInstances`. Native Onshape root-assembly and BOM-table payloads are normalized into the same graph before persistence.

## ID Stability

Normalized `sourceId` values are the importer contract identity. The runtime store upserts within a snapshot by these identities:

- Assembly nodes: `snapshotId + sourceId`.
- Part definitions: `snapshotId + sourceId`, `missionControlExternalKey`, or the fallback identity `documentId:elementId:partId-or-sourceId:configuration`.
- Part instances: `snapshotId + sourceId`.

Immutable version and microversion references reuse the same snapshot for the same document reference and immutable reference ID. Re-importing the same immutable reference with the same normalized identities must keep Mission Control record IDs stable and update mutable display fields in place.

Workspace references create new snapshots for each import because the upstream document can change without a new immutable ID.

## Rename Behavior

Renames are updates, not replacements, when the normalized identity is unchanged. If an assembly, mechanism candidate, part definition, or part instance keeps the same `sourceId` or part definition fallback identity, Mission Control keeps the same record ID and updates fields such as `name`, `normalizedName`, part number, material, quantity, configuration, transform, and metadata.

If an upstream rename also changes Onshape identity fields used by `sourceId`, the importer treats the record as a new imported object. A future mapping-review step can reconcile that new object to an existing Mission Control subsystem, mechanism, or part.

## Removal And Deprecation

Imports are non-destructive. A new snapshot represents the imported graph observed for that reference at that time. Records that disappear from a later workspace snapshot remain in previous snapshots and can be reported by snapshot diffing.

For immutable references, re-importing the same version or microversion updates matching records but does not delete omitted records from the reused snapshot. The current contract therefore does not mark missing objects deprecated during import. Deprecation is a separate review decision that should be represented by a later mapping, diff, or lifecycle workflow.

## Unsupported Structures

Unsupported or unrecognized successful Onshape BOM payloads fail the import path instead of producing partial objects with guessed identities. Missing optional metadata is allowed and may create warnings after import, but missing required graph identity should be normalized to a stable fallback before persistence or rejected by the client normalizer.

The importer does not create Onshape versions, write CAD data, fetch geometry, resolve external documents beyond fields present in the response, or automatically map candidates to Mission Control subsystems and mechanisms.
