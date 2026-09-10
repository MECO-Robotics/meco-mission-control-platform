# Production smoke test checklist (Platform + web integration)

Use this checklist after each production deploy (or before cutting traffic over)
to verify the Platform API is truly reachable through the expected web path.

## Environment assumptions (do not put secrets in this document)

- `PLATFORM_API_BASE_URL`: production Platform base URL, for example `https://api.mecorobotics.org`
  (or `https://api.example.com`).
- `WEB_BASE_URL` (optional): web frontend origin that should proxy API calls, for example
  `https://app.mecorobotics.org`.
- `PLATFORM_TEST_TOKEN` (optional): valid opaque mobile access token for a production user session if you need
  auth-protected endpoint checks.
- `SMOKE_REQUIRE_AUTH_ENABLED=1`: required for production smoke runs so disabled auth
  fails the check; local/dev runs default this to off.
- Tests should run against real production endpoints only when rollback is approved.

## 1) Process started / service boot (`/health`)

Run:

```bash
curl -i "${PLATFORM_API_BASE_URL}/health"
```

- Success:
  - `HTTP 200`
  - JSON body includes `"status":"ok"` and `"service":"meco-platform"`
  - `timestamp` is present
- Failure to expect:
  - connection refused / timeout: container or listener not healthy
  - non-200: app did not finish boot with full startup path

## 2) Auth config contract (`/api/auth/config`)

Run:

```bash
curl -i "${PLATFORM_API_BASE_URL}/api/auth/config"
```

- Success:
  - `HTTP 200`
  - JSON body includes:
    - `enabled` (boolean, should be `true` in production)
    - `hostedDomain` (for example `mecorobotics.org`)
    - `googleClientId` (null only if Google flow intentionally off)
- Failure to expect:
  - 500: auth config was rejected at runtime (often missing production auth vars)
  - `enabled:false` in production: Google/SMTP sign-in settings are not set

## 3) DB reachability (production-impacting evidence)

Backup restore is covered by `docs/backup-restore-drill.md`. Production smoke checks only prove the live database is reachable; future release-bound PRs should also prove that a recent dump restores into a disposable or local target.

Run at least one of:

1. API-path check with a token:

```bash
curl -i -H "Authorization: Bearer ${PLATFORM_TEST_TOKEN}" \
  "${PLATFORM_API_BASE_URL}/api/cad/import-runs?limit=1"
```

- Success:
  - `HTTP 200` and JSON body with `items` array (can be empty)
- Failure to expect:
  - `HTTP 500` with DB connection/error text (Prisma can’t connect)
  - `HTTP 401` if token is missing/invalid

2. Socket-level reachability when running on the API host:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
```

- Success:
  - `"/var/run/postgresql:5432 - accepting connections"`
- Failure to expect:
  - `"/var/run/postgresql:5432 - no response"` or compose error: postgres is not ready

## 4) Web API proxy verification

If your web app proxies `/api` to Platform through `WEB_BASE_URL`, run:

```bash
curl -i "${WEB_BASE_URL}/api/auth/config"
```

- Success:
  - `HTTP 200`
  - JSON keys similar to direct call
- Failure to expect:
  - `HTTP 404`/HTML page: proxy route missing or wrong rewrite
  - CORS mismatch if calling direct Platform with `Origin` and getting no matching
    `access-control-allow-origin`

Example CORS probe:

```bash
curl -i -H "Origin: ${WEB_BASE_URL}" "${PLATFORM_API_BASE_URL}/api/auth/config"
```

- Success:
  - `access-control-allow-origin` matches `WEB_BASE_URL` or production allowlist
- Failure to expect:
  - header missing/other origin: web origin not in `CORS_ORIGIN`

## 5) Bootstrap endpoint health for logged-in sessions (`/api/bootstrap`)

Run with a valid token:

```bash
curl -i -H "Authorization: Bearer ${PLATFORM_TEST_TOKEN}" \
  "${PLATFORM_API_BASE_URL}/api/bootstrap?seasonId="
```

- Success:
  - `HTTP 200`
  - JSON object with core keys: `seasons`, `projects`, `members`, `tasks`, `actions`
- Failure to expect:
  - `HTTP 401` with valid token: expired or revoked access credential
  - `HTTP 500`: runtime dependency failure while hydrating bootstrap payload

Quick auth behavior check (production should be enabled):

```bash
curl -i "${PLATFORM_API_BASE_URL}/api/bootstrap"
```

- Expected for production: `HTTP 401`
- Expected for non-production/dev-only auth bypass: `HTTP 200`

## 6) Rollback / escalation

Use `docs/platform-deployment-recovery.md` for detailed rollback and restore
commands.

- On first failed check:
  1. stop the deploy step and freeze any front-end release cutover
  2. capture `docker compose ... logs app` and `docker compose ... logs postgres`
  3. confirm secret/env diffs from deployed snapshot (`.env.production`, `PUBLIC_PORT`, `CORS_ORIGIN`)
  4. re-run checks after correction
- If production is still serving user traffic after the deploy:
  - rollback by redeploying the previous approved git SHA in `deploy-vps.yml` path
  - restore database backup from `/opt/pm-backups/server` if corruption is suspected
  - notify oncall + post a remediation ETA in the thread
- Escalate to platform owner if:
  - failure reproduces after two deploy attempts
  - both API health and DB checks fail

## 7) Local/dev convenience check

Use this for CI validation and quick smoke coverage:

```bash
npm run smoke:test
```

`PLATFORM_API_BASE_URL` defaults to `http://127.0.0.1:8080`, token-gated checks are
skipped if `PLATFORM_TEST_TOKEN` is not set, and strict auth-enabled validation is
opt-in via `SMOKE_REQUIRE_AUTH_ENABLED=1`.
