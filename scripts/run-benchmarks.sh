#!/bin/bash
set -e

echo "🔥 Nurones MCP - Week 2 Performance Benchmark"
echo "=============================================="
echo ""

# Build in release mode
echo "📦 Building release binary..."
cd mcp-core
cargo build --release --quiet

# Run criterion benchmarks
echo ""
echo "🏃 Running Criterion benchmarks..."
cargo bench --quiet

# Simple load test
echo ""
echo "⚡ Running simple load test (1000 events)..."
time cargo run --release --example simple_load 2>/dev/null || echo "Example not yet implemented"

echo ""
echo "✅ Benchmarks complete!"
echo ""
echo "Results saved to:"
echo "  - mcp-core/target/criterion/event_publish/report/index.html"
echo ""
echo "Next: Review flamegraph with 'cargo flamegraph'"
