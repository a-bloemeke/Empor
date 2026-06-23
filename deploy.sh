#!/usr/bin/env bash
# deploy.sh — deploy Empor to Vercel + Neon
#
# First-time setup:
#   1. Create a Neon project at https://neon.tech and copy the pooled connection string
#   2. Install Vercel CLI: npm i -g vercel
#   3. Run: ./deploy.sh --setup   (links project, sets env vars, runs first migration)
#
# Subsequent deploys:
#   ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/web"

# ─── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
error() { echo -e "${RED}✖ $*${NC}" >&2; exit 1; }

# ─── Dependency checks ────────────────────────────────────────────────────────
command -v vercel >/dev/null 2>&1 || error "Vercel CLI not found. Install with: npm i -g vercel"
command -v node   >/dev/null 2>&1 || error "node not found"
command -v npx    >/dev/null 2>&1 || error "npx not found"

cd "$WEB_DIR"

# ─── First-time setup ─────────────────────────────────────────────────────────
if [[ "${1:-}" == "--setup" ]]; then
  info "=== First-time setup ==="

  # Prompt for Neon DATABASE_URL
  echo ""
  echo "Paste your Neon pooled connection string"
  echo "(format: postgresql://user:pass@ep-xxx.pooler.neon.tech/neondb?sslmode=require)"
  read -r -p "DATABASE_URL: " NEON_URL
  [[ -z "$NEON_URL" ]] && error "DATABASE_URL cannot be empty"

  # Generate AUTH_SECRET
  AUTH_SECRET_VAL="$(openssl rand -base64 32)"
  info "Generated AUTH_SECRET"

  # Run Prisma migrations against Neon
  info "Running database migrations against Neon..."
  DATABASE_URL="$NEON_URL" npx prisma migrate deploy
  info "Migrations complete"

  # Link to Vercel project (interactive — creates/links project)
  info "Linking to Vercel project..."
  vercel link

  # Set environment variables in Vercel (production + preview)
  info "Setting environment variables in Vercel..."
  vercel env add DATABASE_URL production  <<< "$NEON_URL"
  vercel env add DATABASE_URL preview     <<< "$NEON_URL"
  vercel env add AUTH_SECRET  production  <<< "$AUTH_SECRET_VAL"
  vercel env add AUTH_SECRET  preview     <<< "$AUTH_SECRET_VAL"

  info "=== Setup complete — running first deploy ==="
fi

# ─── Build check ──────────────────────────────────────────────────────────────
info "Type-checking..."
npx tsc --noEmit

# ─── Deploy ───────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--prod" || "${1:-}" == "--setup" ]]; then
  info "Deploying to production..."
  vercel --prod
else
  info "Deploying preview (pass --prod for production)..."
  vercel
fi

info "Done."
