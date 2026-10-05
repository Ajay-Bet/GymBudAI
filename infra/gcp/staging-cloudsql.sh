#!/usr/bin/env bash
# PROPOSED -- NOT RUN. Creates the GymBud *staging* Cloud SQL for PostgreSQL setup described in
# infra/gcp/README.md. Nothing in GCP has been provisioned by this repository.
#
# Who runs it: Ajay (or whoever he names), signed in with `gcloud auth login` on an account that can
# create Cloud SQL instances, secrets, service accounts and IAM bindings in PROJECT_ID.
# It creates billable resources. Read infra/gcp/README.md first.
#
# Flags were checked against the Cloud SQL docs on 2026-10-04 where noted in the README;
# everything else is marked "verify before running". Run `gcloud <command> --help` if in doubt.
#
# Usage:
#   PROJECT_ID=my-project REGION=us-central1 CONFIRM=yes bash infra/gcp/staging-cloudsql.sh
# Optional:
#   INSTANCE (gymbud-staging-pg)  TIER (db-f1-micro)  DB_NAME (gymbud_staging)
#   TEST_DB_NAME (gymbud_staging_test)  DB_USER (gymbud)  SA_NAME (gymbud-api-staging)
#   BILLING_ACCOUNT (e.g. 0X0X0X-0X0X0X-0X0X0X) and BUDGET_USD (e.g. 25) to create a budget alert
set -euo pipefail

if [[ "${CONFIRM:-}" != "yes" ]]; then
  echo "Refusing to run: this creates billable GCP resources. Set CONFIRM=yes after reading infra/gcp/README.md." >&2
  exit 2
fi

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:?Set REGION (same region as the planned Cloud Run service)}"
INSTANCE="${INSTANCE:-gymbud-staging-pg}"
TIER="${TIER:-db-f1-micro}"
DB_NAME="${DB_NAME:-gymbud_staging}"
TEST_DB_NAME="${TEST_DB_NAME:-gymbud_staging_test}"
DB_USER="${DB_USER:-gymbud}"
SA_NAME="${SA_NAME:-gymbud-api-staging}"
PASSWORD_SECRET="${PASSWORD_SECRET:-gymbud-staging-db-password}"
URL_SECRET="${URL_SECRET:-gymbud-staging-database-url}"

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${INSTANCE}"
G=(gcloud --project="$PROJECT_ID" --quiet)

echo "== Enabling APIs"
"${G[@]}" services enable sqladmin.googleapis.com secretmanager.googleapis.com iam.googleapis.com billingbudgets.googleapis.com

echo "== Creating Cloud SQL instance $INSTANCE ($TIER, $REGION)"
# Shared-core tiers need the Enterprise edition (PostgreSQL 16+ defaults to Enterprise Plus).
# --storage-auto-increase, --availability-type, --retained-transaction-log-days: verify before running.
"${G[@]}" sql instances create "$INSTANCE" \
  --database-version=POSTGRES_18 \
  --edition=ENTERPRISE \
  --tier="$TIER" \
  --region="$REGION" \
  --availability-type=zonal \
  --storage-type=SSD \
  --storage-size=10 \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7 \
  --deletion-protection

echo "== Creating databases $DB_NAME and $TEST_DB_NAME"
"${G[@]}" sql databases create "$DB_NAME" --instance="$INSTANCE"
"${G[@]}" sql databases create "$TEST_DB_NAME" --instance="$INSTANCE"

echo "== Creating database user $DB_USER with a generated password stored only in Secret Manager"
DB_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=\n' | cut -c1-32)"
printf '%s' "$DB_PASSWORD" | "${G[@]}" secrets create "$PASSWORD_SECRET" --replication-policy=automatic --data-file=-
# Note: --password is visible to other local processes while the command runs; run on a single-user machine.
"${G[@]}" sql users create "$DB_USER" --instance="$INSTANCE" --password="$DB_PASSWORD"

# Cloud Run cannot interpolate a secret into a larger env value, so the full URL is its own secret.
# psycopg/libpq appends /.s.PGSQL.5432 to the socket directory automatically.
printf '%s' "postgresql+psycopg://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}" \
  | "${G[@]}" secrets create "$URL_SECRET" --replication-policy=automatic --data-file=-
unset DB_PASSWORD

echo "== Creating runtime service account $SA_NAME (Cloud SQL Client + access to the two secrets only)"
"${G[@]}" iam service-accounts create "$SA_NAME" --display-name="GymBud API (staging)"
"${G[@]}" projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/cloudsql.client --condition=None
for secret in "$PASSWORD_SECRET" "$URL_SECRET"; do
  "${G[@]}" secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SA_EMAIL}" --role=roles/secretmanager.secretAccessor
done

if [[ -n "${BILLING_ACCOUNT:-}" && -n "${BUDGET_USD:-}" ]]; then
  echo "== Creating budget alert (${BUDGET_USD} USD; notifies only, does not cap spending)"
  # verify before running: requires billing.budgets.create on the billing account.
  "${G[@]}" billing budgets create \
    --billing-account="$BILLING_ACCOUNT" \
    --display-name="GymBud staging" \
    --budget-amount="${BUDGET_USD}USD" \
    --filter-projects="projects/${PROJECT_ID}" \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0
else
  echo "== Skipping budget alert (set BILLING_ACCOUNT and BUDGET_USD, or create it in the console)"
fi

cat <<EOF

Done. Record in docs/sprints/sprint-5-STATUS.md what was created:
  instance connection name: ${CONNECTION_NAME}
  databases: ${DB_NAME}, ${TEST_DB_NAME}; user: ${DB_USER}
  secrets: ${PASSWORD_SECRET}, ${URL_SECRET}; service account: ${SA_EMAIL}
Next: follow "Staging migration and integration test runbook" in infra/gcp/README.md.
EOF
