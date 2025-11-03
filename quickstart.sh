#!/bin/bash
set -e

echo "🚀 Nurones MCP Quick Start"
echo "=========================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not found. Install from https://rustup.rs"
    exit 1
fi
echo "✅ Rust: $(rustc --version)"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install Node.js 20+"
    exit 1
fi
echo "✅ Node: $(node --version)"

if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm not found. Installing..."
    npm install -g pnpm
fi
echo "✅ pnpm: $(pnpm --version)"

echo ""
echo "🔧 Building Rust MCP Core..."
cd mcp-core
cargo build --release
echo "✅ Rust build complete"

echo ""
echo "📦 Building Node SDK..."
cd ../sdk-node
pnpm install
pnpm build
echo "✅ SDK build complete"

echo ""
echo "🎨 Building Admin Web UI..."
cd ../admin-web
pnpm install
pnpm build
echo "✅ Admin UI build complete"

cd ..

echo ""
echo "✨ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "1. Start observability stack (optional):"
echo "   docker-compose up -d"
echo ""
echo "2. Start MCP server:"
echo "   cd mcp-core && ./target/release/nurones-mcp --config ../.mcp/config.json"
echo ""
echo "3. Start Admin UI (in another terminal):"
echo "   cd admin-web && pnpm start"
echo ""
echo "4. Open http://localhost:3000 in your browser"
echo ""
echo "📖 See BOOTSTRAP.md for detailed instructions"
