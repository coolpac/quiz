#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-81.200.153.155}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/quiz}"

RSYNC_EXCLUDES=(
  --exclude ".git"
  --exclude "node_modules"
  --exclude "dist"
  --exclude ".env"
  --exclude "server/.env"
  --exclude "deploy/pgdata"
  --exclude "deploy/redis"
)

rsync -az --delete "${RSYNC_EXCLUDES[@]}" ./ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"

ssh "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
set -e
cd "${DEPLOY_PATH}"
docker compose -f docker-compose.prod.yml up -d --build
EOF
