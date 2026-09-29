#!/usr/bin/env bash
# Pull the latest code from GitHub and restart the bot:
#   bash deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --omit=dev
npm run deploy
sudo systemctl restart ticket-bot
sleep 3
sudo systemctl --no-pager status ticket-bot | head -n 15
