# API Reference

This reference describes the current Fastify route surface for the Mission Control backend. All `/api/*` routes return `Cache-Control: no-store` responses, use the shared security headers from `src/app.ts`, and require a Mission Control session when auth is enabled unless noted otherwise.

## Conventions

- Collection responses usually use `{ items, pagination? }`.
- Create responses usually return `201` with `{ item }` or a domain-specific result envelope.
- Validation failures return `400` with a human message and, for Zod-backed payloads, an `issues` object.
- Missing records return `404`.
- Protected API requests are rate limited by the `API_RATE_LIMIT_*` environment settings.
- Auth and email-auth routes use separate `AUTH_RATE_LIMIT_*` and `AUTH_EMAIL_RATE_LIMIT_*` budgets.

## Health

- `GET /health`: unauthenticated process health check with service name and timestamp.

## Authentication

- `GET /api/auth/config`: public auth configuration for the frontend.
- `POST /api/auth/google`: exchanges a Google Identity Services credential for a Mission Control session token.
- `POST /api/auth/dev-bypass`: development-only local sign-in helper. Accepts optional `{ "role": "student" | "mentor" }`; production does not register this route.
- `POST /api/auth/email/start`: sends an email sign-in code when email delivery is configured.
- `POST /api/auth/email/verify`: verifies an email code and returns a Mission Control session token.
- `GET /api/auth/me`: returns the current session user, or `{ enabled: false, user: null }` when auth is disabled.
- `GET /api/users/me/preferences`: returns authenticated user preferences such as `themeMode` and `taskSubteamIds`.
- `PATCH /api/users/me/preferences`: updates authenticated user preferences. `themeMode` accepts `"light"`, `"dark"`, or `null`; `taskSubteamIds` accepts valid task subteam IDs.

## Bootstrap And Dashboards

- `GET /api/dashboard`: platform dashboard summary from the current seeded snapshot.
- `GET /api/home`: Slack-style home summary for the current user.
- `GET /api/bootstrap`: selected bootstrap payload for initial frontend hydration.
- `GET /api/metrics`: workflow and delivery metrics.
- `GET /api/roster/insights`: roster participation and contribution insights.

### Audit History Retention

Audit actions are operational history for create, update, and delete activity exposed through
`/api/bootstrap` as `actions`. They support accountability, troubleshooting, and scoped activity
review; they are not a permanent archive of student activity. This policy is designed to align with
FTC COPPA guidance that children's personal information should be retained only as long as needed
and deleted with reasonable safeguards:
https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions

Retention policy:

- Retain audit actions for 3 years after the end of the season in which the action occurred.
- After the retention window, delete the audit action or anonymize actor/member references,
  free-text labels, and messages. Keep only aggregate, non-identifying metrics when needed.
- Treat student audit references as personal data and likely minor data. Audit messages should
  avoid sensitive free text, private notes, unnecessary contact details, photos, or precise
  personal details.
- Honor verified parent/guardian or admin privacy requests through deletion or anonymization
  unless a documented safety, legal, or operational reason requires temporary retention.
- Archive hides a domain record from normal active views but does not shorten audit retention.
- Delete removes the domain record from normal lists while the audit action remains as a minimal
  tombstone until retention expires. Deleted-record audit entries must not require the deleted
  entity to still exist for scoped history display.
- `/api/bootstrap` returns scoped audit actions to authenticated, non-external users alongside the
  rest of the scoped workspace payload. Audit messages therefore must stay minimal and
  non-sensitive. Broad audit browsing is limited to leads, mentors, admins, or other explicitly
  authorized users with a legitimate operational need. Bulk export, retention override, archive,
  and manual deletion tools are admin-only operations for maintenance, privacy requests, incident
  review, and compliance review, not general browsing.
- `GET /api/audit/export`: admin-only audit action export. Supports `format=json|csv`,
  `seasonId`, `projectId`, `entityType`, `from`, and `to` query filters. Date filters use ISO
  datetimes and are inclusive.

## Tutorial Session

- `POST /api/tutorial/session/start`: starts an interactive tutorial session from the baseline state.
- `POST /api/tutorial/session/reset`: resets either the current tutorial session or the baseline tutorial state.

## Planning

- `GET /api/seasons`: list seasons.
- `POST /api/seasons`: create a season.
- `GET /api/projects`: list projects.
- `POST /api/projects`: create a project.
- `PATCH /api/projects/:projectId`: update a project.
- `GET /api/workstreams`: list workstreams.
- `POST /api/workstreams`: create a workstream.
- `PATCH /api/workstreams/:workstreamId`: update a workstream.
- `GET /api/milestones`: list milestones.
- `POST /api/milestones`: create a milestone.
- `PATCH /api/milestones/:milestoneId`: update a milestone.
- `DELETE /api/milestones/:milestoneId`: delete a milestone.
- `GET /api/tasks/:taskId/milestones`: list milestones matched to a task.
- `GET /api/milestones/:milestoneId/tasks`: list tasks matched to a milestone.

## Tasks And Blockers

- `GET /api/tasks`: list tasks, with filters and pagination handled by route helpers.
- `POST /api/tasks`: create a task. Requires mentor, lead, or admin when auth is enabled.
- `POST /api/tasks/:taskId/claim`: claim a task for the signed-in student or lead. Optional `{ "start": true }` starts eligible unblocked work. Returns `409 task_already_claimed` when another owner claimed first.
- `POST /api/tasks/:taskId/release`: release a task. Students can release their own task; leads, mentors, and admins can release any task.
- `POST /api/tasks/:taskId/reassign`: assign or unassign a task owner. Requires lead, mentor, or admin when auth is enabled.
- `PATCH /api/tasks/:taskId`: update a task. Requires mentor, lead, or admin when auth is enabled.
- `DELETE /api/tasks/:taskId`: delete a task. Requires mentor, lead, or admin when auth is enabled.
- `GET /api/task-targets`: list valid target entities for task linkage.
- `GET /api/task-dependencies`: list dependencies.
- `POST /api/task-dependencies`: create a dependency.
- `PATCH /api/task-dependencies/:dependencyId`: update a dependency.
- `DELETE /api/task-dependencies/:dependencyId`: delete a dependency.
- `GET /api/task-blockers`: list blockers.
- `POST /api/task-blockers`: create a blocker.
- `PATCH /api/task-blockers/:blockerId`: update a blocker.
- `DELETE /api/task-blockers/:blockerId`: delete a blocker.

## Work Logs And Meetings

- `POST /api/work-logs`: create a work log.
- `PATCH /api/work-logs/:workLogId`: update a work log.
- `DELETE /api/work-logs/:workLogId`: delete a work log.
- `GET /api/meetings`: list meeting-focused workflow data.
- `POST /api/meetings`: create a meeting. Requires mentor, lead, or admin when auth is enabled.

## Reports, QA, And Risks

- `GET /api/reports`: list reports.
- `POST /api/reports`: create a report.
- `GET /api/report-findings`: list report findings.
- `POST /api/report-findings`: create a report finding.
- `GET /api/qa-reports`: list QA reports.
- `POST /api/qa-reports`: create a QA report. Mentor approval requires mentor, lead, or admin when auth is enabled.
- `GET /api/qa-requests`: list QA requests.
- `POST /api/qa-requests`: create a QA request.
- `GET /api/test-results`: list test results.
- `POST /api/test-results`: create a test result.
- `GET /api/qa`: combined QA workflow summary.
- `GET /api/risks`: list risks.
- `POST /api/risks`: create a risk.
- `PATCH /api/risks/:riskId`: update a risk.
- `DELETE /api/risks/:riskId`: delete a risk.

## Inventory And Manufacturing

- `GET /api/materials`: list materials.
- `POST /api/materials`: create a material.
- `PATCH /api/materials/:materialId`: update a material.
- `DELETE /api/materials/:materialId`: delete a material.
- `GET /api/artifacts`: list artifacts.
- `POST /api/artifacts`: create an artifact.
- `PATCH /api/artifacts/:artifactId`: update an artifact.
- `DELETE /api/artifacts/:artifactId`: delete an artifact.
- `GET /api/manufacturing`: list manufacturing items.
- `POST /api/manufacturing`: create a manufacturing item.
- `PATCH /api/manufacturing/:itemId`: update a manufacturing item.
- `DELETE /api/manufacturing/:itemId`: delete a manufacturing item.
- `GET /api/purchases`: list purchase items.
- `POST /api/purchases`: create a purchase item.
- `PATCH /api/purchases/:itemId`: update a purchase item.
- `DELETE /api/purchases/:itemId`: delete a purchase item.

## Team And Robot Structure

- `GET /api/members`: list members.
- `POST /api/members`: create or invite a member. Requires mentor, lead, or admin when auth is enabled.
- `PATCH /api/members/:memberId`: update a member. Requires mentor, lead, or admin when auth is enabled.
- `DELETE /api/members/:memberId`: delete a member. Requires mentor, lead, or admin when auth is enabled.
- `POST /api/subsystems`: create a subsystem.
- `PATCH /api/subsystems/:subsystemId`: update a subsystem.
- `DELETE /api/subsystems/:subsystemId`: delete a subsystem.
- `POST /api/mechanisms`: create a mechanism.
- `PATCH /api/mechanisms/:mechanismId`: update a mechanism.
- `DELETE /api/mechanisms/:mechanismId`: delete a mechanism.
- `GET /api/part-definitions`: list part definitions.
- `POST /api/part-definitions`: create a part definition.
- `PATCH /api/part-definitions/:partDefinitionId`: update a part definition.
- `DELETE /api/part-definitions/:partDefinitionId`: delete a part definition.
- `GET /api/part-instances`: list part instances.
- `POST /api/part-instances`: create a part instance.
- `PATCH /api/part-instances/:partInstanceId`: update a part instance.
- `DELETE /api/part-instances/:partInstanceId`: delete a part instance.

## Media Uploads

- `POST /api/media/presign-upload`: returns a presigned image upload target in the selected project's team bucket when S3-compatible storage is configured.
- `POST /api/media/presign-video-upload`: returns a presigned video upload target in the selected project's team bucket when S3-compatible storage is configured.

## Iterations And Findings

- `GET /api/iterations`: list design iterations.
- `GET /api/findings`: list findings across reports and tests.

## STEP CAD

- `POST /api/cad/step-imports/debug-parse`: parse a STEP payload and return diagnostics without persisting an import.
- `POST /api/cad/step-imports`: create a STEP import run and CAD snapshot.
- `GET /api/cad/import-runs`: list STEP/generic CAD import runs.
- `GET /api/cad/import-runs/:importRunId`: get one import run with snapshot and warnings.
- `GET /api/cad/snapshots`: list CAD snapshots.
- `GET /api/cad/snapshots/:snapshotId`: get snapshot metadata and parser summary counts.
- `GET /api/cad/snapshots/:snapshotId/tree`: get the assembly tree.
- `GET /api/cad/snapshots/:snapshotId/mappings`: get snapshot mapping proposals.
- `GET /api/cad/snapshots/:snapshotId/hierarchy-review`: get hierarchy review data.
- `GET /api/cad/snapshots/:snapshotId/part-match-proposals`: get proposed matches to existing part records.
- `POST /api/cad/snapshots/:snapshotId/hierarchy-review/apply`: apply hierarchy review decisions.
- `POST /api/cad/snapshots/:snapshotId/mappings/apply`: apply mapping review decisions.
- `POST /api/cad/snapshots/:snapshotId/finalize`: finalize a snapshot.
- `GET /api/cad/snapshots/:snapshotId/diff`: compare a snapshot to the previous comparable snapshot.
- `POST /api/cad/mapping-rules`: create a reusable mapping rule.
- `PATCH /api/cad/mapping-rules/:id`: update a mapping rule.

## Onshape

- `GET /api/onshape/overview`: full Onshape runtime overview.
- `GET /api/onshape/document-refs`: list saved document references.
- `POST /api/onshape/document-refs`: parse and save an Onshape document reference.
- `GET /api/onshape/import-estimate`: estimate sync calls and budget fit.
- `GET /api/onshape/budget`: read the local Onshape API budget record.
- `POST /api/onshape/import-runs`: start a link-only, shallow, BOM, or deep-release import.
- `GET /api/onshape/import-runs`: list Onshape import runs.
- `GET /api/onshape/import-runs/:importRunId`: get one Onshape import run with logs, warnings, and snapshots.
- `GET /api/onshape/snapshots`: list Onshape snapshots.
- `GET /api/onshape/cad-tree`: get Onshape assembly nodes.
- `GET /api/onshape/parts`: get Onshape part definitions and instances.
- `GET /api/onshape/warnings`: list Onshape warnings.
- `POST /api/onshape/oauth/authorization-url`: create an OAuth authorization URL.
- `GET /api/onshape/oauth/callback`: receive and exchange an OAuth authorization code.
- `POST /api/onshape/oauth/refresh`: refresh Onshape OAuth credentials.
