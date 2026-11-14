#!/usr/bin/env bash
# Deploys infra/firestore.rules to the project's Firestore database. Safe to re-run.
#
#   ./infra/deploy-firestore-rules.sh
#   PROJECT_ID=my-project ./infra/deploy-firestore-rules.sh
#
# Uses the Firebase Rules REST API with your gcloud login, so the Firebase CLI isn't needed.
# Needs gcloud logged in as someone who may edit Firebase rules (e.g. a project Owner).
set -euo pipefail

PROJECT_ID=${PROJECT_ID:-vyro-app-2026}
RULES=$(dirname "$0")/firestore.rules
API=https://firebaserules.googleapis.com/v1/projects/$PROJECT_ID
RELEASE=projects/$PROJECT_ID/releases/cloud.firestore
# The first Python that runs; on Windows "python3" can be a Microsoft Store placeholder.
for PYTHON in python3 python; do "$PYTHON" -c "" 2>/dev/null && break; done

TOKEN=$(gcloud auth print-access-token)
call() {
  curl --silent --show-error --fail-with-body -H "Authorization: Bearer $TOKEN" \
    -H "x-goog-user-project: $PROJECT_ID" -H "Content-Type: application/json" "$@"
}
json_field() { "$PYTHON" -c "import json, sys; print(json.load(sys.stdin)['$1'])"; }

echo "== Uploading $RULES"
source_json=$("$PYTHON" -c '
import json, sys
print(json.dumps({"source": {"files": [{"name": "firestore.rules", "content": open(sys.argv[1]).read()}]}}))
' "$RULES")
ruleset=$(call -X POST -d "$source_json" "$API/rulesets" | json_field name)
echo "   $ruleset"

echo "== Releasing it to Firestore"
if call "$API/releases/cloud.firestore" >/dev/null 2>&1; then
  call -X PATCH -d "{\"release\": {\"name\": \"$RELEASE\", \"rulesetName\": \"$ruleset\"}}" \
    "$API/releases/cloud.firestore" >/dev/null
else
  call -X POST -d "{\"name\": \"$RELEASE\", \"rulesetName\": \"$ruleset\"}" "$API/releases" >/dev/null
fi
echo "   done"
