#!/bin/bash
set -e

cd "$(dirname "$0")/web"

echo "Stopping Next.js dev server..."
# Find and kill any next dev process running from this directory
NEXT_PID=$(pgrep -f "next dev" 2>/dev/null || true)
if [ -n "$NEXT_PID" ]; then
  kill $NEXT_PID 2>/dev/null || true
  echo "Killed PID(s): $NEXT_PID"
fi

echo "Stopping database..."
docker compose down

echo "Done."
