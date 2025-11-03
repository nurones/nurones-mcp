# 🚀 Spiral-1 Week 1 — Quick Start Guide

## ⚡ Super Quick Start (3 commands)

```bash
# 1. Build everything
make quick

# 2. Test
cd mcp-core && cargo test

# 3. Verify WASI modules
ls -lh examples/*/target/wasm32-wasip1/release/*.wasm
```

---

## 📋 Prerequisites

- ✅ Rust (stable) installed
- ✅ Node 20+ with PNPM
- ✅ `wasm32-wasip1` target: `rustup target add wasm32-wasip1`
- ✅ `wasmtime` CLI: `cargo install wasmtime-cli` or via package manager

---

## 🔨 Build Instructions

### Option 1: Automated Script (Recommended)

```bash
./scripts/build-spiral1-week1.sh
```

**What it does:**
- Installs wasm32-wasip1 target
- Builds MCP core
- Builds both WASI tools (fs.read, fs.write)
- Runs tests
- Verifies WASM modules

### Option 2: Make Targets

```bash
# Build core + WASI tools
make quick

# Build everything including SDK and Web
make build

# Run tests
make test

# Clean all build artifacts
make clean
```

### Option 3: Manual Steps

```bash
# 1. Add WASI target
rustup target add wasm32-wasip1

# 2. Build MCP core
cd mcp-core
cargo build --release

# 3. Build WASI tools
cd ../examples/fs-read
cargo build --release --target wasm32-wasip1

cd ../fs-write
cargo build --release --target wasm32-wasip1

# 4. Run tests
cd ../../mcp-core
cargo test
```

---

## ✅ Verification

### Check Build Status

```bash
# Verify WASM modules exist
ls -lh examples/fs-read/target/wasm32-wasip1/release/fs_read.wasm
ls -lh examples/fs-write/target/wasm32-wasip1/release/fs_write.wasm

# Run tests (should show 16/16 passing)
cd mcp-core && cargo test --lib
```

**Expected Output:**
```
test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured
```

---

## 🧪 Test WASI Tools

### Method 1: Via VS Code Extension

1. **Start MCP Server** (in one terminal):
   ```bash
   cd mcp-core
   export CONTEXT_ENGINE=on
   export FS_ALLOWLIST="${PWD}/../,/tmp"
   ./target/release/nurones-mcp --config ../.mcp/config.json
   ```

2. **Launch VS Code** (in another terminal):
   ```bash
   cd vscode-extension
   npm install && npm run build
   code --extensionDevelopmentPath=$(pwd) ..
   ```

3. **Execute Tool** (in VS Code):
   - Command Palette (`Ctrl+Shift+P`)
   - "Nurones MCP: Execute Tool"
   - Tool: `fs.read`
   - Args: `{"path":"${workspaceFolder}/README.md"}`

4. **Check Output**:
   - View → Output → Select "Nurones MCP"
   - Look for WASI execution logs

### Method 2: Direct wasmtime Test

```bash
# Test fs.read WASM module directly
echo '{"path":"README.md"}' | wasmtime run examples/fs-read/target/wasm32-wasip1/release/fs_read.wasm
```

**Expected**: JSON output with `"ok":true`

---

## 🐛 Troubleshooting

### wasmtime not found

```bash
# Install wasmtime CLI
cargo install wasmtime-cli

# Or via package manager (Ubuntu/Debian)
curl https://wasmtime.dev/install.sh -sSf | bash

# Or via Homebrew (macOS)
brew install wasmtime
```

### wasm32-wasip1 target missing

```bash
rustup target add wasm32-wasip1
```

### WASM modules not building

```bash
# Clean and rebuild
cd examples/fs-read
cargo clean
cargo build --release --target wasm32-wasip1
```

### Tests failing

```bash
# Check Rust version
rustc --version  # Should be 1.70+

# Rebuild core
cd mcp-core
cargo clean
cargo build --release
cargo test
```

---

## 📊 What You Get

After successful build:

```
✅ MCP Core binary (with WASI support)
   Location: mcp-core/target/release/nurones-mcp
   
✅ WASI Tool: fs.read
   Location: examples/fs-read/target/wasm32-wasip1/release/fs_read.wasm
   Size: ~65KB
   
✅ WASI Tool: fs.write
   Location: examples/fs-write/target/wasm32-wasip1/release/fs_write.wasm
   Size: ~65KB
   
✅ Test Suite: 16/16 passing
   Coverage: Core, Context Engine, WASI runtime
```

---

## 🎯 Next Steps

1. **Test with VS Code**: Follow "Method 1" above
2. **Review Logs**: Check Output Channel for execution traces
3. **Verify Context Propagation**: Look for `reason_trace_id` in logs
4. **Prepare for Week 2**: Review [SPIRAL_1_ROADMAP.md](../SPIRAL_1_ROADMAP.md)

---

## 📖 Additional Resources

- **Full Week 1 Report**: [artifacts/SPIRAL1_WEEK1_COMPLETE.md](SPIRAL1_WEEK1_COMPLETE.md)
- **VS Code Guide**: [VSCODE_EXTENSION.md](../VSCODE_EXTENSION.md)
- **Build System**: [Makefile](../Makefile)
- **Roadmap**: [SPIRAL_1_ROADMAP.md](../SPIRAL_1_ROADMAP.md)

---

**Quick Check Command:**
```bash
make quick && cd mcp-core && cargo test && echo "✅ Week 1 Build Successful!"
```
