# Audit Retention Policy

Mission Control audit history is a safety and accountability record for team operations. It should remain available long enough to support season reviews, incident follow-up, and mentor oversight while avoiding indefinite retention of student activity records.

## Retention Period

- Keep audit history for active seasons and for seven years after the season end date.
- If a season has no configured end date, measure the seven-year retention window from the last day of that calendar year.
- Keep audit history that is tied to an open safety, financial, compliance, or conduct review until that review is closed, even if the normal retention window has elapsed.
- Review retained audit history at least once per year before the next competition season begins.

## Minors And Privacy

- Treat audit history as student activity data when it contains member names, emails, task ownership, work logs, QA decisions, or roster changes.
- Do not export audit history to public channels, training data, or shared documents unless student identifiers are removed or the export is limited to approved mentors/admins.
- Prefer redacted summaries for retrospectives and public season reports.
- Delete or anonymize audit records after the retention window unless a documented review hold still applies.
- Do not store authentication secrets, OAuth tokens, email codes, or raw private media in audit details. Audit details should reference the affected entity and summarized field changes only.

## Archive And Delete Behavior

- Archived seasons keep audit history read-only for mentor/admin review.
- Archive operations must not silently drop audit history that is still inside the retention window.
- Deletion after the retention window should remove or anonymize member-identifying audit fields, including actor, member, email, and free-text details that identify a student.
- Deletion should preserve aggregate counts only when they no longer identify individual students.
- Backup retention should not intentionally extend audit history beyond this policy. Expired records may remain in immutable backups until those backups age out under the deployment recovery policy.

## Admin Access

- Audit history access is restricted to mentors, leads, and admins when auth is enabled.
- Bulk export, retention override, archive, and deletion tools are admin-only operations.
- Admins should record the reason for retention overrides, review holds, and manual deletions.
- Exported audit files should include the export timestamp, requesting admin, filters, and redaction mode.

## Implementation Expectations

- New audit routes should enforce role checks before returning audit data.
- Audit export endpoints should support season/project, entity type, date range, and redaction filters.
- Retention jobs should run in dry-run mode before deletion and report the seasons, date ranges, and record counts affected.
- Tests for retention or export behavior should cover role restrictions, date boundaries, review holds, and redaction of student-identifying fields.
