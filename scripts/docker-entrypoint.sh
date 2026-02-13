#!/bin/sh
set -e

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "Waiting for $DB_HOST:$DB_PORT..."
until nc -z "$DB_HOST" "$DB_PORT"; do
  sleep 2
done
echo "Postgres is ready"

echo "Waiting for $REDIS_HOST:$REDIS_PORT..."
until nc -z "$REDIS_HOST" "$REDIS_PORT"; do
  sleep 2
done
echo "Redis is ready"

exec node dist/main.js
