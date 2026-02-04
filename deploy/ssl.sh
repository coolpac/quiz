#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-annaivaschenko.ru}"
EMAIL="${EMAIL:-admin@annaivaschenko.ru}"
UPSTREAM_PORT="${UPSTREAM_PORT:-8080}"

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

cat >/etc/nginx/sites-available/${DOMAIN} <<EOF
server {
  listen 80;
  server_name ${DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:${UPSTREAM_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF

ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
nginx -t
systemctl restart nginx

certbot --nginx -d "${DOMAIN}" -m "${EMAIL}" --agree-tos --non-interactive --redirect

systemctl reload nginx
echo "SSL enabled for ${DOMAIN}"
