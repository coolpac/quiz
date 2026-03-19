#!/usr/bin/env bash
# Запускать НА СЕРВЕРЕ (в /opt/quiz) — пересборка и перезапуск без rsync.
# Сначала обнови код: git pull или scp/rsync с локальной машины.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_PATH="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
NO_CACHE="${NO_CACHE:-}"

cd "${DEPLOY_PATH}"

echo "[rebuild] Working directory: ${DEPLOY_PATH}"

if [[ -d .git ]]; then
  echo "[rebuild] git pull..."
  git pull --ff-only || true
fi

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
BUILD_FLAG="${NO_CACHE:+--no-cache}"

echo "[rebuild] Building images..."
docker compose -f "${COMPOSE_FILE}" build ${BUILD_FLAG}

echo "[rebuild] Restarting services..."
docker compose -f "${COMPOSE_FILE}" down --timeout 30
docker compose -f "${COMPOSE_FILE}" up -d

echo "[rebuild] Waiting for health..."
for i in $(seq 1 30); do
  if docker compose -f "${COMPOSE_FILE}" ps 2>/dev/null | grep -q healthy; then
    echo "[rebuild] Services healthy"
    break
  fi
  sleep 2
done

docker compose -f "${COMPOSE_FILE}" ps
echo "[rebuild] Done"
