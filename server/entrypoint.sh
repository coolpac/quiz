#!/bin/sh
set -e

echo "[entrypoint] DATABASE_URL host: $(echo $DATABASE_URL | sed 's/\/\/.*@/\/\/***@/')"

echo "[entrypoint] Applying database schema..."
attempt=0
max_attempts=30
while [ $attempt -lt $max_attempts ]; do
  # Use db push if no migrations exist, migrate deploy otherwise
  if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
    if npx prisma migrate deploy --url "$DATABASE_URL" 2>&1; then
      echo "[entrypoint] Migrations applied successfully"
      break
    fi
  else
    if npx prisma db push --url "$DATABASE_URL" 2>&1; then
      echo "[entrypoint] Schema pushed successfully"
      break
    fi
  fi
  attempt=$((attempt + 1))
  echo "[entrypoint] DB not ready, retrying ($attempt/$max_attempts)..."
  sleep 2
done

if [ $attempt -ge $max_attempts ]; then
  echo "[entrypoint] ERROR: Could not apply database schema after $max_attempts attempts"
  exit 1
fi

echo "[entrypoint] Starting server..."
exec node dist/index.js
