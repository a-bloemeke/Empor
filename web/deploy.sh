#!/usr/bin/env bash
# Deploy to Vercel production and point empor-lichtenberg.vercel.app to the new build.
# Run from anywhere inside the repo.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
command -v vercel >/dev/null 2>&1 || { echo "Vercel CLI not found. Install with: npm i -g vercel"; exit 1; }
echo "Type-checking..."
npx tsc --noEmit
echo "Deploying to production..."
vercel --prod 2>&1 | tee /tmp/empor-deploy.txt
DEPLOY_URL=$(grep -oE 'https://web-[a-z0-9]+-empor-team\.vercel\.app' /tmp/empor-deploy.txt | head -1)
if [[ -n "$DEPLOY_URL" ]]; then
  echo "Aliasing empor-lichtenberg.vercel.app → $DEPLOY_URL ..."
  vercel alias "$DEPLOY_URL" empor-lichtenberg.vercel.app
  echo "✓ Live at https://empor-lichtenberg.vercel.app"
else
  echo "⚠ Could not detect deployment URL — alias not updated."
fi
