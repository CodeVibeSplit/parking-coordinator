#!/bin/bash
set -e

BASE_URL=${1:?Usage: set-slack-urls.sh <base_url>}

: ${SLACK_APP_TOKEN:?SLACK_APP_TOKEN is required}
: ${SLACK_APP_ID:?SLACK_APP_ID is required}

echo "Fetching current Slack manifest..."
EXPORT_RESPONSE=$(curl -sf "https://slack.com/api/apps.manifest.export" \
  -H "Authorization: Bearer $SLACK_APP_TOKEN" \
  -G -d "app_id=$SLACK_APP_ID")
echo "Export response: $EXPORT_RESPONSE"
MANIFEST=$(echo "$EXPORT_RESPONSE" | jq -e '.manifest')

echo "Setting slash command and interactivity URLs to $BASE_URL/slack/events ..."
UPDATED=$(echo "$MANIFEST" | jq --arg url "$BASE_URL/slack/events" '
  .features.slash_commands[].url = $url |
  .settings.interactivity.request_url = $url
')

RESULT=$(curl -sf -X POST "https://slack.com/api/apps.manifest.update" \
  -H "Authorization: Bearer $SLACK_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\": \"$SLACK_APP_ID\", \"manifest\": $UPDATED}")

if echo "$RESULT" | jq -e '.ok' > /dev/null; then
  echo "Done — manifest updated to $BASE_URL"
else
  echo "Error updating manifest: $(echo "$RESULT" | jq -r '.error')"
  exit 1
fi
