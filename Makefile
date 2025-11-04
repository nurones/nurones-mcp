# Makefile for Nurones MCP Spiral-1

.PHONY: wasm-fs-read build-core build-all clean

# Build WASI fs_read tool
wasm-fs-read:
	@echo "Building WASI fs_read tool..."
	cd .mcp/wasm/fs-read && cargo build --release --target wasm32-wasip1
	@mkdir -p .mcp/wasm
	cp .mcp/wasm/fs-read/target/wasm32-wasip1/release/fs_read.wasm .mcp/wasm/fs_read.wasm
	@echo "✓ fs_read.wasm ready at .mcp/wasm/fs_read.wasm"

# Build MCP core server
build-core:
	@echo "Building MCP core server..."
	cd mcp-core && cargo build --release
	@echo "✓ MCP server ready"

# Build everything
build-all: wasm-fs-read build-core
	@echo "✓ All builds complete"

# Clean build artifacts
clean:
	cd mcp-core && cargo clean
	cd .mcp/wasm/fs-read && cargo clean
	rm -f .mcp/wasm/fs_read.wasm

# Run tests
test:
	@echo "Running tests..."
	cd mcp-core && cargo test

# Run benchmarks (Spiral-1 Week 2)
bench:
	@echo "Running benchmarks..."
	@mkdir -p artifacts
	cd mcp-core && cargo build --release --bin bench || echo "Benchmark not yet implemented"
	@echo "Benchmark results will be in artifacts/bench_spiral1.md"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	cd mcp-core && cargo clean
	cd examples/fs-read && cargo clean
	cd examples/fs-write && cargo clean
	cd sdk-node && rm -rf dist node_modules
	cd admin-web && rm -rf .next node_modules
	cd extensions/vscode && rm -rf dist node_modules

# Start development environment
dev-start: build
	@echo "Starting development environment..."
	@echo "1. Starting observability stack..."
	docker-compose up -d
	@echo "2. MCP server will be started by VS Code extension"
	@echo "3. Start admin web..."
	cd admin-web && pnpm start &
	@echo "Development environment ready!"

# Quick build for development
quick: build-core build-wasi
	@echo "Quick build complete (core + WASI tools)"

# Help target
help:
	@echo "Nurones MCP Build Targets:"
	@echo "  make all         - Build everything (default)"
	@echo "  make build       - Build all components"
	@echo "  make build-core  - Build Rust MCP core"
	@echo "  make build-wasi  - Build WASI tools"
	@echo "  make build-sdk   - Build Node SDK"
	@echo "  make build-web   - Build Admin Web"
	@echo "  make test        - Run tests"
	@echo "  make bench       - Run benchmarks"
	@echo "  make clean       - Clean all build artifacts"
	@echo "  make dev-start   - Start development environment"
	@echo "  make quick       - Quick build (core + WASI)"
	@echo "  make help        - Show this help"
