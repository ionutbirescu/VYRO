#!/usr/bin/env bash
# Uptime monitoring for the deployed API. Safe to re-run.
#
#   ./infra/setup-monitoring.sh                          # alerts go to your gcloud account
#   ALERT_EMAIL=someone@example.com ./infra/setup-monitoring.sh   # add another recipient
#
# Checks GET /health every 5 minutes from several regions and emails ALERT_EMAIL when the
# check fails from more than one region for 10 minutes. The checks also keep one Cloud Run
# instance warm, so users rarely hit a cold start; with request-based billing that costs
# nothing extra.
set -euo pipefail
# Git Bash on Windows rewrites arguments that look like POSIX paths, which would turn
# --path=/health into a Windows path. No effect on macOS or Linux.
export MSYS2_ARG_CONV_EXCL="--path="

PROJECT_ID=${PROJECT_ID:-vyro-app-2026}
REGION=${REGION:-europe-west1}
ALERT_EMAIL=${ALERT_EMAIL:-$(gcloud config get-value account 2>/dev/null)}
CHECK_NAME="VYRO API health"
POLICY_NAME="VYRO API is down"

gc() { gcloud --project="$PROJECT_ID" --quiet "$@"; }
# Notification channels have no GA gcloud command yet, so use the REST API directly.
monitoring_api() {
  curl -sSf -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "x-goog-user-project: $PROJECT_ID" -H "Content-Type: application/json" \
    "https://monitoring.googleapis.com/v3/projects/$PROJECT_ID/$1" "${@:2}"
}
first_name() { { grep -o '"name": *"[^"]*"' || true; } | head -n1 | sed 's/.*"\(projects[^"]*\)"/\1/'; }

url=$(gc run services describe vyro-api --region="$REGION" --format='value(status.url)')
host=${url#https://}

echo "== Uptime check on $url/health"
check=$(gc monitoring uptime list-configs --filter="displayName=\"$CHECK_NAME\"" --format='value(name)')
if [[ -z $check ]]; then
  gc monitoring uptime create "$CHECK_NAME" --resource-type=uptime-url \
    --resource-labels="host=$host,project_id=$PROJECT_ID" --protocol=https --path=/health \
    --period=5 --timeout=10 --matcher-type=contains-string --matcher-content='"status":"ok"' \
    >/dev/null
  check=$(gc monitoring uptime list-configs --filter="displayName=\"$CHECK_NAME\"" --format='value(name)')
fi
check_id=${check##*/}

echo "== Email channel for $ALERT_EMAIL"
channel=$(monitoring_api "notificationChannels" -G \
  --data-urlencode "filter=type=\"email\" AND labels.email_address=\"$ALERT_EMAIL\"" | first_name)
if [[ -z $channel ]]; then
  channel=$(monitoring_api "notificationChannels" -X POST -d "{
    \"type\": \"email\", \"displayName\": \"$ALERT_EMAIL\",
    \"labels\": {\"email_address\": \"$ALERT_EMAIL\"}}" | first_name)
fi

echo "== Alert policy"
policy=$(gc monitoring policies list --filter="displayName=\"$POLICY_NAME\"" --format='value(name)')
if [[ -z $policy ]]; then
  policy_file=$(mktemp)
  cat >"$policy_file" <<EOF
{
  "displayName": "$POLICY_NAME",
  "combiner": "OR",
  "conditions": [{
    "displayName": "/health failing from more than one region",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"$check_id\" AND resource.type=\"uptime_url\"",
      "aggregations": [{
        "alignmentPeriod": "300s",
        "perSeriesAligner": "ALIGN_NEXT_OLDER",
        "crossSeriesReducer": "REDUCE_COUNT_FALSE",
        "groupByFields": ["resource.label.host"]
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1,
      "duration": "600s",
      "trigger": {"count": 1}
    }
  }],
  "notificationChannels": ["$channel"],
  "documentation": {
    "mimeType": "text/markdown",
    "content": "The VYRO API at $url/health is failing. Check the latest Cloud Run revision and its logs: https://console.cloud.google.com/run/detail/$REGION/vyro-api/logs?project=$PROJECT_ID"
  }
}
EOF
  gc monitoring policies create --policy-from-file="$policy_file" >/dev/null
  rm -f "$policy_file"
else
  # Make sure this recipient is on the existing policy.
  gc monitoring policies update "$policy" --add-notification-channels="$channel" >/dev/null
fi

echo "Done. Alerts for $url/health go to $ALERT_EMAIL."
