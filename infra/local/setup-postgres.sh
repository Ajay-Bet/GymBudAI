#!/usr/bin/env bash
# GymBud local development database setup (macOS Homebrew PostgreSQL or Linux with psql).
#
# Creates, if missing:
#   - role gymbud (LOGIN CREATEDB) -- local development only, never a cloud account
#   - databases gymbud_dev and gymbud_test, owned by gymbud
# Safe to run repeatedly: existing objects are left as they are.
#
# Authentication: by default the role has no password and relies on the local
# server's trust/peer configuration (Homebrew's default is trust on localhost).
# To give the role a password instead, set GYMBUD_DB_PASSWORD before running;
# put the same password in DATABASE_URL in backend/.env (gitignored), never in Git.
#
# Environment overrides:
#   PGADMIN_USER   superuser/admin role used to connect (default: Homebrew -> $USER, Linux -> postgres via sudo)
#   PGHOST, PGPORT standard libpq variables (default: local socket, 5432)
#   GYMBUD_DB_PASSWORD optional password for the gymbud role
set -euo pipefail

ROLE=gymbud
DATABASES=(gymbud_dev gymbud_test)

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install PostgreSQL 18 first:" >&2
  echo "  macOS:  brew install postgresql@18 && brew services start postgresql@18" >&2
  echo "  Linux:  install postgresql-18 from your distribution or apt.postgresql.org" >&2
  exit 1
fi

if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -q; then
  echo "PostgreSQL is not accepting connections. Start it first:" >&2
  echo "  macOS:  brew services start postgresql@18" >&2
  echo "  Linux:  sudo systemctl start postgresql" >&2
  exit 1
fi

# Choose how to run admin SQL.
if [[ -n "${PGADMIN_USER:-}" ]]; then
  ADMIN=(psql -U "$PGADMIN_USER")
elif [[ "$(uname -s)" == "Darwin" ]]; then
  ADMIN=(psql -U "$USER")
elif id postgres >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  ADMIN=(sudo -u postgres psql)
else
  ADMIN=(psql -U postgres)
fi

admin_sql() {
  "${ADMIN[@]}" -X -q -v ON_ERROR_STOP=1 -d postgres -tA "$@"
}

if [[ "$(admin_sql -c "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'")" == "1" ]]; then
  echo "Role $ROLE already exists (left unchanged)."
else
  admin_sql -c "CREATE ROLE $ROLE LOGIN CREATEDB"
  echo "Created role $ROLE (LOGIN CREATEDB)."
fi

if [[ -n "${GYMBUD_DB_PASSWORD:-}" ]]; then
  # Passed as a psql variable so the value is quoted safely and not echoed.
  admin_sql -v pw="$GYMBUD_DB_PASSWORD" <<'SQL'
ALTER ROLE gymbud PASSWORD :'pw';
SQL
  echo "Set password for role $ROLE from GYMBUD_DB_PASSWORD."
fi

for db in "${DATABASES[@]}"; do
  if [[ "$(admin_sql -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" == "1" ]]; then
    echo "Database $db already exists (left unchanged)."
  else
    admin_sql -c "CREATE DATABASE $db OWNER $ROLE"
    echo "Created database $db (owner $ROLE)."
  fi
done

cat <<'EOF'

Local databases are ready. Next steps:
  cd backend
  source .venv/bin/activate        # or create it: python3.12 -m venv .venv && pip install -r requirements.txt -r requirements-dev.txt
  python -m alembic upgrade head   # applies migrations to DATABASE_URL (default gymbud_dev)
  python -m pytest -q              # tests use TEST_DATABASE_URL (default gymbud_test)

Default URLs (no password):
  DATABASE_URL=postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_dev
  TEST_DATABASE_URL=postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_test
EOF
