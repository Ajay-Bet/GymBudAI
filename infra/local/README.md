# Local PostgreSQL for GymBud development

GymBud's backend (Sprint 5 onward) stores accounts and workouts in PostgreSQL 18 through SQLAlchemy and Alembic. Local development uses two databases owned by a local-only role:

| Item | Value |
|---|---|
| Role | `gymbud` (LOGIN CREATEDB), local development only |
| Development database | `gymbud_dev` → `DATABASE_URL=postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_dev` |
| Test database | `gymbud_test` → `TEST_DATABASE_URL=postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_test` |

The tests use `gymbud_test` and may reset it; keep your own data in `gymbud_dev`.

## Option A: Homebrew or system PostgreSQL (used on the lead's Mac)

1. Install and start PostgreSQL 18.
   - macOS: `brew install postgresql@18 && brew services start postgresql@18` (add `/opt/homebrew/opt/postgresql@18/bin` to `PATH`).
   - Linux: install `postgresql-18` (distribution packages or apt.postgresql.org) and start the service.
2. From the repository root run `bash infra/local/setup-postgres.sh`. It creates the role and both databases if they are missing and leaves existing ones unchanged, so it is safe to run again.
3. Apply migrations and run the tests:
   ```sh
   cd backend
   source .venv/bin/activate
   python -m pip install -r requirements.txt -r requirements-dev.txt
   python -m alembic upgrade head
   python -m pytest -q
   ```

### Authentication

By default the `gymbud` role has **no password**. This relies on the local server's `pg_hba.conf` allowing trust (Homebrew's default for local connections) or peer authentication. That is acceptable only on a developer machine that does not expose port 5432 to the network.

If your server requires passwords (common on Linux, where TCP connections to `127.0.0.1` use `scram-sha-256`), set one when running the script and put it in `backend/.env` (gitignored), never in Git:

```sh
GYMBUD_DB_PASSWORD='choose-a-local-password' bash infra/local/setup-postgres.sh
# backend/.env
DATABASE_URL=postgresql+psycopg://gymbud:choose-a-local-password@127.0.0.1:5432/gymbud_dev
TEST_DATABASE_URL=postgresql+psycopg://gymbud:choose-a-local-password@127.0.0.1:5432/gymbud_test
```

The script connects as an admin role: your macOS user on Homebrew, `sudo -u postgres` on Linux. Override with `PGADMIN_USER=<role>`; `PGHOST`/`PGPORT` are honoured.

## Option B: Docker (optional, not run on the lead's Mac)

`compose.yaml` starts `postgres:18` on `127.0.0.1:5432` with a named volume and trust auth. It has not been run on the lead's Mac because Docker is not installed there.

```sh
docker compose -f infra/local/compose.yaml up -d
docker compose -f infra/local/compose.yaml exec postgres createdb -U gymbud gymbud_test
```

Stop any other PostgreSQL using port 5432 first. `docker compose -f infra/local/compose.yaml down -v` deletes the data volume.

## Continuous integration

`.github/workflows/backend.yml` runs a throwaway `postgres:18` service container (trust auth, CI only), applies `alembic upgrade head` to `gymbud_test`, then runs `pytest`.

## Cloud

Cloud SQL is planned but not provisioned. See [`../gcp/README.md`](../gcp/README.md).
