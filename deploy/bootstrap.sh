#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-81.200.153.155}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/quiz}"

echo "Bootstrapping server ${DEPLOY_HOST}..."

ssh "${DEPLOY_USER}@${DEPLOY_HOST}" bash <<'ENDSSH'
set -euo pipefail

echo "=== Installing Docker ==="
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  echo "Docker installed"
else
  echo "Docker already installed: $(docker --version)"
fi

echo ""
echo "=== Configuring firewall ==="
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp   >/dev/null 2>&1 || true
  ufw allow 80/tcp   >/dev/null 2>&1 || true
  ufw allow 443/tcp  >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  echo "Firewall configured (22, 80, 443)"
fi

echo ""
echo "=== Setting up swap (if needed) ==="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "2GB swap created"
else
  echo "Swap already exists"
fi

echo ""
echo "=== Creating project directory ==="
mkdir -p /opt/quiz

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  1. Copy env files to the server:"
echo "     scp .env root@${HOSTNAME}:/opt/quiz/.env"
echo "     scp server/.env root@${HOSTNAME}:/opt/quiz/server/.env"
echo ""
echo "  2. Run deploy:"
echo "     ./deploy/update.sh"
echo ""
echo "  3. Setup SSL:"
echo "     ssh root@${HOSTNAME} 'bash /opt/quiz/deploy/ssl.sh'"
ENDSSH

echo ""
echo "Bootstrap complete!"
echo ""
echo "Now copy your .env files to the server:"
echo "  scp .env ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/.env"
echo "  scp server/.env ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/server/.env"
