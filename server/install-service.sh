#!/usr/bin/env bash
# Installeert de paddock-server als systemd-service op deze pc (bv. ComputerVanTom),
# zodat hij bij het opstarten vanzelf start, net als vault-brain.
#
#   cd server && ./install-service.sh
#
# Daarna:
#   sudo systemctl status vault25-paddock     # draait hij?
#   journalctl -u vault25-paddock -f          # meekijken (adressen, spelers)
#   sudo systemctl restart vault25-paddock    # na een wijziging in config.js
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node || true)"
USER_NAME="$(id -un)"

if [ -z "$NODE" ]; then
  echo "✗ Node.js niet gevonden. Installeer Node 18 of nieuwer, bv.:"
  echo "    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 18 ]; then
  echo "✗ Node $("$NODE" -v) is te oud (18+ nodig). Zie de installatieregel hierboven."
  exit 1
fi

echo "→ Pakketten installeren"
(cd "$DIR" && npm install --omit=dev --no-audit --no-fund)

UNIT=/etc/systemd/system/vault25-paddock.service
echo "→ $UNIT schrijven (gebruiker $USER_NAME, node $NODE)"
sudo tee "$UNIT" > /dev/null <<EOF
[Unit]
Description=Vault 25 Brahmin Paddock server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vault25-paddock
sleep 2

PORT="$("$NODE" -p "require('$DIR/config.js').port")"
if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  echo "→ Firewall: poort $PORT openzetten"
  sudo ufw allow "$PORT"/tcp
fi

echo
systemctl --no-pager --lines=12 status vault25-paddock || true
echo
echo "✓ Klaar. Telefoons: serveradres <ip-van-deze-pc>:$PORT (of laat de app zoeken)."
echo "  Tip: geef deze pc een vast IP-adres in de router (DHCP-reservering)."
