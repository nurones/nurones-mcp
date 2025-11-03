#!/bin/bash
set -e

echo "🚀 Nurones MCP Spiral-1 Week 1 - Quick Build & Test"
echo "=================================================="
echo ""

# Check for wasm32-wasi target
echo "📦 Checking WASI target..."
rustup target add wasm32-wasi 2>/dev/null || echo "wasm32-wasi already installed"

# Build MCP Core with WASI support
echo ""
echo "🔨 Building MCP Core..."
cd mcp-core
cargo build --release
echo "✅ MCP Core built"

# Build WASI tools
echo ""
echo "🧩 Building WASI tools..."
cd ../examples/fs-read
cargo build --release --target wasm32-wasi
echo "✅ fs-read WASI tool built"

cd ../fs-write
cargo build --release --target wasm32-wasi
echo "✅ fs-write WASI tool built"

cd ../..

# Verify WASI modules exist
echo ""
echo "🔍 Verifying WASI modules..."
if [ -f "examples/fs-read/target/wasm32-wasi/release/fs_read.wasm" ]; then
    echo "✅ fs_read.wasm found"
else
    echo "❌ fs_read.wasm not found"
    exit 1
fi

if [ -f "examples/fs-write/target/wasm32-wasi/release/fs_write.wasm" ]; then
    echo "✅ fs_write.wasm found"
else
    echo "❌ fs_write.wasm not found"
    exit 1
fi

# Run tests
echo ""
echo "🧪 Running tests..."
cd mcp-core
cargo test --lib
echo "✅ Tests passed"

cd ..

echo ""
echo "=================================================="
echo "✅ Spiral-1 Week 1 Build Complete!"
echo ""
echo "Next steps:"
echo "1. Start observability: docker-compose up -d"
echo "2. Start admin web: cd admin-web && pnpm start"
echo "3. Launch VS Code: cd extensions/vscode && code --extensionDevelopmentPath=\$(pwd) .."
echo "4. Test WASI tools via Command Palette: 'Nurones MCP: Execute Tool'"
echo ""
echo "WASI modules ready at:"
echo "  - examples/fs-read/target/wasm32-wasi/release/fs_read.wasm"
echo "  - examples/fs-write/target/wasm32-wasi/release/fs_write.wasm"
