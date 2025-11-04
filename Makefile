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

.PHONY: docker-core docker-admin docker-up docker-down docker-logs

docker-core:
	docker build -t ghcr.io/nurones/mcp-core:local -f Dockerfile .

docker-admin:
	docker build -t ghcr.io/nurones/mcp-admin:local -f admin-web/Dockerfile .

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f --tail=200
