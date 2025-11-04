# -------- Stage 1: build --------
FROM rust:1.81-bullseye AS build

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

# Cache deps first (core + WASI examples)
COPY mcp-core/Cargo.toml mcp-core/Cargo.lock mcp-core/
COPY examples/fs-read/Cargo.toml examples/fs-read/
COPY examples/fs-write/Cargo.toml examples/fs-write/
RUN mkdir -p mcp-core/src examples/fs-read/src examples/fs-write/src \
 && echo "fn main(){}" > mcp-core/src/main.rs \
 && echo "fn main(){}" > examples/fs-read/src/main.rs \
 && echo "fn main(){}" > examples/fs-write/src/main.rs \
 && cargo build --release --manifest-path mcp-core/Cargo.toml \
 && cargo build --release --target wasm32-wasip1 --manifest-path examples/fs-read/Cargo.toml \
 && cargo build --release --target wasm32-wasip1 --manifest-path examples/fs-write/Cargo.toml

# Now the real sources
COPY . .

# Build core
RUN cargo build --release --manifest-path mcp-core/Cargo.toml

# Build WASI tools and collect artifacts
RUN cargo build --release --target wasm32-wasip1 --manifest-path examples/fs-read/Cargo.toml \
 && cargo build --release --target wasm32-wasip1 --manifest-path examples/fs-write/Cargo.toml \
 && mkdir -p /out/wasm \
 && cp examples/fs-read/target/wasm32-wasip1/release/fs_read.wasm /out/wasm/ \
 && cp examples/fs-write/target/wasm32-wasip1/release/fs_write.wasm /out/wasm/ \
 && cp mcp-core/target/release/nurones-mcp /out/

# -------- Stage 2: runtime (slim) --------
FROM debian:bookworm-slim AS runtime

# Create non-root user
RUN useradd -m -u 10001 appuser
WORKDIR /app

# Minimal runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Copy artifacts
COPY --from=build /out/nurones-mcp /app/nurones-mcp
COPY --from=build /out/wasm /app/.mcp/wasm
# Copy default config (can be overridden by mounted volume)
COPY .mcp/config.json /app/.mcp/config.json
COPY .mcp/context-default.json /app/.mcp/context-default.json

# Security hardening
USER appuser
EXPOSE 50550
ENV RUST_LOG=info \
    FS_ALLOWLIST="/workspace,/tmp"

ENTRYPOINT ["/app/nurones-mcp"]
