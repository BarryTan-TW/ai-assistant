#!/usr/bin/env bash
# Install an Ubuntu application-menu entry for ai-assistant-bot.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
NODE_DIR="$(dirname "$(command -v node)")"
COPILOT_DIR="$(dirname "$(command -v copilot)")"

mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/ai-assistant-bot.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ai-assistant-bot
Comment=Chat with your AI product team (PO, UX/UI, QA, Android, iOS)
Exec=env PATH=${NODE_DIR}:${COPILOT_DIR}:/usr/bin:/bin ${APP_DIR}/bin/ai-assistant-bot
Icon=utilities-terminal
Terminal=true
Categories=Development;
EOF

chmod +x "$APP_DIR/bin/ai-assistant-bot"
update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
echo "Installed: $DESKTOP_DIR/ai-assistant-bot.desktop (search 'ai-assistant-bot' in Activities)"
