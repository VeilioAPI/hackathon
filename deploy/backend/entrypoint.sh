#!/bin/sh
set -e

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -p 5432 -U veilio -d veilio_exchange >/dev/null 2>&1; do
  sleep 2
done

echo "Waiting for Canton bootstrap..."
until [ -f /shared/.canton-ready ] && [ -f /shared/participants.json ]; do
  sleep 2
done

export PARTICIPANTS_CONFIG=/shared/participants.json

mkdir -p /app/object-store

echo "Waiting for Canton JSON API..."
until wget -q -O /dev/null http://canton:5013/readyz 2>/dev/null; do
  sleep 2
done

echo "Running database migrations..."
node dist/db/migrate.js

echo "Starting Veilio backend on port ${PORT:-3001}..."
exec node dist/index.js
