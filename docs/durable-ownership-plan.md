# Durable ownership consolidation plan

**Status:** analysis plan; no application code, live data, database, or credentials were changed or read.

## Objective and current shape

Move durable operational state behind one authoritative PostgreSQL ownership boundary while preserving every existing record, identity, and user-visible workflow. Prisma actively owns web/mobile sessions and generic CAD when `CAD_STORE_DRIVER=prisma`; its schema also declares Onshape connection/document-ref and API support models, but those declarations do not establish active ownership of runtime Onshape records. Core workspace state is currently one versioned `PlatformSnapshot` JSON file (`PLATFORM_SNAPSHOT_PATH`, default `data/platform-snapshot.json`) with atomic temp-file rename, a process-local mutation queue, and serialized production snapshot transactions. The Onshape route path uses an independent in-memory runtime store reset on application startup. Onshape runtime includes document refs, import runs, sync jobs, request logs, response cache, CAD graph snapshots/rows, warnings, API budget, OAuth token set, and short-lived OAuth callback states.

Prisma schema declares sessions, Onshape connection/document-ref, generic CAD import/snapshot/graph/mapping/warning tables, and API cache/log/budget tables. Active store ownership differs: web/mobile sessions and generic CAD use Prisma; active Onshape routes use `OnshapeRuntimeStore`, not the declared Onshape/CAD/API Prisma models. `OnshapeSyncJob` is present in runtime types but has no matching Prisma model. Core planning/manufacturing rows have no Prisma representation today. The schema has only a scalar snapshot schema version; archive-on-incompatible behavior exists, so migration must recognize existing versioned files without relying on startup reset behavior.

## Target ownership

PostgreSQL becomes the sole durable authority for workspace, sessions, CAD, Onshape references/import history, and operational counters. A single `PrismaClient`/repository composition owns transaction boundaries and application lifecycle. Runtime caches and OAuth callback state remain ephemeral; neither can be an alternate source of durable business state. The JSON snapshot remains an import/export and disaster-recovery format during rollout, then a versioned backup/export format after cutover, never a second writable authority.

Prefer explicit relational models for entities and references that need querying, constraints, retention, or independent updates. Use JSON only for documented opaque/provider payload fragments whose shape is intentionally not part of domain constraints. Do not put credentials, access/refresh tokens, raw authorization callbacks, personal data dumps, or unbounded provider payloads into routine logs/backups. Store a secret-manager reference for external credentials; secret values remain outside this migration.

## Schema and mapping inventory

### Core snapshot domain

Map each `PlatformSnapshot` collection into its own typed table with the existing string `id` retained as primary key. Retain all domain fields, enum values, optional/null semantics, timestamps, explicit empty arrays, and `snapshotSchemaVersion` as a migration/import version marker. Preserve unknown/opaque JSON fields only where the current domain type allows them; record canonical serialization for checksums and round trips.

| Snapshot collections | Target owner / key links |
|---|---|
| `seasons`, `projects`, `workTypes`, `responsibleGroups`, `workstreams`, `vendors` | Typed reference/catalog tables; project → season and existing catalog relationships become FK links where current domain semantics require them. Preserve independent workstream selection. |
| `members`, `subsystems`, `mechanisms`, `materials`, `artifacts` | Typed domain tables; preserve member-season/project membership and hierarchy links. Subsystem/mechanism references remain explicit and cross-project constraints remain enforced. |
| `partDefinitions`, `partInstances` | Separate from imported CAD graph rows. Preserve definition/instance identities and existing source/provenance references; instance → definition and hierarchy links become FKs. |
| `tasks`, `milestones`, `taskDependencies`, optional `milestoneRequirements` | Task remains the human execution identity; source `TaskTargets` defines four canonical target arrays (`workstreamIds`, `subsystemIds`, `mechanismIds`, `partInstanceIds`). Preserve those as join tables and retain artifact links only where an actual domain/API relationship defines them; `artifactIds` is not a canonical task target array in the reviewed source. Preserve dependency source/target IDs and missing hard-dependency semantics; do not invent cascades that erase blockers. Milestone requirements stay explicit. |
| `qaReports`, `teamReports`, `qaRequests`, `testResults`, `qaFindings`, `testFindings` | Keep report/result source identity separate from typed target joins. Preserve nullable report links and required test-result links. |
| `designIterations`, `risks`, `workLogs`, `meetings`, `events`, `attendanceRecords`, `actions` | Typed records and explicit references; audit/action history is retained with actor and target identity. Apply retention policy separately, not during migration. |
| `manufacturingProcesses`, `purchaseItems`, `escalations` | Preserve existing task-linked manufacturing extension and purchase commercial fields, approvals, timestamps, cost, and delivery state. |

These target names describe ownership, not a final Prisma naming decision. Before schema implementation, inventory actual fields from `src/domain/types.ts` and derive exact constraints; this analysis intentionally avoids record contents.

### Existing Prisma and Onshape / CAD state

Treat schema declaration and active store ownership as separate inventory dimensions. Reconcile independently, using metadata-only counts and identity/duplicate checks before merge or cutover: (1) declared but currently unwired Onshape/CAD Prisma tables, (2) the active generic CAD store (Prisma by default, with configured runtime mode recorded), and (3) active runtime-only Onshape records. Do not assume declared Prisma tables are authoritative or empty; compare overlapping identities and preserve conflicts for explicit disposition. No record values or credentials are needed for this inventory.

- Keep `WebSession`, `MobileDeviceSession`, `MobileAccessToken`, `MobileRefreshToken` ownership and current token-hash-only behavior unchanged. Session IDs and token hashes must not be regenerated or exported in plaintext.
- Retain `OnshapeConnection` and `OnshapeDocumentRef` IDs. Link document refs to canonical project/season/subsystem/mechanism rows with nullable FKs, preserving currently valid links; unresolved legacy references must be reported and held for explicit reconciliation, never dropped.
- Retain `CadImportRun`, `CadSnapshot`, `CadAssemblyNode`, `CadPartDefinition`, `CadPartInstance`, `CadMappingRule`, `CadSnapshotMapping`, and `CadImportWarning` IDs and provider/source identities. Preserve `previousSnapshotId`, parent-source/parent-row relationships, import-run/document-ref/snapshot relationships, mappings, warnings, status enums, immutable references, and existing uniqueness (`snapshotId + sourceId`, mapping uniqueness). Keep imported CAD parts distinct from platform part definitions/instances. Add explicit polymorphic target representation or validated typed FKs for mapping targets; do not silently treat free-form target IDs as valid.
- Use current `sourceId` as the import identity within a snapshot. Preserve the documented identity key `snapshotId + sourceId`; keep normalized external IDs and `missionControlExternalKey` where defined. Preserve row IDs during copy, do not derive new IDs from names or array position.
- Add a durable `OnshapeSyncJob` representation linked to the existing import run and document ref, with its request/source reference and lifecycle fields; confirm exact fields and retention from runtime types before implementation. It is a missing durable model today.
- Keep `OnshapeApiRequestLog`, `OnshapeApiCacheEntry`, and `OnshapeApiBudget` with current durable-vs-cache classification reviewed. Logs should store minimal metadata only and redact credential/header/body values; cache payloads need size limits, encryption-at-rest assumptions, expiry/eviction, and provider-data minimization. Budget counters need atomic increments and explicit reset-window semantics.
- OAuth access/refresh token material must not be copied from runtime memory into regular business tables or export files. Use the configured secret reference/secret manager and define restart/revocation behavior. OAuth `state`/session correlation remains short-lived, one-use, process/distributed-cache state with expiry; ensure multi-instance callback flow has a shared short-lived store if deployment requires it.

### Snapshot v1 importer compatibility contract

The importer must explicitly recognize `snapshotSchemaVersion: 1`, validate the complete v1 contract, and preserve the input artifact byte-for-byte until a separately validated import commits. Invalid or unsupported input is a hard stop with an actionable error; production startup must never archive an incompatible source and continue by seeding canonical state. Archive-and-seed is not an importer fallback. Define the following matrix as executable fixtures before implementation:

| v1 input case | Import behavior |
|---|---|
| Version 1 with all required collections; optional `milestoneRequirements`, `qaRequests`, or `actions` present | Accept if each row passes its current schema and identity/reference validation; preserve rows and IDs. |
| Any of those three optional collections omitted | Accept and normalize to the domain’s documented empty/default representation without changing the source file. |
| Any required collection omitted, null, or not an array; optional collection explicitly null/non-array | Reject and hard stop. |
| Explicit empty arrays | Accept as empty collections; do not replace with seed records. |
| Strictly validated row fields or enum values invalid; unsupported/unknown version; malformed JSON | Reject and hard stop, preserving source. |
| Opaque/passthrough fields | Preserve exactly where the source domain/schema allows passthrough; reject unknown fields in strict row schemas. Do not silently strip or reinterpret fields. |
| Duplicate primary IDs, duplicate relationship IDs where prohibited, or duplicate canonical task targets | Reject and hard stop; report identifiers only as needed for operator remediation, without dumping row contents. |

Fixtures must cover accepted v1 imports, export→import round trips, omitted optional collections, explicit empties, opaque/passthrough preservation, and every rejection class. Validation failure must leave the source and active authority untouched. These are planned importer requirements, not evidence of an implemented importer or rehearsal.

## Identity and reference rules

1. Preserve existing primary IDs exactly for all imported records; no ID regeneration on repeat migration/retry.
2. Establish FKs first for stable references (project→season, task→project/actor, hierarchy parents, part instance→definition, reports→source result, document ref→workspace scope, CAD row→snapshot/run).
3. Migrate array relationships to join rows with uniqueness on `(ownerId, targetId)` and deterministic ordering where API order is observable. Keep target-kind columns where targets are inherently polymorphic, with command-level validation and DB constraints where feasible.
4. Keep provider `sourceId` and Mission Control row `id` distinct. Import upsert uses provider source identity within the owning snapshot; human mapping targets use canonical platform IDs.
5. Preserve soft/missing-reference states where current behavior intentionally reports a blocked or unresolved target. Produce an exception inventory; do not convert unresolved IDs to null or cascade-delete history.
6. Enforce existing unique constraints and add indexes only for measured query paths. Avoid unique constraints on nullable fields unless their semantics are explicitly defined.

## Staged migration

### 0. Inventory and contract freeze

- Build a field-complete schema crosswalk from domain types, store commands, API/bootstrap contracts, web/mobile consumers, Prisma models, and current Onshape runtime types.
- Establish per-collection record counts, null/optional-field counts, duplicate IDs, dangling references, payload sizes, snapshot file hash, Prisma table counts, enum distribution, and CAD identity uniqueness using metadata-only queries. Do not print or store row values in reports.
- Specify the canonical representation and ordering used for deterministic export and count/hash reconciliation. Identify user-visible views and workflows, including bootstrap, imports, CAD mappings, Onshape sync/estimate/cache/budget, and session refresh/revocation.

### 1. Expand schema and repository boundary

- Add core tables/joins and missing Onshape sync-job persistence with additive migrations. Generate Prisma and validate a clean database; do not remove current readers/writers.
- Introduce repository interfaces behind current store APIs and transaction composition. Onshape import graph upserts, warning/run updates, and budget accounting must use one database client and bounded transactions; cache is explicitly disposable.
- Preserve API payloads and frontend/mobile contracts. Add dual-read comparison only in isolated rehearsal/test environments, with no production writes to both authorities.

### 2. Backup and rehearsal extraction

- Take a consistent, encrypted, access-controlled PostgreSQL backup plus a byte-for-byte snapshot-file backup and a manifest containing paths, UTC timestamp, hashes, schema/application revision, counts, and software/tool versions. Keep keys separate; verify restore into an isolated database and isolated filesystem path.
- Run an offline, read-only extractor on copies. Convert the snapshot JSON and current Prisma rows into deterministic staging data. Do not include secret values, raw personal content in logs, or provider payload dumps in the manifest.
- Load into a disposable PostgreSQL clone using chunked inserts with explicit IDs and FK-safe dependency order. Transaction per coherent aggregate/batch; checkpoint each batch by source and ID range/hash. Re-running a batch must upsert idempotently and preserve IDs.
- Validate source-to-target collection counts, canonical row hashes, FK/unique checks, optional/null distinctions, relationship cardinalities, task-target ordering, audit chronology, CAD source identity uniqueness, snapshot chains, and API response projections. Investigate every mismatch before progressing.
- Before/after/import/restore fixtures must also verify domain behavior: every `PartInstanceLocation` kind (`stock`, `installed` with subsystem and nullable mechanism links, `repair`, `retired` with nullable location, `lost`, `unlocated`) retains its discriminant, location text, and valid target links; part-definition revision and iteration remain unchanged; material on-hand quantity and storage location remain unchanged; empty milestone criteria preserve current readiness behavior; current versus stale QA/test evidence yields the same readiness; and role-filtered API visibility remains the same for representative roles. Include full updates and partial PATCHes, including omitted fields (retain) and explicit empty values (apply domain rules). Purchase items retain whole-item `orderStatus` and `quantity` semantics; the reviewed source has no partial-receipt field or feature, which must be recorded rather than invented.

### 3. Cutover preparation and controlled freeze

- Define a maintenance window and mutation freeze at the API boundary; stop all writers and background jobs, drain in-flight requests/imports, and verify no transaction remains open. Read-only traffic may continue only if served from one selected authority.
- Create final backups and repeat extract/load/reconciliation. Record a signed/controlled operator checklist and the exact rollback point. Validate restore again before enabling database reads/writes.
- Point repositories to PostgreSQL as sole authority. Remove startup reset of durable owners and do not seed over existing production data. Keep snapshot export available as a read-only backup path with a verified import utility; prohibit concurrent file/database writes.

### 4. Stabilization and retirement

- Observe health, transaction errors, query latency, durable restart behavior, replica/multi-instance concurrency, and record-count reconciliation for an agreed soak period covering normal edits and CAD/Onshape syncs.
- Only after explicit go/no-go approval retire snapshot writes and legacy runtime Onshape business state. Retain verified rollback backups for the approved retention period. Do not delete legacy data until the retention and audit policy is approved and restore has been rehearsed.

## Transactions, crashes, and concurrency

- A request that changes a task plus audit action, linked manufacturing/purchase state, or a complete CAD import must commit all required durable rows in one PostgreSQL transaction. Existing staged snapshot semantics (publish only after durable write) become transaction semantics (respond success only after commit).
- For large CAD graphs, use a durable import-run state machine and idempotent chunks keyed by `(snapshotId, sourceId)`. Publish/finalize the snapshot only after node/definition/instance/mapping/warning counts and references validate; in-progress imports remain visibly incomplete and resumable/cleanable. Couple final snapshot/import status update in one transaction.
- Use atomic SQL updates or row locking for API budgets, refresh-token rotation, and lifecycle transitions. Avoid read-modify-write counters in process memory. Enforce optimistic concurrency/version fields for mutable workspace aggregates when multiple app instances can edit concurrently.
- On process crash before commit, PostgreSQL rolls back; after commit but before HTTP response, an idempotency key or command ID prevents duplicate create/audit side effects on client retry. Define idempotency scope and retention before rollout.
- Temporary export files use restrictive permissions, fsync/atomic rename where supported, and cleanup on failure. Backups are consistent snapshots and have verified checksums. Document WAL/durability settings, disk-full behavior, connection exhaustion, and recovery point/objective.
- Cache/log failure must not falsely report an Onshape business import as committed. Cache misses are safe; cache writes can be best-effort after a successful response if policy allows.

## Backup, restore, rollback validation

- Back up database and remaining file artifacts together with a manifest so identities/references remain aligned. Encrypt in transit and at rest; restrict access; record restore attempts without exporting record contents.
- Restore into an isolated environment with no external integrations enabled. Verify schema migration history, row counts, checksums, FKs, uniqueness, task target invariants, snapshot-chain integrity, session revocation/token-hash properties, and representative API projections from synthetic fixtures.
- Run a restart test and a forced-kill test at each boundary: before batch commit, after batch commit, before finalization, after DB commit/before response, and during backup restore. Confirm resumability/no duplicates and that stale state is not served.
- Rollback before cutover: discard rehearsal DB only. Rollback after cutover: freeze writes; restore the paired pre-cutover DB/file snapshot or use a tested reverse export from the database; reconcile any writes since cutover before reopening. Never switch back to a stale JSON file while newer DB writes exist. A downgrade migration alone is not data rollback.

## Rehearsal acceptance

Rehearsal passes only when all are true:

- Every source collection/table and operational feature has an explicit mapping or a documented intentional ephemeral classification; no source records are silently omitted.
- Primary IDs are unchanged; counts and deterministic hashes match for all in-scope durable rows after canonical normalization; all nullable/optional/empty values round-trip.
- All enforced FK and unique checks pass, and every unresolved legacy reference is enumerated with a non-destructive disposition.
- Bootstrap/API projections match captured synthetic/approved contract fixtures; web and mobile consumers need no unplanned contract change.
- Before/after/import/restore domain fixtures preserve part location kinds and links, revisions/iterations, material quantities/locations, empty-criteria readiness, stale/current QA/test effects, and role-filtered visibility; partial updates preserve omission-versus-empty semantics. Purchase checks preserve whole-item order/delivery state and quantity; no partial-receipt feature exists in the reviewed source.
- Metadata-only inventories separately reconcile declared-but-unwired Onshape/CAD Prisma tables, active generic CAD ownership, and runtime-only Onshape records, including overlapping identity/duplicate dispositions; no source is presumed authoritative from schema presence alone.
- CAD/Onshape re-import of the same immutable reference is idempotent; workspace references still create new snapshots; mappings and history remain addressable; cache and budget behavior is defined; sync jobs survive process restart.
- Concurrent edits/imports, retries, restart, forced crash, disk-full/connection failure simulation, and restore tests pass without lost acknowledged writes or duplicate records.
- Restore meets approved RPO/RTO; operators can execute cutover, abort, and rollback using the runbook without access to raw credentials or record dumps.

## Go/no-go

**Go** only with complete reconciliation, zero unexplained loss/duplication, tested restore and rollback, approved privacy/retention controls, sufficient database capacity, operational monitoring, confirmed multi-instance locking/concurrency behavior, and owner sign-off from application, database/operations, and privacy/data stewards. Require a rehearsed cutover and explicit maintenance window.

**No-go** for any count/hash mismatch, unresolved high-impact reference, missing feature/consumer mapping, failed restore/rollback, token/secret exposure, unbounded sensitive logs/backups, untested transaction/crash boundary, migration that relies on application startup reset, or inability to freeze all writers. Keep current production authority in place until blockers are resolved.

## Privacy-minimal production assumptions

Assume records may contain student names/contact details, schedules/attendance, task ownership/work logs, audit and safety reports, purchasing/financial details, CAD metadata, and identity/session data. Use least-privilege database roles, encrypted disks/backups, TLS, bounded access to exports, secrets outside the DB migration artifact, short-lived auth state, redacted error/log payloads, and an approved retention/deletion/hold policy before deployment. Metadata-only rehearsal reports must avoid names, emails, free text, raw URLs, OAuth material, CAD response bodies, and row-level excerpts. Apply access auditing and restore isolation. Do not assume current prototype defaults meet production privacy requirements.

## Out of scope / implementation gates

This artifact makes no schema or runtime change and does not authorize a live migration. Before implementation, obtain the actual approved production data inventory via privacy-preserving counts/schema-only queries, agree the retention/RPO/RTO and downtime, inspect full domain field contracts and web/mobile types, resolve Onshape sync-job and credential ownership gaps, and design executable migration/rollback tooling plus focused behavior tests. No personal record contents or credential values were read for this plan.
