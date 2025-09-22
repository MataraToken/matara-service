#!/bin/bash

# Deploy script for Matara Service
set -e

echo "🚀 Starting deployment..."

# Configuration
DOCKER_IMAGE="matara-service"
CONTAINER_NAME="matara-service-app"
DEPLOYMENT_DIR="/opt/matara-service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if we're in the correct directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the project root."
    exit 1
fi

# Pull latest changes
print_status "Pulling latest changes from repository..."
git pull origin main || {
    print_error "Failed to pull latest changes"
    exit 1
}

# Build new image
print_status "Building Docker image..."
docker build -t $DOCKER_IMAGE:latest . || {
    print_error "Failed to build Docker image"
    exit 1
}

# Stop existing container
print_status "Stopping existing containers..."
docker-compose down || print_warning "No existing containers to stop"

# Remove old images (keep last 3)
print_status "Cleaning up old images..."
docker images $DOCKER_IMAGE --format "{{.ID}}" | tail -n +4 | xargs -r docker rmi

# Start new container
print_status "Starting new containers..."
docker-compose up -d || {
    print_error "Failed to start containers"
    exit 1
}

# Wait for service to be ready
print_status "Waiting for service to be ready..."
sleep 30

# Health check
print_status "Performing health check..."
if curl -f http://localhost:4000/ > /dev/null 2>&1; then
    print_status "✅ Deployment successful! Service is healthy."
else
    print_error "❌ Health check failed. Please check the logs."
    docker-compose logs app
    exit 1
fi

print_status "🎉 Deployment completed successfully!"
