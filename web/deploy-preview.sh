#!/usr/bin/env bash
# Deploy a preview (staging) instance to empor-lichtenberg-preview.vercel.app.
# Run from anywhere inside the repo — always deploys the web/ directory.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
command -v vercel >/dev/null 2>&1 || { echo "Vercel CLI not found. Install with: npm i -g vercel"; exit 1; }
echo "Type-checking..."
npx tsc --noEmit
echo "Deploying preview..."
DEPLOY_URL=$(vercel 2>&1 | tee /dev/stderr | grep -E "^  Preview\s+https://" | awk '{print $NF}')
if [[ -n "$DEPLOY_URL" ]]; then
  echo "Aliasing empor-lichtenberg-preview.vercel.app → $DEPLOY_URL ..."
  vercel alias set "$DEPLOY_URL" empor-lichtenberg-preview.vercel.app
fi
