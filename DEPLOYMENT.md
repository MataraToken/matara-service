# Deployment Guide for Matara Service

This guide covers the complete deployment process for the Matara Service on a VPS using Docker and GitHub Actions CI/CD.

## 📋 Prerequisites

- VPS with Ubuntu 20.04+ (2GB+ RAM recommended)
- Domain name pointing to your VPS IP
- Docker Hub account
- GitHub repository with Actions enabled

## 🚀 Quick Start

### 1. VPS Setup

Run the setup script on your VPS:

```bash
wget https://raw.githubusercontent.com/your-username/matara-service/main/scripts/setup-vps.sh
chmod +x setup-vps.sh
./setup-vps.sh
```

### 2. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and Variables → Actions, and add:

```
DOCKER_USERNAME=your_dockerhub_username
DOCKER_PASSWORD=your_dockerhub_password
VPS_HOST=your_vps_ip_address
VPS_USERNAME=your_vps_username
VPS_SSH_KEY=your_private_ssh_key
VPS_PORT=22 (or your custom SSH port)
```

### 3. Deploy

Push to main branch - GitHub Actions will automatically build and deploy.

## 🛠 Manual Setup Steps

### VPS Configuration

1. **Update System & Install Dependencies**
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y curl wget git unzip
   ```

2. **Install Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. **Install Docker Compose**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

4. **Setup Deployment Directory**
   ```bash
   sudo mkdir -p /opt/matara-service
   sudo chown $USER:$USER /opt/matara-service
   cd /opt/matara-service
   ```

5. **Clone Repository**
   ```bash
   git clone https://github.com/your-username/matara-service.git .
   ```

### Environment Configuration

1. **Create Production Environment File**
   ```bash
   cp .env.example .env
   nano .env
   ```

   Required variables:
   ```env
   NODE_ENV=production
   PORT=4000
   SERVER_URL=https://your-domain.com
   
   # Database
   MONGODB_URI=mongodb://admin:password@mongo:27017/matara?authSource=admin
   MONGO_USERNAME=admin
   MONGO_PASSWORD=your_secure_password
   
   # Telegram Bot
   TELEGRAM_BOT_TOKEN=your_bot_token
   BOT_WEBHOOK_PATH=your_webhook_secret
   
   # JWT
   JWT_SECRET=your_jwt_secret
   
   # Cloudinary (if used)
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

### SSL Certificate Setup

1. **Install Certbot**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Obtain SSL Certificate**
   ```bash
   sudo certbot certonly --standalone -d your-domain.com
   ```

3. **Copy Certificates**
   ```bash
   sudo mkdir -p /opt/matara-service/ssl
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/matara-service/ssl/cert.pem
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/matara-service/ssl/key.pem
   sudo chown $USER:$USER /opt/matara-service/ssl/*
   ```

### Initial Deployment

1. **Build and Start Services**
   ```bash
   cd /opt/matara-service
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. **Verify Deployment**
   ```bash
   # Check containers
   docker-compose ps
   
   # Check logs
   docker-compose logs -f app
   
   # Test endpoint
   curl https://your-domain.com/
   ```

## 🔄 CI/CD Pipeline

The GitHub Actions workflow automatically:

1. **Testing Phase**
   - Installs dependencies
   - Runs type checking
   - Builds the application

2. **Deployment Phase** (on main branch)
   - Builds Docker image
   - Pushes to Docker Hub
   - SSHs to VPS
   - Pulls latest image
   - Restarts services
   - Performs health check

## 📊 Monitoring & Maintenance

### Health Monitoring

The setup includes automatic health checks:
- Cron job runs every 5 minutes
- Automatically restarts failed containers
- Logs to `/var/log/matara-health-check.log`

### Log Management

```bash
# View application logs
docker-compose logs -f app

# View system service logs
journalctl -u matara-service -f

# View nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Database Backup

```bash
# Create backup script
cat << 'EOF' > /opt/matara-service/backup.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec matara-service_mongo_1 mongodump --authenticationDatabase admin -u admin -p password --db matara --out /tmp/backup_$DATE
docker cp matara-service_mongo_1:/tmp/backup_$DATE ./backups/
EOF

chmod +x /opt/matara-service/backup.sh

# Run daily at 2 AM
(crontab -l; echo "0 2 * * * /opt/matara-service/backup.sh") | crontab -
```

## 🔧 Troubleshooting

### Common Issues

1. **Container won't start**
   ```bash
   docker-compose logs app
   # Check environment variables
   docker-compose config
   ```

2. **SSL Certificate issues**
   ```bash
   # Renew certificate
   sudo certbot renew
   # Update container certificates
   sudo cp /etc/letsencrypt/live/your-domain.com/* /opt/matara-service/ssl/
   docker-compose restart nginx
   ```

3. **Database connection issues**
   ```bash
   # Check MongoDB container
   docker-compose logs mongo
   # Test connection
   docker exec -it matara-service_mongo_1 mongo -u admin -p
   ```

### Performance Optimization

1. **Enable Compression**
   - Already configured in nginx.conf

2. **Database Optimization**
   ```bash
   # Add MongoDB indexes (connect to container first)
   docker exec -it matara-service_mongo_1 mongo -u admin -p password
   use matara;
   db.users.createIndex({"email": 1});
   db.tasks.createIndex({"userId": 1});
   ```

3. **Resource Monitoring**
   ```bash
   # Install htop
   sudo apt install htop
   
   # Monitor Docker stats
   docker stats
   ```

## 🔄 Updates

### Automatic Updates (Recommended)
- Watchtower container automatically pulls and updates images
- Configured in `docker-compose.prod.yml`

### Manual Updates
```bash
cd /opt/matara-service
git pull origin main
./scripts/deploy.sh
```

## 🔐 Security

### Firewall Configuration
```bash
# Already configured in setup script
sudo ufw status
```

### Regular Maintenance
```bash
# Update system packages monthly
sudo apt update && sudo apt upgrade

# Clean Docker resources
docker system prune -f

# Rotate logs (automated via logrotate)
sudo logrotate -f /etc/logrotate.d/matara-service
```

## 📞 Support

For issues:
1. Check application logs
2. Verify environment variables
3. Test database connectivity
4. Check SSL certificate expiry
5. Monitor resource usage

### Useful Commands

```bash
# Restart all services
docker-compose restart

# View resource usage
docker stats

# Check SSL certificate expiry
openssl x509 -in ssl/cert.pem -text -noout | grep "Not After"

# Test API endpoint
curl -X GET https://your-domain.com/api/user/health
```
