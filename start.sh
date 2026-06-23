#!/bin/bash
set -e

cd "$(dirname "$0")/web"

echo "Starting database..."
docker compose up -d

echo "Waiting for Postgres to be ready..."
until docker compose exec -T db pg_isready -U empor -q; do
  sleep 1
done

echo "Running migrations..."
npx prisma migrate deploy

echo "Starting dev server..."
npm run dev
