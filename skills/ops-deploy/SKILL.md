---
name: ops-deploy
description: Universal application deployment patterns (git pull, zero-downtime symlink, containers, CI/CD) with mandatory pre-flight checks, DB backup, health verification, and automatic rollback.
version: 1.0
---

# ops-deploy — Universal Deployment & Rollback

Deploy is a reversible transaction, never a blind `git pull`. Every deploy records a
rollback point (PREV_COMMIT, config copy, DB backup) BEFORE mutating anything, verifies
the result with a health check AFTER, and auto-reverts on failure (Principle 3).
Application code changes ONLY through VCS/deploy — no ad-hoc edits on the server
(Principle 9). Deploys must be idempotent (Principle 4) and are WRITE-tier operations
(single confirm + impact preview + rollback ready).

## When to Use

- Shipping a new release of a web application to a server.
- Promoting a branch/tag/commit to production or staging.
- Choosing or scaffolding a deployment method for a newly provisioned app.
- Performing or preparing a rollback to a previous known-good state.

## Deployment Methods

| Method | Mechanism | Best for | Complexity | Downtime |
|--------|-----------|----------|------------|----------|
| 1. Git pull + restart | `git fetch` + `merge --ff-only`, rebuild, restart service | Single-server apps, small/medium teams | Low | Brief (restart window) |
| 2. Git + symlink (zero-downtime) | Build into `releases/<ts>`, atomic `current` symlink swap | Apps needing zero-downtime, fast rollback | Medium | None (atomic swap) |
| 3. Container compose | `docker compose pull` + `up -d` with healthcheck | Containerized stacks, reproducible images | Medium | None to brief (rolling) |
| 4. CI/CD pipeline | External runner (GitHub Actions/GitLab CI) drives method 1–3 over SSH | Teams with mature automation, multi-env | High | Depends on target method |

> Detection first (Principle 1): inspect the app directory for `.git`, `docker-compose.yml`,
> a `releases/` layout, and runtime markers (`composer.json`, `package.json`,
> `requirements.txt`/`pyproject.toml`, `go.mod`) before choosing a method.

## Method 1 — Git Pull + Restart (with auto-rollback)

A single, idempotent deploy script per app at `/usr/local/bin/<app>-deploy`. It is
stack-adaptive: the build and restart blocks branch on what is actually present.

```bash
#!/usr/bin/env bash
# /usr/local/bin/myapp-deploy
# Universal git-pull deploy with pre-checks, DB backup, health check, auto-rollback.
set -euo pipefail

# ---- Configuration (edit per app) ----
APP="myapp"
APP_DIR="/var/www/myapp"
BRANCH="main"
SERVICE="myapp"                      # systemd unit OR php-fpm pool name
HEALTH_URL="https://myapp.example.com/health"
LOG_DIR="/var/log/${APP}"
LOG="${LOG_DIR}/deploy.log"
RELEASE_USER="deploy"
MIN_FREE_MB=1024                     # abort if free disk below this

# ---- Logging ----
mkdir -p "$LOG_DIR"
log() { printf '%s [deploy] %s\n' "$(date -Is)" "$*" | tee -a "$LOG" >&2; }
fail() { log "ERROR: $*"; exit 1; }

log "=== Deploy start: ${APP} (branch ${BRANCH}) ==="

# ---- 1. Pre-check: disk space ----
FREE_MB=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
[ "$FREE_MB" -ge "$MIN_FREE_MB" ] || fail "Low disk: ${FREE_MB}MB free (< ${MIN_FREE_MB}MB)"
log "Disk OK: ${FREE_MB}MB free"

cd "$APP_DIR" || fail "App dir not found: $APP_DIR"
[ -d .git ] || fail "Not a git repository: $APP_DIR"

# ---- 2. Record rollback point ----
PREV_COMMIT=$(git rev-parse HEAD)
log "PREV_COMMIT=${PREV_COMMIT}"

# ---- 3. Backup DB before deploy (adaptive MySQL/PostgreSQL) ----
BACKUP_DIR="/var/backups/${APP}/pre-deploy"
umask 077                                       # dumps hold PII + password hashes — never world-readable
install -d -m 700 -o root -g root "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
DB_BACKUP=""
if [ -f "${APP_DIR}/.env" ]; then
  # shellcheck disable=SC1090
  DB_CONNECTION=$(grep -E '^DB_CONNECTION=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
  DB_DATABASE=$(grep -E '^DB_DATABASE=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
  DB_USERNAME=$(grep -E '^DB_USERNAME=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
  DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
fi
if [ -n "${DB_DATABASE:-}" ]; then
  case "${DB_CONNECTION:-mysql}" in
    mysql|mariadb)
      DB_BACKUP="${BACKUP_DIR}/${DB_DATABASE}-${STAMP}.sql.gz"
      # Best-effort rollback snapshot via the app's runtime (DML-only) user: omit
      # --routines/--triggers, which need privileges the app user does not hold.
      MYSQL_PWD="${DB_PASSWORD}" mysqldump --single-transaction --quick --no-tablespaces \
        -u "${DB_USERNAME}" "${DB_DATABASE}" \
        | gzip > "$DB_BACKUP" && chmod 600 "$DB_BACKUP" || fail "DB backup failed (mysql)"
      ;;
    pgsql|postgres|postgresql)
      DB_BACKUP="${BACKUP_DIR}/${DB_DATABASE}-${STAMP}.dump"
      PGPASSWORD="${DB_PASSWORD}" pg_dump -Fc -U "${DB_USERNAME}" \
        -d "${DB_DATABASE}" -f "$DB_BACKUP" && chmod 600 "$DB_BACKUP" || fail "DB backup failed (postgres)"
      ;;
    *) log "Unknown DB_CONNECTION='${DB_CONNECTION}', skipping DB backup" ;;
  esac
  [ -n "$DB_BACKUP" ] && log "DB backup: ${DB_BACKUP}"
else
  log "No DB_DATABASE detected, skipping DB backup"
fi

# ---- 4. Fetch & fast-forward (preserve untracked WIP) ----
# NEVER `git reset --hard` here: it discards local config edits and `git clean` would
# remove untracked files (e.g. uploaded assets, generated .env). Use ff-only merge so
# a deploy aborts loudly if the working tree has diverged, rather than silently nuking it.
git fetch --prune origin "$BRANCH" || fail "git fetch failed"
if ! git merge --ff-only "origin/${BRANCH}"; then
  fail "Cannot fast-forward (local divergence / dirty tree). Resolve manually; refusing to reset --hard."
fi
NEW_COMMIT=$(git rev-parse HEAD)
log "Updated ${PREV_COMMIT:0:8} -> ${NEW_COMMIT:0:8}"
# NOTE: `git reset --hard origin/$BRANCH` is ONLY acceptable on a dedicated deploy
# checkout that holds zero local state and zero untracked files by policy.

# ---- rollback helper ----
rollback() {
  log "!! AUTO-ROLLBACK to ${PREV_COMMIT:0:8}"
  git reset --hard "$PREV_COMMIT" || log "git rollback FAILED"
  build_app || log "rollback build FAILED"
  restart_service || log "rollback restart FAILED"
  log "Rollback complete. If schema changed, restore DB: ${DB_BACKUP:-<none>}"
  exit 1
}

# ---- 5. Adaptive build (per detected stack) ----
build_app() {
  if [ -f composer.json ]; then
    log "Stack: PHP"
    composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
    if [ -f artisan ]; then
      php artisan migrate --force
      php artisan config:cache && php artisan route:cache && php artisan view:cache
    fi
  fi
  if [ -f package.json ]; then
    log "Stack: Node"
    npm ci --omit=dev
    npm run build --if-present
  fi
  if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
    log "Stack: Python"
    [ -d .venv ] || python3 -m venv .venv
    ./.venv/bin/pip install -r requirements.txt 2>/dev/null \
      || ./.venv/bin/pip install . 
    [ -f manage.py ] && ./.venv/bin/python manage.py migrate --noinput || true
  fi
  if [ -f go.mod ]; then
    log "Stack: Go"
    go build -o "build/${APP}" ./... || go build -o "build/${APP}" .
  fi
}
build_app || rollback

# ---- 6. Fix permissions (idempotent) ----
chown -R "${RELEASE_USER}:www-data" "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 750 {} +
find "$APP_DIR" -type f -exec chmod 640 {} +
chmod 750 "$APP_DIR"
# Laravel/framework writable paths
for d in storage bootstrap/cache; do
  [ -d "${APP_DIR}/${d}" ] && chmod -R 770 "${APP_DIR}/${d}"
done

# ---- 7. Adaptive restart ----
restart_service() {
  if systemctl list-unit-files | grep -q "^${SERVICE}\.service"; then
    systemctl restart "${SERVICE}.service"
  elif systemctl is-active --quiet php8.3-fpm 2>/dev/null; then
    systemctl reload php8.3-fpm
  elif systemctl is-active --quiet php8.4-fpm 2>/dev/null; then
    systemctl reload php8.4-fpm
  elif command -v pm2 >/dev/null; then
    sudo -u "$RELEASE_USER" pm2 reload "$APP"
  else
    log "No known service to restart for ${APP}"
  fi
}
restart_service || rollback

# ---- 8. Post-deploy health check (auto-rollback on failure) ----
log "Health check: ${HEALTH_URL}"
OK=0
for i in 1 2 3 4 5; do
  CODE=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || echo 000)
  if [ "$CODE" = "200" ]; then OK=1; log "Health OK (200) on attempt ${i}"; break; fi
  log "Health attempt ${i}: HTTP ${CODE}, retrying..."
  sleep 3
done
[ "$OK" -eq 1 ] || rollback

# ---- 9. Success ----
log "=== Deploy SUCCESS: ${NEW_COMMIT:0:8} ==="
log "Manual rollback: cd ${APP_DIR} && sudo git reset --hard ${PREV_COMMIT}, then rebuild + restart_service (or run the /rollback command). DB snapshot: ${DB_BACKUP:-none}"
echo "DEPLOYED ${NEW_COMMIT} (prev ${PREV_COMMIT}). DB backup: ${DB_BACKUP:-none}"
```

Allow the deploy user to run only this script as root, nothing else:

```ini
# /etc/sudoers.d/myapp-deploy  (validate with: visudo -c)
deploy ALL=(root) NOPASSWD: /usr/local/bin/myapp-deploy
```

## Method 2 — Symlink Zero-Downtime

Each release is built into its own timestamped directory; a single atomic symlink swap
makes it live, so the active code never changes mid-request. Rollback is just pointing
`current` back at the previous release.

```text
/var/www/myapp/
├── releases/
│   ├── 20260614-101500/      # built, ready
│   ├── 20260614-093000/      # previous (rollback target)
│   └── ...
├── shared/                   # persists across releases
│   ├── .env
│   ├── storage/              # uploads, logs, sessions
│   └── node_modules/         # optional cache
└── current -> releases/20260614-101500   # atomic symlink
```

Procedure:

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="/var/www/myapp"; REPO="git@github.com:org/myapp.git"; BRANCH="main"
KEEP=5
TS=$(date +%Y%m%d-%H%M%S)
REL="${BASE}/releases/${TS}"

# 1. Fetch source into a fresh release dir (no impact on live `current`)
git clone --depth 1 -b "$BRANCH" "$REPO" "$REL"

# 2. Link shared mutable state into the new release
ln -sfn "${BASE}/shared/.env" "${REL}/.env"
rm -rf "${REL}/storage" && ln -sfn "${BASE}/shared/storage" "${REL}/storage"

# 3. Build inside the new release (off the hot path)
( cd "$REL"
  [ -f composer.json ] && composer install --no-dev -o --no-interaction
  [ -f package.json ]  && npm ci --omit=dev && npm run build --if-present
  [ -f artisan ]       && php artisan migrate --force
)

# 4. Atomic swap (single syscall; readers never see a half-state)
PREV=$(readlink -f "${BASE}/current" || true)
ln -sfn "$REL" "${BASE}/current.tmp" && mv -Tf "${BASE}/current.tmp" "${BASE}/current"

# 5. Reload service (PHP-FPM picks up new path via current symlink)
systemctl reload php8.3-fpm 2>/dev/null || systemctl restart myapp 2>/dev/null || true

# 6. Health check -> rollback by re-pointing the symlink
if ! curl -fsS --max-time 10 https://myapp.example.com/health >/dev/null; then
  [ -n "$PREV" ] && ln -sfn "$PREV" "${BASE}/current" && systemctl reload php8.3-fpm
  echo "Health failed; rolled back to $PREV"; exit 1
fi

# 7. Cleanup: keep only the last $KEEP releases
ls -1dt "${BASE}/releases/"*/ | tail -n +$((KEEP+1)) | xargs -r rm -rf
echo "Live: $REL"
```

## Method 3 — Container (Docker Compose)

Pull the new pinned image, recreate with health gating, roll back to the previous image
tag if the container never becomes healthy.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/myapp                       # holds docker-compose.yml + .env
NEW_TAG="${1:?usage: deploy <image-tag>}"
SVC="web"

# 1. Record current (rollback) tag
PREV_TAG=$(docker compose config | awk -F: '/image:/{print $NF; exit}')   # tag only (e.g. v1.2.3), matches IMAGE_TAG
echo "PREV_TAG=${PREV_TAG}"

# 2. Pull & start the new tag
IMAGE_TAG="$NEW_TAG" docker compose pull "$SVC"
IMAGE_TAG="$NEW_TAG" docker compose up -d --no-deps "$SVC"

# 3. Wait for container healthcheck
CID=$(docker compose ps -q "$SVC")
for i in $(seq 1 20); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo none)
  [ "$STATUS" = "healthy" ] && break
  [ "$STATUS" = "none" ] && [ "$(docker inspect -f '{{.State.Running}}' "$CID")" = "true" ] && break
  sleep 3
done

# 4. Roll back to previous image tag on failure
if [ "${STATUS:-}" != "healthy" ] && [ "${STATUS:-}" != "none" ]; then
  echo "Unhealthy; rolling back to ${PREV_TAG}"
  IMAGE_TAG="$PREV_TAG" docker compose up -d --no-deps "$SVC"
  exit 1
fi
echo "Deployed ${SVC}:${NEW_TAG}"
```

The compose service must declare a healthcheck so the gate above is meaningful:

```yaml
services:
  web:
    image: registry.example.com/myapp:${IMAGE_TAG}
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
    restart: unless-stopped
```

## Pre-Deploy Checklist (universal)

| # | Check | Why |
|---|-------|-----|
| 1 | Target commit/tag identified & reachable | Avoid deploying an unknown HEAD |
| 2 | Free disk ≥ threshold (app + DB backup) | Build/backup must not fill the disk |
| 3 | PREV_COMMIT / current symlink / image tag recorded | Rollback point exists (Principle 3) |
| 4 | DB backed up (pre-deploy) | Schema migration must be reversible |
| 5 | `.env` / secrets present & unchanged | Avoid boot failure from missing config |
| 6 | Working tree fast-forwardable (no untracked WIP loss) | Principle 9 — server mirrors source |
| 7 | Health endpoint reachable pre-deploy | Establish a healthy baseline |
| 8 | Maintenance window / low-traffic confirmed (if downtime) | Reduce user impact |

## Post-Deploy Checklist (universal)

| # | Check | Why |
|---|-------|-----|
| 1 | Health endpoint returns 200 | App boots and serves traffic |
| 2 | Service active (`systemctl is-active`) | No crash-loop after restart |
| 3 | New commit/tag matches intended target | Right code is live |
| 4 | Error log clean since deploy timestamp | No new exceptions introduced |
| 5 | Migrations applied (expected version) | Schema in sync with code |
| 6 | Latency / 5xx rate nominal | No performance regression |
| 7 | Rollback command printed & captured in audit | Operator knows the undo path (Principle 7) |
| 8 | Old releases pruned (keep last 5) | Bounded disk usage |

## Related

- `ops-runtime-php`, `ops-runtime-node`, `ops-runtime-python`, `ops-runtime-go` — stack-specific build/restart detail.
- `ops-database` — DB backup engines, migration safety, restore.
- `ops-secrets` — `.env` provisioning and rotation referenced by builds.
- `ops-webserver` — Nginx upstream/symlink config consumed by deploys.
- `ops-backup` — full backup/restore beyond pre-deploy snapshots.
- `ops-monitoring` — health endpoints and post-deploy regression watch.
