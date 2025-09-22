#!/bin/bash

# VPS Setup Script for Matara Service
# Run this script on your VPS to set up the environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons"
   exit 1
fi

print_header "Starting VPS Setup for Matara Service"

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
print_status "Installing essential packages..."
sudo apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# Install Docker
print_header "Installing Docker"
if ! command -v docker &> /dev/null; then
    print_status "Installing Docker..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    print_status "Docker installed successfully"
else
    print_status "Docker is already installed"
fi

# Install Docker Compose (standalone)
print_header "Installing Docker Compose"
if ! command -v docker-compose &> /dev/null; then
    print_status "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_status "Docker Compose installed successfully"
else
    print_status "Docker Compose is already installed"
fi

# Install Node.js (for local development/debugging)
print_header "Installing Node.js"
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    print_status "Node.js installed successfully"
else
    print_status "Node.js is already installed"
fi

# Install Nginx (reverse proxy)
print_header "Installing and Configuring Nginx"
if ! command -v nginx &> /dev/null; then
    print_status "Installing Nginx..."
    sudo apt install -y nginx
    
    # Enable and start Nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    print_status "Nginx installed and started"
else
    print_status "Nginx is already installed"
fi

# Setup firewall
print_header "Configuring Firewall"
print_status "Setting up UFW firewall..."
sudo ufw --force enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
print_status "Firewall configured"

# Create deployment directory
print_header "Setting up Deployment Directory"
DEPLOYMENT_DIR="/opt/matara-service"
if [ ! -d "$DEPLOYMENT_DIR" ]; then
    print_status "Creating deployment directory..."
    sudo mkdir -p $DEPLOYMENT_DIR
    sudo chown $USER:$USER $DEPLOYMENT_DIR
    print_status "Deployment directory created at $DEPLOYMENT_DIR"
else
    print_status "Deployment directory already exists"
fi

# Create systemd service for auto-restart
print_header "Creating Systemd Service"
sudo tee /etc/systemd/system/matara-service.service > /dev/null <<EOF
[Unit]
Description=Matara Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOYMENT_DIR
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0
Restart=on-failure
RestartSec=10s
User=$USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable matara-service
print_status "Systemd service created and enabled"

# Setup log rotation
print_header "Setting up Log Rotation"
sudo tee /etc/logrotate.d/matara-service > /dev/null <<EOF
$DEPLOYMENT_DIR/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    create 644 $USER $USER
    postrotate
        docker-compose -f $DEPLOYMENT_DIR/docker-compose.yml restart app || true
    endscript
}
EOF
print_status "Log rotation configured"

# Create monitoring script
print_header "Setting up Monitoring"
sudo tee /usr/local/bin/matara-health-check.sh > /dev/null <<'EOF'
#!/bin/bash
# Health check script for Matara Service

LOG_FILE="/var/log/matara-health-check.log"

if ! curl -f http://localhost:4000/ > /dev/null 2>&1; then
    echo "$(date): Service is down, attempting restart..." >> $LOG_FILE
    cd /opt/matara-service
    docker-compose restart app
    sleep 30
    if curl -f http://localhost:4000/ > /dev/null 2>&1; then
        echo "$(date): Service restored successfully" >> $LOG_FILE
    else
        echo "$(date): Failed to restore service" >> $LOG_FILE
    fi
fi
EOF

sudo chmod +x /usr/local/bin/matara-health-check.sh

# Add cron job for health check
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/matara-health-check.sh") | crontab -
print_status "Health check monitoring configured"

# Setup SSL certificate directory
print_status "Creating SSL certificate directory..."
sudo mkdir -p /etc/ssl/matara-service
sudo chown $USER:$USER /etc/ssl/matara-service

print_header "VPS Setup Complete!"
print_status "Next steps:"
echo "1. Copy your project files to $DEPLOYMENT_DIR"
echo "2. Create .env file with your environment variables"
echo "3. Configure Nginx reverse proxy"
echo "4. Set up SSL certificates"
echo "5. Configure GitHub Actions secrets"
echo ""
print_warning "Please logout and login again to apply Docker group permissions"
echo ""
print_status "Deployment directory: $DEPLOYMENT_DIR"
print_status "Service logs: journalctl -u matara-service -f"
print_status "Docker logs: docker-compose logs -f"
