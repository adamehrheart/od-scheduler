#!/bin/bash
set -e

echo "🚀 Setting up Open Dealer Scheduler Development Environment"

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker compose is available
if ! docker compose version > /dev/null 2>&1; then
    print_error "Docker Compose is not available. Please install Docker Compose and try again."
    exit 1
fi

print_status "Cleaning up any existing containers..."
docker compose --profile dev down -v 2>/dev/null || true

print_status "Building development environment..."
docker compose --profile dev build --no-cache

print_status "Starting development services..."
docker compose --profile dev up -d

print_status "Waiting for services to be healthy..."
sleep 10

# Health checks
print_status "Checking service health..."

# Check scheduler health
if curl -f http://localhost:3003/health > /dev/null 2>&1; then
    print_success "Scheduler is healthy and responding"
else
    print_warning "Scheduler health check failed, but container may still be starting up"
fi

print_status "Development environment setup complete!"

echo ""
echo "📋 Available Services:"
echo "  • Scheduler API: http://localhost:3003"
echo "  • Health Check: http://localhost:3003/health"
echo ""

echo "🛠️  Useful Commands:"
echo "  • View logs: npm run docker:dev:logs"
echo "  • Restart services: npm run docker:dev:restart"
echo "  • Rebuild containers: npm run docker:dev:build"
echo "  • Stop services: npm run docker:dev:down"
echo ""

echo "🧪 Test Endpoints:"
echo "  • Health: curl http://localhost:3003/health"
echo "  • Run jobs: curl -X POST http://localhost:3003/api/jobs/run"
echo "  • Dealer jobs: curl -X POST 'http://localhost:3003/api/jobs/dealer?dealer_id=test'"
echo ""

print_success "Development environment is ready! 🎉"
