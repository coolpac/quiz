#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-annaivaschenko.ru}"
EMAIL="${EMAIL:-admin@${DOMAIN}}"
UPSTREAM_PORT="${UPSTREAM_PORT:-8080}"

echo "Setting up SSL for ${DOMAIN}..."

apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx

# Remove default site
rm -f /etc/nginx/sites-enabled/default

cat >/etc/nginx/sites-available/${DOMAIN} <<EOF
server {
  listen 80;
  server_name ${DOMAIN};

  # Proxy buffer for WebSocket + API
  proxy_buffering off;
  proxy_buffer_size 16k;
  proxy_busy_buffers_size 24k;
  proxy_buffers 64 4k;

  location / {
    proxy_pass http://127.0.0.1:${UPSTREAM_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_connect_timeout 10s;
    proxy_send_timeout 86400s;
    proxy_read_timeout 86400s;
  }
}
EOF

ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}

nginx -t
systemctl restart nginx

echo "Obtaining SSL certificate..."
certbot --nginx -d "${DOMAIN}" -m "${EMAIL}" --agree-tos --non-interactive --redirect

systemctl reload nginx
echo "SSL enabled for ${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Set Telegram webhook:"
echo "     curl -X POST 'https://api.telegram.org/bot\${BOT_TOKEN}/setWebhook' \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"url\": \"https://${DOMAIN}/webhook/telegram\"}'"
echo ""
echo "  2. Verify: curl -s https://${DOMAIN}/api/health"
