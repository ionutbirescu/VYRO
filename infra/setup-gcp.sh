#!/usr/bin/env bash
# One-time Google Cloud setup for deploying the VYRO API. Safe to re-run.
#
#   ./infra/setup-gcp.sh                       # uses the defaults below
#   PROJECT_ID=my-project ./infra/setup-gcp.sh
#
# Creates the Artifact Registry repo, the runtime and deploy service accounts, Workload
# Identity Federation so GitHub Actions can deploy without a key file (main branch of this
# repo only), the IAM roles they need, and the GitHub Actions variables the deploy job reads.
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

echo "== GitHub Actions variables"
gh variable set GCP_PROJECT_ID --repo "$GITHUB_REPO" --body "$PROJECT_ID"
gh variable set GCP_DEPLOY_SA --repo "$GITHUB_REPO" --body "$DEPLOY_SA"
gh variable set GCP_WIF_PROVIDER --repo "$GITHUB_REPO" \
  --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"

echo "Done. Merges to main now deploy the API to Cloud Run in $REGION."
