#!/bin/sh
set -e

echo "[entrypoint] DATABASE_URL host: $(echo $DATABASE_URL | sed 's/\/\/.*@/\/\/***@/')"

echo "[entrypoint] Applying database schema..."
attempt=0
max_attempts=30
schema_ok=0

while [ $attempt -lt $max_attempts ]; do
  if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
    set +e
    migrate_out=$(npx prisma migrate deploy 2>&1)
    migrate_exit=$?
    set -e
    if [ $migrate_exit -eq 0 ]; then
      echo "[entrypoint] Migrations applied successfully"
      schema_ok=1
      break
    fi
    if echo "$migrate_out" | grep -q "P3005\|database schema is not empty"; then
      echo "[entrypoint] Database already has schema (P3005), baselining..."
      if npx prisma db push 2>&1; then
        echo "[entrypoint] Schema synced via db push"
        for m in prisma/migrations/*/; do
          [ -d "$m" ] || continue
          name=$(basename "$m")
          echo "[entrypoint] Marking migration as applied: $name"
          npx prisma migrate resolve --applied "$name" 2>&1 || true
        done
        schema_ok=1
        break
      fi
    fi
    echo "$migrate_out"
  else
    if npx prisma db push 2>&1; then
      echo "[entrypoint] Schema pushed successfully"
      schema_ok=1
      break
    fi
  fi
  attempt=$((attempt + 1))
  echo "[entrypoint] DB not ready, retrying ($attempt/$max_attempts)..."
  sleep 2
done

if [ $schema_ok -ne 1 ]; then
  echo "[entrypoint] ERROR: Could not apply database schema after $max_attempts attempts"
  exit 1
fi

echo "[entrypoint] Starting server..."
exec node dist/index.js
