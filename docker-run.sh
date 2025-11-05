#!/bin/bash
set -e

echo "🐳 Nurones MCP Docker Deployment"
echo "================================"
echo ""

# Stop any running local servers
echo "📌 Stopping local servers..."
pkill -f nurones-mcp 2>/dev/null || true
sleep 2

# Build and start Docker containers
echo "🔨 Building Docker images (this may take 5-10 minutes first time)..."
docker compose build

echo ""
echo "🚀 Starting containers..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Wait for health check
for i in {1..30}; do
    if docker compose ps | grep -q "healthy"; then
        echo "✅ Services are healthy!"
        break
    fi
    echo "   Waiting... ($i/30)"
    sleep 2
done

echo ""
echo "📊 Container Status:"
docker compose ps

echo ""
echo "🌐 Services Available:"
echo "   • MCP Server + Admin UI: http://localhost:50550"
echo "   • Prometheus Metrics:    http://localhost:9090"
echo ""
echo "📝 Useful Commands:"
echo "   • View logs:       docker compose logs -f"
echo "   • Stop services:   docker compose down"
echo "   • Restart:         docker compose restart"
echo "   • Rebuild:         docker compose build --no-cache"
echo ""
echo "✨ Deployment complete!"
