#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-81.200.153.155}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/quiz}"
LOG_FILE="${LOG_FILE:-deploy.log}"
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
)

log() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$*"
}

on_error() {
  log "Deploy failed. Check connectivity or remote logs."
  if [[ "${STAGE:-}" == "remote" ]]; then
    log "Fetching remote logs (last 200 lines)"
    ssh "${SSH_OPTS[@]}" -tt "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF || true
cd "${DEPLOY_PATH}"
docker compose -f docker-compose.prod.yml ps || true
docker compose -f docker-compose.prod.yml logs --tail=200 api || true
docker compose -f docker-compose.prod.yml logs --tail=200 consumer || true
docker compose -f docker-compose.prod.yml logs --tail=200 web || true
EOF
  fi
}
trap on_error ERR

STAGE="sync"
log "Syncing files to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
rsync -az --delete "${RSYNC_EXCLUDES[@]}" ./ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"

STAGE="remote"
log "Running remote build and restart"
ssh "${SSH_OPTS[@]}" -tt "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
set -euo pipefail
cd "${DEPLOY_PATH}"
export DOCKER_BUILDKIT=1
export BUILDKIT_PROGRESS=plain

echo "[remote] Docker info:"
docker --version
docker compose version

echo "[remote] Building images"
docker compose -f docker-compose.prod.yml build --no-cache

echo "[remote] Starting services"
docker compose -f docker-compose.prod.yml up -d

echo "[remote] Status"
docker compose -f docker-compose.prod.yml ps
EOF
