#!/bin/bash

# Nurones MCP Services Startup Script
# This script ensures clean startup by killing existing services on designated ports
# Port 4050: Unified Server (Admin Web UI + MCP Server API)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Nurones MCP Services Startup ===${NC}"

# Kill any process using port 4050 (Unified Server)
echo -e "${YELLOW}Checking port 4050 (Unified Server)...${NC}"
if lsof -Pi :4050 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}Port 4050 is in use, killing existing process...${NC}"
    kill -9 $(lsof -t -i:4050) 2>/dev/null || true
    sleep 1
fi

# Also kill any nurones-mcp processes
echo -e "${YELLOW}Killing any remaining nurones-mcp processes...${NC}"
pkill -f "nurones-mcp" 2>/dev/null || true
sleep 1

# Verify port is free
if lsof -Pi :4050 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}ERROR: Port 4050 still in use after cleanup!${NC}"
    exit 1
fi

echo -e "${GREEN}Port 4050 is now free${NC}"

# Start MCP Server on port 4050 (includes Admin Web & API)
echo -e "${GREEN}Starting MCP Server on port 4050...${NC}"
cd "$(dirname "$0")"
# Add wasmtime to PATH for WASI tool execution
export PATH="$HOME/.wasmtime/bin:$PATH"
RUST_LOG=info ./mcp-core/target/release/nurones-mcp > /tmp/mcp-server.log 2>&1 &
MCP_PID=$!
echo -e "${GREEN}MCP Server started (PID: $MCP_PID)${NC}"

# Wait for MCP server to be ready
echo -e "${YELLOW}Waiting for MCP Server to be ready...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:4050/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}MCP Server is ready!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}ERROR: MCP Server failed to start${NC}"
        cat /tmp/mcp-server.log
        exit 1
    fi
    sleep 1
done

echo -e "${GREEN}"
echo "=== Services Started Successfully ==="
echo "Unified Server:  http://localhost:4050"
echo "API Endpoints:   http://localhost:4050/api/*"
echo "Metrics:         http://localhost:4050/metrics"
echo "Settings:        http://localhost:4050/api/settings/server"
echo "Virtual Conn:    http://localhost:4050/api/connector/virtual/health"
echo "Logs:"
echo "  MCP Server:    tail -f /tmp/mcp-server.log"
echo -e "${NC}"
