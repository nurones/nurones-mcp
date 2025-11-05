# -------- Stage 1: Build Rust core --------
FROM rust:latest AS build-rust

# Use nightly for edition2024 support
RUN rustup default nightly

# Deterministic builds and faster linking
ENV CARGO_TERM_COLOR=always \
    RUSTFLAGS="-C target-cpu=native" \
    CARGO_NET_GIT_FETCH_WITH_CLI=true

# Add WASI target for tool builds
RUN rustup target add wasm32-wasip1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev ca-certificates curl make \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy entire codebase for dependency resolution
COPY . .

# Build core with proper dependencies
RUN cargo build --release --manifest-path mcp-core/Cargo.toml

# Build WASI tools
RUN cargo build --release --target wasm32-wasip1 --manifest-path examples/fs-read/Cargo.toml \
 && cargo build --release --target wasm32-wasip1 --manifest-path examples/fs-write/Cargo.toml

# Collect artifacts
RUN mkdir -p /out/wasm \
 && cp examples/fs-read/target/wasm32-wasip1/release/fs_read.wasm /out/wasm/ \
 && cp examples/fs-write/target/wasm32-wasip1/release/fs_write.wasm /out/wasm/ \
 && cp mcp-core/target/release/nurones-mcp /out/

# -------- Stage 2: Build Admin Web UI --------
FROM node:20-bullseye AS build-admin

WORKDIR /app

# Install deps
COPY admin-web/package*.json admin-web/
WORKDIR /app/admin-web
RUN npm ci

# Copy sources and build static export
COPY admin-web/ /app/admin-web/
RUN npm run build

# -------- Stage 3: Runtime (slim unified server) --------
FROM debian:sid-slim AS runtime

# Create non-root user
RUN useradd -m -u 10001 appuser
WORKDIR /app

# Minimal runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Copy Rust artifacts
COPY --from=build-rust /out/nurones-mcp /app/nurones-mcp
COPY --from=build-rust /out/wasm /app/.mcp/wasm

# Copy Admin UI static files
COPY --from=build-admin /app/admin-web/out /app/admin-web/out

# Copy default config (can be overridden by mounted volume)
COPY .mcp/config.json /app/.mcp/config.json
COPY .mcp/policies.json /app/.mcp/policies.json
COPY .mcp/context-default.json /app/.mcp/context-default.json

# Create directories for extensions and plugins
RUN mkdir -p /app/extensions /app/plugins && chown -R appuser:appuser /app

# Security hardening
USER appuser
EXPOSE 50550
ENV RUST_LOG=info \
    FS_ALLOWLIST="/workspace,/tmp"

ENTRYPOINT ["/app/nurones-mcp"]
