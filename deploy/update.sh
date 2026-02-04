#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-81.200.153.155}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/quiz}"
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
}
trap on_error ERR

log "Syncing files to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
rsync -az --delete "${RSYNC_EXCLUDES[@]}" ./ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"

log "Running remote build and restart"
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
set -euo pipefail
cd "${DEPLOY_PATH}"
export DOCKER_BUILDKIT=1

echo "[remote] Docker info:"
docker --version
docker compose version

echo "[remote] Building images"
docker buildx bake --progress=plain

echo "[remote] Starting services"
docker compose -f docker-compose.prod.yml up -d

echo "[remote] Status"
docker compose -f docker-compose.prod.yml ps
EOF
