#!/usr/bin/env bash
# Deploy this Next.js app to Vercel (production).
# Run from anywhere inside the repo — always deploys the web/ directory.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
command -v vercel >/dev/null 2>&1 || { echo "Vercel CLI not found. Install with: npm i -g vercel"; exit 1; }
echo "Type-checking..."
npx tsc --noEmit
echo "Deploying to production..."
vercel --prod 2>&1 | tee /tmp/empor-deploy.txt
DEPLOY_URL=$(grep -E "^  Production\s+https://" /tmp/empor-deploy.txt | awk '{print $NF}')
if [[ -n "$DEPLOY_URL" ]]; then
  echo "Aliasing empor-lichtenberg.vercel.app → $DEPLOY_URL ..."
  vercel alias set "$DEPLOY_URL" empor-lichtenberg.vercel.app
fi
