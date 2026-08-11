# Platform Deployment And Recovery Runbook

Use this runbook for production Platform deploys, backup expectations,
incident restore decisions, and rollback paths. It documents the behavior in
`.github/workflows/deploy-vps.yml`, `docker-compose.prod.yml`,
`deploy/bootstrap-vps.sh`, `.env.production.example`, and `src/config/env.ts`.

Do not put raw secret values in this document, issues, PRs, or screenshots.

## Production Configuration

Production deploys require these GitHub secrets in
`MECO-Robotics/meco-mission-control-platform`:

- `VPS_HOST`: public IP or hostname for the production VPS.
- `VPS_USER`: SSH deploy user, for example `root` or `deploy`.
- `VPS_SSH_KEY`: private SSH key used by GitHub Actions.
- `VPS_SSH_KNOWN_HOSTS`: reviewed host-key entry for the production VPS. Do not populate it with a live `ssh-keyscan` during deployment.
- `PRODUCTION_ENV_FILE`: full `.env.production` content for the VPS.

The deploy workflow can also inject these optional email secrets at deploy time:

- `RESEND_API_KEY`
- `AUTH_EMAIL_SMTP_HOST`
- `AUTH_EMAIL_SMTP_PORT`
- `AUTH_EMAIL_SMTP_USER`
- `AUTH_EMAIL_SMTP_PASS`
- `AUTH_EMAIL_SMTP_FROM`
- `AUTH_EMAIL_FROM`

Production runtime values come from `.env.production` on the VPS. Keep the shape
aligned with `.env.production.example`.

Required production values:

- `NODE_ENV=production`
- `PORT=8080`
- `PUBLIC_PORT=8080` unless the host maps a different external port.
- `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`
- `DATABASE_URL`, usually pointing at the Compose `postgres` service.
- `CORS_ORIGIN`, set to explicit web origins. Do not use `*` in production.
- `AUTH_JWT_SECRET`, generated uniquely with at least 32 characters.
- At least one sign-in provider:
  - Google: `GOOGLE_CLIENT_ID`
  - Email: SMTP settings plus `AUTH_EMAIL_FROM`, or `RESEND_API_KEY` plus `AUTH_EMAIL_FROM`

Common production knobs:

- Rate limits: `API_RATE_LIMIT_MAX_REQUESTS`, `API_RATE_LIMIT_WINDOW_SECONDS`,
  `AUTH_RATE_LIMIT_MAX_REQUESTS`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`,
  `AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS`, and `AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS`.
- Auth lifetime/domain: `GOOGLE_ALLOWED_HOSTED_DOMAIN`, `AUTH_TOKEN_TTL`,
  `AUTH_LEGACY_BEARER_ENABLED`, optional `AUTH_LEGACY_BEARER_CUTOFF`,
  legacy-only `AUTH_DEVICE_TOKEN_TTL`, `AUTH_LEGACY_MOBILE_JWT_ENABLED`, optional
  `AUTH_LEGACY_MOBILE_JWT_CUTOFF`, and optional `AUTH_MENTOR_EMAILS`.
- Mobile session records are deployed from `prisma/schema.prisma` through the
  repository's existing `prisma db push` deployment step. Keep legacy mobile
  JWT issuance disabled after supported clients use the opaque refresh flow;
  if a transition window is required, set both the enable flag and an explicit
  UTC cutoff.
- Email code behavior: `AUTH_EMAIL_CODE_TTL_MINUTES`,
  `AUTH_EMAIL_CODE_LENGTH`, `AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS`, and
  `AUTH_EMAIL_MAX_VERIFY_ATTEMPTS`.
- Media storage: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`,
  `S3_PUBLIC_BASE_URL`, `S3_REGION`, `S3_BUCKET_PREFIX`, and
  `S3_PRESIGN_TTL_SECONDS`, plus the image/video maximum and hourly quota values.
- Slack: `SLACK_BOT_TOKEN`, `SLACK_ALERT_USERGROUP_HANDLES`, and
  `SLACK_CHANNEL_*_ID` values.
- Onshape: `ONSHAPE_BASE_URL`, `ONSHAPE_OAUTH_CLIENT_ID`,
  `ONSHAPE_OAUTH_CLIENT_SECRET`, `ONSHAPE_OAUTH_REDIRECT_URI`,
  `ONSHAPE_OAUTH_AUTHORIZATION_URL`, `ONSHAPE_OAUTH_TOKEN_URL`,
  `ONSHAPE_OAUTH_SCOPES`, token bootstrap values, and
  `ONSHAPE_CREDENTIAL_REFERENCE`.
- CAD: `CAD_STORE_DRIVER`, `CAD_STEP_UPLOAD_MAX_BYTES`, `CAD_STEP_PARSER_MODE`,
  and the parser concurrency, queue, heap, timeout, and result-size bounds.

Production startup refuses these states:

- `AUTH_JWT_SECRET` is missing, blank, or one of the sample values.
- Neither Google nor email sign-in is configured.
- `CORS_ORIGIN=*`.
- `CAD_STEP_PARSER_MODE=placeholder`.
- `AUTH_TOKEN_TTL` is not `1h` during the legacy bearer migration.
- A configured S3 or Onshape credentialed URL does not use HTTPS.

## VPS Deployment Flow

The Platform API runs on one self-managed Linux VPS with Docker Compose. First
time VPS setup uses:

```bash
deploy/bootstrap-vps.sh
```

That script installs Docker and Docker Compose on Ubuntu, installs `rsync`, and
creates `/opt/pm-server` for the deploy user.

Production deployment uses `.github/workflows/deploy-vps.yml`.

The only production deploy source is a push to protected `main`. Tag pushes,
manual dispatches, and caller-supplied release manifests do not start this
workflow. The source gate verifies that `GITHUB_SHA` is the current public
`origin/main` revision before validation or deployment continues.

The workflow deploy path is:

1. Validate the deploy source.
2. Install dependencies with `npm ci`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Validate Prisma schema with `npx prisma validate`.
7. Validate required deploy secrets.
8. Configure SSH to the VPS.
9. Back up the existing VPS deployment.
10. Ensure `/opt/pm-server` exists.
11. Sync repository files to `/opt/pm-server` with `rsync --delete`.
12. Upload `.env.production.partial` from GitHub secrets.
13. Merge `.env.production.partial` into `/opt/pm-server/.env.production`.
14. Run:

    ```bash
    docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres
    docker compose --env-file .env.production -f docker-compose.prod.yml run --rm app npm run prisma:deploy
    docker compose --env-file .env.production -f docker-compose.prod.yml run --rm app npm run prisma:normalize-event-types
    docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --remove-orphans
    ```

15. Run `docker image prune -f`.
16. Poll `http://127.0.0.1:8080/health` for up to 30 attempts.

The Compose stack contains:

- `postgres`: `postgres:16-alpine` with the named `postgres-data` volume.
- `app`: the Node API built from `Dockerfile`, with `.env.production` mounted.

The app port is published on `127.0.0.1` only. A TLS reverse proxy and firewall
are mandatory before production traffic is enabled; do not expose port 8080
directly to the public network.

The deploy workflow starts PostgreSQL, applies compatible Prisma state, and
normalizes event types before starting the application:

```bash
npm run prisma:deploy
npm run prisma:normalize-event-types
```

Ordinary application startup runs only `npm run start`; it does not perform a
schema push and never uses `--accept-data-loss`.

## Backup Behavior

Production deploys create backups before syncing new source.

Backup directory:

```text
/opt/pm-backups/server
```

Backup timestamps use UTC in `YYYYMMDDTHHMMSSZ` format.

Pre-deploy file backup:

- File name: `pm-server-files-<timestamp>.tgz`
- Source: `/opt/pm-server`
- Excludes `.git`, `node_modules`, `dist`, `.env*`, and `pm-server/.env*`
- Permissions: `0600`

Environment backup:

- File name: `pm-server-env-<timestamp>.backup`
- Source: `/opt/pm-server/.env.production`
- Permissions: `0600`

Database backup:

- File name: `pm-server-db-<timestamp>.sql`
- Source: running `postgres` Compose service
- Command shape:

  ```bash
  docker compose --env-file /opt/pm-server/.env.production -f /opt/pm-server/docker-compose.prod.yml exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'
  ```

- Permissions: `0600`

The workflow keeps the newest 20 files in `/opt/pm-backups/server`. If an
existing PostgreSQL service is unavailable or `pg_dump` fails, deployment stops
before new source is synchronized.

Manual backup command from an operator machine with VPS SSH access:

```bash
ssh "$VPS_USER@$VPS_HOST" <<'EOF'
set -euo pipefail
cd /opt/pm-server
backup_root=/opt/pm-backups/server
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
install -m 700 -d "$backup_root"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$backup_root/pm-server-db-${timestamp}.sql"
chmod 600 "$backup_root/pm-server-db-${timestamp}.sql"
ls -lh "$backup_root/pm-server-db-${timestamp}.sql"
EOF
```

## Restore Behavior

Backups are useful only after the restore path has been tested. Restore drills
must use a disposable target and must never point at the production
`postgres-data` volume.

Disposable restore expectation:

1. Copy a selected `pm-server-db-<timestamp>.sql` dump out of
   `/opt/pm-backups/server`.
2. Create an isolated Compose project or local Postgres target with disposable
   `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `DATABASE_URL`.
3. Start only the disposable Postgres target.
4. Restore with `ON_ERROR_STOP=1`:

   ```bash
   docker compose -p meco-restore-drill --env-file .env.restore-drill -f docker-compose.prod.yml exec -T postgres \
     sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' \
     < ./tmp/restore-drill/pm-server-db-YYYYMMDDTHHMMSSZ.sql
   ```

5. Verify table counts against real Prisma table names, for example `Member`,
   `Task`, `Subsystem`, and `CadImportRun`.
6. Clean up the disposable Compose project and volume after the drill.

Production incident restore outline:

1. Freeze web/mobile cutover and stop or contain write traffic.
2. Capture current state before changing it:

   ```bash
   cd /opt/pm-server
   docker compose --env-file .env.production -f docker-compose.prod.yml ps
   docker compose --env-file .env.production -f docker-compose.prod.yml logs app --tail=200
   docker compose --env-file .env.production -f docker-compose.prod.yml logs postgres --tail=200
   ```

3. Select the backup timestamp to restore from `/opt/pm-backups/server`.
4. Preserve the current broken state if investigation may need it.
5. Restore env or source files only when env drift or missing source artifacts
   caused the incident.
6. Restore the DB dump only for confirmed data corruption, bad data writes, or a
   migration/schema incident that cannot be repaired safely in place.
7. Use `psql -v ON_ERROR_STOP=1` for SQL restore commands so failures stop
   immediately.
8. Restart the stack:

   ```bash
   cd /opt/pm-server
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --remove-orphans
   ```

9. Run `docs/production-smoke-test-checklist.md` before reopening traffic or
   resuming release cutover.

## Rollback Options

Prefer the least destructive rollback that fixes the incident.

Redeploy previous source:

- Revert the affected change through the protected branch process and merge the
  revert to `main`; that protected push starts a new deployment.
- Use this when the new application code or workflow-triggered build is the
  suspected failure.

Repair production env:

- Update GitHub secrets and redeploy, or restore
  `pm-server-env-<timestamp>.backup` on the VPS when emergency env recovery is
  faster and safer.
- Use this when auth, CORS, port, provider, or integration secrets are wrong.

Restore file backup:

- Restore `pm-server-files-<timestamp>.tgz` only for emergency source/config
  recovery on the VPS.
- Do not use file restore as the normal code rollback path; prefer a workflow
  redeploy from a known git SHA.

Restore database backup:

- Restore `pm-server-db-<timestamp>.sql` only when data corruption, bad writes,
  or a bad schema/data operation is confirmed.
- Verify the chosen dump with a disposable restore whenever the incident allows
  time.
- Announce data loss risk before restoring an older production dump.

After any rollback:

- Run the production smoke checklist.
- Capture the exact backup timestamp, git SHA, deploy run, and validation
  results in the incident or PR thread.
- Keep failed dumps, logs, and commands until the root cause is closed.
