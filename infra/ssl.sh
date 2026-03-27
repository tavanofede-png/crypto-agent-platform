#!/bin/bash
# ════════════════════════════════════════════════════════════
#  SSL Certificate Bootstrap (Let's Encrypt via Certbot)
#  Run ONCE after setup.sh, before deploy.sh
#  Usage: bash ssl.sh yourdomain.com your@email.com
# ════════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/opt/cap"

[[ -z "$DOMAIN" ]] && { echo "Usage: bash ssl.sh <domain> <email>"; exit 1; }
[[ -z "$EMAIL"  ]] && { echo "Usage: bash ssl.sh <domain> <email>"; exit 1; }

echo "[+] Preparing Nginx for ACME challenge (HTTP only)..."

# Start nginx with HTTP-only config (no SSL yet)
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml up -d nginx --no-deps

# Wait for nginx
sleep 5

echo "[+] Requesting certificate for $DOMAIN..."
docker compose -f docker-compose.prod.yml run --rm certbot \
  certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo "[+] Certificate issued. Configuring Nginx HTTPS..."

# Activate the HTTPS vhost config
cp "$APP_DIR/infra/nginx/conf.d/app.conf.template" \
   "$APP_DIR/infra/nginx/conf.d/app.conf"
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" \
   "$APP_DIR/infra/nginx/conf.d/app.conf"

echo "[+] Reloading Nginx..."
docker compose -f docker-compose.prod.yml exec nginx nginx -t
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo ""
echo "✅ SSL configured for https://$DOMAIN"
echo "   Run deploy.sh to bring up all services."
