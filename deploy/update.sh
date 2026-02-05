#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-81.200.153.155}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/quiz}"
COMPOSE_FILE="docker-compose.prod.yml"
NO_CACHE="${NO_CACHE:-}"
SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)

RSYNC_EXCLUDES=(
  --exclude ".git"
  --exclude "node_modules"
  --exclude "dist"
  --exclude ".env"
  --exclude "server/.env"
  --exclude "deploy/pgdata"
  --exclude "deploy/redis"
  --exclude ".DS_Store"
  --exclude ".cursor"
  --exclude "*.log"
)

log() {
  printf "\033[1;36m[%s]\033[0m %s\n" "$(date +"%H:%M:%S")" "$*"
}

log_ok() {
  printf "\033[1;32m[%s] ✓\033[0m %s\n" "$(date +"%H:%M:%S")" "$*"
}

log_err() {
  printf "\033[1;31m[%s] ✗\033[0m %s\n" "$(date +"%H:%M:%S")" "$*" >&2
}

on_error() {
  log_err "Deploy failed at stage: ${STAGE:-unknown}"
  if [[ "${STAGE:-}" == "remote" ]]; then
    log "Fetching remote logs..."
    ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
      "cd '${DEPLOY_PATH}' && docker compose -f ${COMPOSE_FILE} ps 2>&1; echo '---'; docker compose -f ${COMPOSE_FILE} logs --tail=50 2>&1" || true
  fi
}
trap on_error ERR

started_at=$(date +%s)

# ── Sync ──────────────────────────────────────────
STAGE="sync"
log "Syncing files to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
rsync -az --delete "${RSYNC_EXCLUDES[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  "${REPO_ROOT}/" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"
log_ok "Files synced"

# ── Remote build & deploy ────────────────────────
STAGE="remote"
BUILD_FLAG=""
if [[ -n "${NO_CACHE}" ]]; then
  BUILD_FLAG="--no-cache"
fi

log "Building and deploying on remote..."
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" bash <<ENDSSH
set -euo pipefail
cd "${DEPLOY_PATH}"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "[remote] Building images..."
docker compose -f ${COMPOSE_FILE} build ${BUILD_FLAG}

echo "[remote] Stopping old containers..."
docker compose -f ${COMPOSE_FILE} down --timeout 30

echo "[remote] Starting services..."
docker compose -f ${COMPOSE_FILE} up -d

echo "[remote] Waiting for services to become healthy..."
attempt=0
max_attempts=60
while [ \$attempt -lt \$max_attempts ]; do
  healthy=\$(docker compose -f ${COMPOSE_FILE} ps --format json 2>/dev/null | grep -c '"healthy"' || echo 0)
  total=\$(docker compose -f ${COMPOSE_FILE} ps --format json 2>/dev/null | wc -l || echo 0)
  running=\$(docker compose -f ${COMPOSE_FILE} ps --status running --format json 2>/dev/null | wc -l || echo 0)

  if [ "\$running" -ge 5 ] && [ "\$healthy" -ge 3 ]; then
    echo "[remote] All services healthy (\${healthy}/\${total} healthy, \${running} running)"
    break
  fi

  attempt=\$((attempt + 1))
  if [ \$((attempt % 10)) -eq 0 ]; then
    echo "[remote] Waiting... (\${healthy} healthy, \${running} running, attempt \${attempt}/\${max_attempts})"
  fi
  sleep 2
done

if [ \$attempt -ge \$max_attempts ]; then
  echo "[remote] WARNING: Not all services healthy after \${max_attempts} attempts"
  docker compose -f ${COMPOSE_FILE} ps
  docker compose -f ${COMPOSE_FILE} logs --tail=30
  exit 1
fi

echo ""
echo "[remote] Final status:"
docker compose -f ${COMPOSE_FILE} ps

echo ""
echo "[remote] Cleaning up old images..."
docker image prune -f --filter "until=24h" 2>/dev/null || true

echo ""
disk_usage=\$(df -h / | tail -1 | awk '{print \$5}')
echo "[remote] Disk usage: \$disk_usage"
ENDSSH

ended_at=$(date +%s)
elapsed=$((ended_at - started_at))
log_ok "Deploy complete in ${elapsed}s"
