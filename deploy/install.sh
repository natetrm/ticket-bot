#!/usr/bin/env bash
# One-time setup on a Linux VM (Ubuntu/Debian). Run from inside the cloned repo:
#   bash deploy/install.sh
# Installs Node.js if needed, asks for the bot token, and installs a systemd service
# that starts the bot on boot and restarts it if it crashes.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE=ticket-bot
RUN_USER="$(whoami)"

cd "$APP_DIR"

# 1. Node.js 22
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node $(node -v)"

# 2. Dependencies
npm ci --omit=dev

# 3. Secrets (.env is never committed to git)
if [ ! -f .env ]; then
  read -rp "Discord bot token: " TOKEN
  read -rp "Discord application (client) ID: " CLIENT_ID
  printf 'DISCORD_TOKEN=%s\nCLIENT_ID=%s\n' "$TOKEN" "$CLIENT_ID" > .env
  chmod 600 .env
  echo "Saved .env"
fi

# 4. Register slash commands
npm run deploy

# 5. systemd service: start on boot, restart on crash, never give up retrying
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<EOF
[Unit]
Description=Discord Ticket Bot
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now $SERVICE
sleep 3
sudo systemctl --no-pager status $SERVICE | head -n 15

echo
echo "Done. The bot now starts automatically on boot and restarts if it crashes."
echo "  Logs:    journalctl -u $SERVICE -f"
echo "  Update:  bash deploy/update.sh"
