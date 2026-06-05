#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Colors
Y='\033[0;33m' G='\033[0;32m' R='\033[0;31m' D='\033[0;90m' N='\033[0m'
step() { echo -e "\n${Y}▸${N} $1"; }
ok()   { echo -e "  ${G}✓${N} $1"; }
fail() { echo -e "  ${R}✗${N} $1"; exit 1; }

echo -e "${Y}xpntl${N} · local dev bootstrap"
echo -e "${D}──────────────────────────────${N}"

# 1. Check prerequisites
step "Checking prerequisites"
command -v node  >/dev/null || fail "node not found — install Node 22+"
command -v pnpm  >/dev/null || fail "pnpm not found — run: corepack enable"
command -v docker >/dev/null || fail "docker not found"
NODE_V=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_V" -ge 22 ] || fail "Node 22+ required (found v$NODE_V)"
ok "node $(node -v), pnpm $(pnpm -v), docker"

# 2. Install dependencies
step "Installing dependencies"
pnpm install --frozen-lockfile 2>&1 | tail -1
ok "pnpm install"

# 3. Start infra (postgres, minio, mailpit)
step "Starting infrastructure (Docker Compose)"
docker compose -f infra/docker-compose/docker-compose.yml up -d 2>&1 | tail -3
ok "postgres :15432 · minio :19000 · mailpit :18025"

# 4. Wait for postgres
step "Waiting for Postgres"
for i in $(seq 1 30); do
  if docker compose -f infra/docker-compose/docker-compose.yml exec -T postgres pg_isready -U xpntl -d xpntl >/dev/null 2>&1; then
    ok "Postgres ready"
    break
  fi
  [ "$i" -eq 30 ] && fail "Postgres not ready after 30s"
  sleep 1
done

# 5. Run migrations
step "Running migrations"
pnpm db:migrate 2>&1 | tail -1
ok "Migrations applied"

# 6. Seed (optional, skip if already seeded)
step "Seeding dev data"
pnpm seed:dev 2>&1 | tail -3 || ok "Seed skipped (may already exist)"
ok "Dev data ready"

# 7. .env check
step "Checking .env"
if [ ! -f .env ]; then
  fail ".env not found — copy .env.example and fill in secrets"
fi
ok ".env exists"

# 8. Summary
echo ""
echo -e "${D}──────────────────────────────${N}"
echo -e "${G}Ready.${N} Run ${Y}pnpm dev${N} to start the app."
echo ""
echo -e "  ${D}API${N}      http://localhost:4000/v1/health"
echo -e "  ${D}Web${N}      http://localhost:5173"
echo -e "  ${D}GraphQL${N}  http://localhost:4000/graphql"
echo -e "  ${D}Mailpit${N}  http://localhost:18025"
echo -e "  ${D}MinIO${N}    http://localhost:19001"
echo -e "  ${D}Postgres${N} localhost:15432 (xpntl/xpntl)"
echo ""
