# Backup Restore Drill

Backups are only useful after the restore path has been tested. Use this drill to prove a production database dump can be restored into a disposable target without touching the production Postgres volume.

## Production Backup Artifact

Production deploys write database dumps on the VPS under:

```text
/opt/pm-backups/server/pm-server-db-<timestamp>.sql
```

The timestamp is UTC in `YYYYMMDDTHHMMSSZ` format. Keep database dumps and env backups private; they may contain production data or credentials.

## Manual Backup Command

Run this from an operator machine that has SSH access to the production VPS. Set `VPS_USER` and `VPS_HOST` before running it.

```bash
ssh "$VPS_USER@$VPS_HOST" <<'EOF'
set -euo pipefail
cd /opt/pm-server
backup_root=/opt/pm-backups/server
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$backup_root"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$backup_root/pm-server-db-${timestamp}.sql"
chmod 600 "$backup_root/pm-server-db-${timestamp}.sql"
ls -lh "$backup_root/pm-server-db-${timestamp}.sql"
EOF
```

Copy the selected dump into a local disposable directory before restoring:

```bash
mkdir -p ./tmp/restore-drill
scp "$VPS_USER@$VPS_HOST:/opt/pm-backups/server/pm-server-db-YYYYMMDDTHHMMSSZ.sql" ./tmp/restore-drill/
```

## Disposable Restore Target

Never restore a drill dump into production, and never point the drill at the production `postgres-data` volume.

Create a local restore env file from the production example:

```bash
cp .env.production.example .env.restore-drill
```

Edit `.env.restore-drill` so the database values are disposable and non-production:

```env
POSTGRES_DB=meco_restore_drill
POSTGRES_USER=meco_restore
POSTGRES_PASSWORD=replace-with-a-local-throwaway-password
DATABASE_URL=postgresql://meco_restore:replace-with-a-local-throwaway-password@postgres:5432/meco_restore_drill?schema=public
```

Start only the disposable Postgres service in an isolated Compose project:

```bash
docker compose -p meco-restore-drill --env-file .env.restore-drill -f docker-compose.prod.yml up -d postgres
```

Confirm the target is accepting connections:

```bash
docker compose -p meco-restore-drill --env-file .env.restore-drill -f docker-compose.prod.yml exec -T postgres \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Restore Command

Restore into the disposable target with `ON_ERROR_STOP=1` so SQL failures stop the drill immediately:

```bash
docker compose -p meco-restore-drill --env-file .env.restore-drill -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  < ./tmp/restore-drill/pm-server-db-YYYYMMDDTHHMMSSZ.sql
```

## Verification Checks

Run a row-count query against real Prisma table names:

```bash
docker compose -p meco-restore-drill --env-file .env.restore-drill -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' <<'SQL'
SELECT 'Member' AS table_name, COUNT(*) AS row_count FROM "Member"
UNION ALL
SELECT 'Task', COUNT(*) FROM "Task"
UNION ALL
SELECT 'Subsystem', COUNT(*) FROM "Subsystem"
UNION ALL
SELECT 'CadImportRun', COUNT(*) FROM "CadImportRun";
SQL
```

Success means:

- `pg_isready` reports that the disposable database accepts connections.
- The restore command exits with status 0.
- The row-count query returns counts for `Member`, `Task`, `Subsystem`, and `CadImportRun`.
- Counts are plausible for the dump being tested.

Optional API-level check: start the app against `.env.restore-drill` and run the local smoke test against that restored database. Use only local/disposable credentials and ports.

## Failure Handling

If any backup, restore, or verification step fails:

1. Stop immediately and do not retry against production.
2. Keep the failed dump, terminal output, and exact command used.
3. Inspect the disposable Postgres logs:

   ```bash
   docker compose -p meco-restore-drill --env-file .env.restore-drill -f docker-compose.prod.yml logs postgres
   ```

4. Confirm the dump exists, is non-empty, and came from the expected timestamp:

   ```bash
   ls -lh ./tmp/restore-drill/pm-server-db-YYYYMMDDTHHMMSSZ.sql
   ```

5. If a production dump cannot be restored, create an incident or follow-up issue before relying on that backup set.

Clean up the disposable target after a successful drill:

```bash
docker compose -p meco-restore-drill --env-file .env.restore-drill -f docker-compose.prod.yml down -v
```

## Future Automation Expectation

A future PR should prove the restore path against a disposable or local target. Minimum expected proof:

- acquire or create a SQL dump
- create an isolated restore target
- restore with `ON_ERROR_STOP=1`
- run the verification query
- clean up disposable containers and volumes unless `KEEP_RESTORE_DRILL=1` is set

The deploy workflow's current backup step may remain separate, but a future hardening PR should consider failing deploys when required backup creation fails.
