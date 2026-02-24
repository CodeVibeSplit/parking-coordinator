#!/bin/bash
set -e

# Load .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: ${SLACK_BOT_TOKEN:?SLACK_BOT_TOKEN is required}
: ${SLACK_APP_TOKEN:?SLACK_APP_TOKEN is required}

echo "Starting dev server in Socket Mode (no public URL required)..."
npm run dev
