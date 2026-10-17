#!/usr/bin/env bash
# One-time Google Cloud setup for deploying the VYRO API. Safe to re-run.
#
#   ./infra/setup-gcp.sh                       # uses the defaults below
#   PROJECT_ID=my-project ./infra/setup-gcp.sh
#
# Creates the Artifact Registry repo, the runtime and deploy service accounts, Workload
# Identity Federation so GitHub Actions can deploy without a key file (main branch of this
# repo only), the IAM roles they need, and the GitHub Actions variables the deploy job reads.
# Then the data stores: Cloud SQL (with its URL in Secret Manager and a migration job),
# Firestore for chat, and the bucket for proof photos.
# Needs gcloud logged in as a project Owner and gh logged in with admin rights on the repo.
set -euo pipefail

PROJECT_ID=${PROJECT_ID:-vyro-app-2026}
REGION=${REGION:-europe-west1}
GITHUB_REPO=${GITHUB_REPO:-ionutbirescu/VYRO}
GITHUB_REPO_ID=${GITHUB_REPO_ID:-$(gh api "repos/$GITHUB_REPO" --jq .id)}

RUNTIME_SA=vyro-api@$PROJECT_ID.iam.gserviceaccount.com
DEPLOY_SA=github-deployer@$PROJECT_ID.iam.gserviceaccount.com
BUILD_BUCKET=gs://${PROJECT_ID}_cloudbuild
POOL=github
PROVIDER=vyro-main

gc() { gcloud --project="$PROJECT_ID" --quiet "$@"; }
exists() { "$@" >/dev/null 2>&1; }
PROJECT_NUMBER=$(gc projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "== Services"
gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com secretmanager.googleapis.com \
  sqladmin.googleapis.com firestore.googleapis.com storage.googleapis.com \
  aiplatform.googleapis.com monitoring.googleapis.com logging.googleapis.com

echo "== Artifact Registry"
exists gc artifacts repositories describe vyro --location="$REGION" ||
  gc artifacts repositories create vyro --repository-format=docker --location="$REGION" \
    --description="VYRO container images"
# Keep the 5 newest images and delete anything older than a week; the free tier is 0.5 GB.
gc artifacts repositories set-cleanup-policies vyro --location="$REGION" \
  --policy="$(dirname "$0")/gcp/ar-cleanup-policy.json" >/dev/null

echo "== Service accounts"
exists gc iam service-accounts describe "$RUNTIME_SA" ||
  gc iam service-accounts create vyro-api --display-name="VYRO API (Cloud Run runtime)"
exists gc iam service-accounts describe "$DEPLOY_SA" ||
  gc iam service-accounts create github-deployer --display-name="GitHub Actions deployer"

for role in roles/cloudbuild.builds.editor roles/run.admin roles/artifactregistry.writer \
  roles/logging.logWriter roles/serviceusage.serviceUsageConsumer roles/viewer; do
  gc projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" \
    --role="$role" --condition=None >/dev/null
done
# The deployer deploys Cloud Run as the runtime account and runs Cloud Build as itself.
for sa in "$RUNTIME_SA" "$DEPLOY_SA"; do
  gc iam service-accounts add-iam-policy-binding "$sa" --member="serviceAccount:$DEPLOY_SA" \
    --role=roles/iam.serviceAccountUser >/dev/null
done

echo "== Cloud Build source bucket"
exists gc storage buckets describe "$BUILD_BUCKET" ||
  gc storage buckets create "$BUILD_BUCKET" --location="$REGION" --uniform-bucket-level-access
gc storage buckets add-iam-policy-binding "$BUILD_BUCKET" --member="serviceAccount:$DEPLOY_SA" \
  --role=roles/storage.admin >/dev/null

echo "== Workload Identity Federation for GitHub Actions"
exists gc iam workload-identity-pools describe "$POOL" --location=global ||
  gc iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
# Pinned to the numeric repo id (survives renames, can't be claimed by a look-alike repo) and
# to main, so pull requests and other branches can never get deploy credentials.
exists gc iam workload-identity-pools providers describe "$PROVIDER" --location=global \
  --workload-identity-pool="$POOL" ||
  gc iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
    --workload-identity-pool="$POOL" --display-name="VYRO main branch" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref \
    --attribute-condition="assertion.repository_id == '$GITHUB_REPO_ID' && assertion.ref == 'refs/heads/main'"
gc iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$GITHUB_REPO_ID" \
  >/dev/null

echo "== Runtime permissions"
for role in roles/cloudsql.client roles/aiplatform.user; do
  gc projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME_SA" \
    --role="$role" --condition=None >/dev/null
done
# Lets the API sign upload and view URLs for proof photos without a key file.
gc iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/iam.serviceAccountTokenCreator >/dev/null

echo "== Cloud SQL (about \$10/month: the one resource that costs money while idle)"
DB_INSTANCE=vyro-db
DB_CONNECTION=$PROJECT_ID:$REGION:$DB_INSTANCE
exists gc sql instances describe "$DB_INSTANCE" ||
  gc sql instances create "$DB_INSTANCE" --database-version=POSTGRES_17 --edition=enterprise \
    --tier=db-f1-micro --region="$REGION" --storage-size=10 --storage-auto-increase \
    --backup-start-time=02:00 --deletion-protection
exists gc sql databases describe vyro --instance="$DB_INSTANCE" ||
  gc sql databases create vyro --instance="$DB_INSTANCE"
# The password exists only inside the database URL in Secret Manager, which the API reads.
if ! exists gc secrets describe vyro-database-url; then
  password=$(openssl rand -hex 24)
  gc sql users create vyro --instance="$DB_INSTANCE" --password="$password" ||
    gc sql users set-password vyro --instance="$DB_INSTANCE" --password="$password"
  printf 'postgresql+psycopg://vyro:%s@/vyro?host=/cloudsql/%s' "$password" "$DB_CONNECTION" |
    gc secrets create vyro-database-url --replication-policy=automatic --data-file=-
fi
gc secrets add-iam-policy-binding vyro-database-url --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/secretmanager.secretAccessor >/dev/null

echo "== Migration job"
# Cloud Build updates this job's image and runs it before every deploy.
image=$(gc run services describe vyro-api --region="$REGION" \
  --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || true)
if [[ -z $image ]]; then
  echo "No vyro-api service yet: re-run this script after the first deploy to add the job."
else
  exists gc run jobs describe vyro-migrate --region="$REGION" ||
    gc run jobs create vyro-migrate --image="$image" --region="$REGION" \
      --service-account="$RUNTIME_SA" --set-cloudsql-instances="$DB_CONNECTION" \
      --set-secrets=VYRO_DATABASE_URL=vyro-database-url:latest \
      --set-env-vars="VYRO_ENV=prod,VYRO_AUTH_MODE=firebase,VYRO_FIREBASE_PROJECT_ID=$PROJECT_ID" \
      --command=alembic --args=upgrade,head --max-retries=0 --task-timeout=10m
  gc run jobs execute vyro-migrate --region="$REGION" --wait
fi

echo "== Firestore (challenge chat)"
exists gc firestore databases describe --database="(default)" ||
  gc firestore databases create --database="(default)" --location="$REGION" \
    --type=firestore-native

echo "== Proof photo bucket"
PROOF_BUCKET=gs://$PROJECT_ID-proofs
exists gc storage buckets describe "$PROOF_BUCKET" ||
  gc storage buckets create "$PROOF_BUCKET" --location="$REGION" --uniform-bucket-level-access \
    --public-access-prevention
gc storage buckets add-iam-policy-binding "$PROOF_BUCKET" --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/storage.objectAdmin >/dev/null

echo "== GitHub Actions variables"
gh variable set GCP_PROJECT_ID --repo "$GITHUB_REPO" --body "$PROJECT_ID"
gh variable set GCP_DEPLOY_SA --repo "$GITHUB_REPO" --body "$DEPLOY_SA"
gh variable set GCP_WIF_PROVIDER --repo "$GITHUB_REPO" \
  --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"

echo "Done. Merges to main now deploy the API to Cloud Run in $REGION."
