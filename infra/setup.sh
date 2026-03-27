#!/bin/bash
# ════════════════════════════════════════════════════════════
#  VPS Bootstrap Script
#  Run once on a fresh Ubuntu 22.04 / Debian 12 server as root
#  Usage: bash setup.sh yourdomain.com your@email.com
# ════════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/opt/cap"
APP_USER="cap"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

[[ -z "$DOMAIN" ]] && err "Usage: bash setup.sh <domain> <email>"
[[ -z "$EMAIL"  ]] && err "Usage: bash setup.sh <domain> <email>"
[[ $EUID -ne 0  ]] && err "Run as root"

log "Starting VPS setup for domain: $DOMAIN"

# ─── 1. System update ────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip ufw fail2ban \
  ca-certificates gnupg lsb-release apt-transport-https

# ─── 2. Docker ───────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
else
  log "Docker already installed: $(docker --version)"
fi

# ─── 3. App user ─────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  log "Creating app user: $APP_USER"
  useradd -m -s /bin/bash "$APP_USER"
  usermod -aG docker "$APP_USER"
fi

# ─── 4. App directory ────────────────────────────────────────
log "Setting up app directory: $APP_DIR"
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# ─── 5. Firewall ─────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "Firewall status:"; ufw status

# ─── 6. Fail2ban ─────────────────────────────────────────────
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable --now fail2ban

# ─── 7. SSH hardening ────────────────────────────────────────
log "Hardening SSH..."
sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

# ─── 8. Clone repo ───────────────────────────────────────────
log "Cloning repository to $APP_DIR..."
if [[ -d "$APP_DIR/.git" ]]; then
  warn "Repo already cloned, pulling latest..."
  su - "$APP_USER" -c "cd $APP_DIR && git pull"
else
  su - "$APP_USER" -c "git clone https://github.com/tavanofede-png/crypto-agent-platform.git $APP_DIR"
fi

# ─── 9. .env file ────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
  log "Creating .env from template..."
  cp "$APP_DIR/.env.production" "$APP_DIR/.env"
  sed -i "s/yourdomain.com/$DOMAIN/g" "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  warn "⚠  Edit $APP_DIR/.env and fill in all secrets before continuing!"
  warn "   Then run:  bash $APP_DIR/infra/ssl.sh $DOMAIN $EMAIL"
else
  log ".env already exists, skipping."
fi

# ─── 10. Swap (if small VPS) ─────────────────────────────────
if [[ ! -f /swapfile ]]; then
  log "Creating 2GB swapfile..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ─── 11. Sysctl tweaks ───────────────────────────────────────
cat >> /etc/sysctl.conf <<'EOF'
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
vm.swappiness=10
EOF
sysctl -p >/dev/null 2>&1

echo ""
log "✅  VPS setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit:   $APP_DIR/.env  (fill all secrets)"
echo "  2. Run:    bash $APP_DIR/infra/ssl.sh $DOMAIN $EMAIL"
echo "  3. Deploy: bash $APP_DIR/infra/deploy.sh"
echo ""
