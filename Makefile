# Makefile for Nurones MCP Spiral-1

.PHONY: all build build-core build-wasi build-sdk build-web test bench clean help

# Default target
all: build

# Build everything
build: build-core build-wasi build-sdk build-web

# Build Rust core
build-core:
	@echo "Building MCP core..."
	cd mcp-core && cargo build --release

# Build WASI tools
build-wasi:
	@echo "Building WASI tools..."
	@echo "Checking for wasm32-wasi target..."
	@rustup target add wasm32-wasi 2>/dev/null || true
	cd examples/fs-read && cargo build --release --target wasm32-wasi
	cd examples/fs-write && cargo build --release --target wasm32-wasi
	@echo "WASI tools built successfully"

# Build Node SDK
build-sdk:
	@echo "Building Node SDK..."
	cd sdk-node && pnpm install && pnpm build

# Build Admin Web
build-web:
	@echo "Building Admin Web..."
	cd admin-web && pnpm install && pnpm build

# Build VS Code extension
build-vscode:
	@echo "Building VS Code extension..."
	cd extensions/vscode && npm install && npm run build

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
