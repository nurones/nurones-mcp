# Nurones MCP v0.5 — Project Structure Overview

## 📁 Complete Directory Layout

```
nurones-mcp/
├── .mcp/                           # MCP Runtime Configuration
│   ├── config.json                 # Server configuration (Qoder host profile)
│   ├── context-default.json        # Default ContextFrame shim
│   └── tools/                      # Tool manifests (JSON)
│       ├── fs-read.json
│       ├── fs-write.json
│       └── telemetry-push.json
│
├── mcp-core/                       # Rust MCP Server (Apache-2.0)
│   ├── Cargo.toml                  # Rust project manifest
│   ├── src/
│   │   ├── lib.rs                  # Library exports
│   │   ├── main.rs                 # Binary entry point
│   │   ├── types.rs                # ContextFrame & core types
│   │   ├── config.rs               # Configuration loader
│   │   ├── context.rs              # Context Engine (adaptive tuning)
│   │   ├── event_bus.rs            # Event Bus (idempotent routing)
│   │   ├── tool_executor.rs        # Tool Executor (WASI/Node)
│   │   └── observability.rs        # OTel + Prometheus integration
│   └── target/                     # Build artifacts (gitignored)
│       └── release/
│           └── nurones-mcp         # Compiled binary
│
├── sdk-node/                       # Node/TypeScript SDK (MIT)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                # Main exports + ContextFrame types
│   │   └── types.ts                # Re-exports
│   └── dist/                       # Compiled output (gitignored)
│
├── admin-web/                      # React/TypeScript Admin UI (MIT)
│   ├── package.json                # Next.js 14 + Tailwind
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── postcss.config.js
│   ├── src/
│   │   └── app/
│   │       ├── layout.tsx          # Root layout
│   │       ├── page.tsx            # Main dashboard (tabs)
│   │       └── globals.css         # Global styles
│   └── .next/                      # Build output (gitignored)
│
├── extensions/qoder/              # Qoder Extension Manifest
│   └── extension.json              # Commands, telemetry config
│
├── .figma/                         # Figma → React Exports
│   └── fe-design/                  # (Empty for now; production exports here)
│       ├── components/
│       ├── ui/
│       └── styles/
│
├── spec/                           # Product Requirements
│   └── 1_nurones_mcp_server_prd_v0-5.md
│
├── docker-compose.yml              # Observability stack (OTel + Prometheus)
├── otel-collector-config.yaml
├── prometheus.yml
│
├── README.md                       # Main documentation
├── BOOTSTRAP.md                    # Step-by-step setup guide
├── LICENSE                         # Apache 2.0 (core) + MIT (extensions)
├── .gitignore
└── quickstart.sh                   # Automated bootstrap script
```

## 🎯 Component Responsibilities

### 1. **mcp-core** (Rust)
- **Primary:** MCP runtime server
- **Key Features:**
  - Event Bus with idempotent routing
  - Tool Executor (WASI/Node isolation)
  - Context Engine (adaptive tuning with safety boundaries)
  - RBAC & Policy Engine
  - OTel + Prometheus observability
- **Binary:** `nurones-mcp`
- **License:** Apache-2.0

### 2. **sdk-node** (TypeScript)
- **Primary:** Node.js SDK for tool authors
- **Exports:**
  - `ContextFrame` type definition
  - All 6 contract interfaces (IEventPersistence, IToolExecutor, etc.)
  - Utility functions (`createDefaultContext`, `validateContext`)
- **License:** MIT

### 3. **admin-web** (Next.js)
- **Primary:** Temporary baseline admin UI
- **Pages:**
  - Dashboard (system overview, metrics)
  - Tools (registered tool list)
  - Policies (RBAC, safety boundaries)
  - Telemetry (OTel, Prometheus links)
  - Context Monitor (ContextFrame viewer, rollback)
- **Note:** Production UI will replace with Figma exports
- **License:** MIT

### 4. **extensions/qoder**
- **Primary:** Qoder Platform extension manifest
- **Commands:**
  - `nurones.mcp.openDashboard`
  - `nurones.mcp.execTool`
  - `nurones.mcp.viewTrace`
  - `nurones.mcp.rollback`
- **Transport:** stdio + WebSocket

### 5. **.mcp/** (Configuration)
- **config.json:** Server profile, transports, RBAC, observability, context engine
- **context-default.json:** Default ContextFrame (fallback shim)
- **tools/*.json:** Tool manifests (name, version, entry, permissions)

## 🔑 Key Files Reference

| File | Purpose | Critical? |
|------|---------|-----------|
| `mcp-core/src/types.rs` | ContextFrame schema v1.0 | ⭐⭐⭐ |
| `mcp-core/src/context.rs` | Adaptive tuning engine | ⭐⭐⭐ |
| `mcp-core/src/event_bus.rs` | Idempotent event routing | ⭐⭐⭐ |
| `mcp-core/src/main.rs` | Server entry point | ⭐⭐⭐ |
| `sdk-node/src/index.ts` | Contract interfaces | ⭐⭐⭐ |
| `.mcp/config.json` | Runtime configuration | ⭐⭐⭐ |
| `extensions/qoder/extension.json` | Qoder manifest | ⭐⭐ |
| `admin-web/src/app/page.tsx` | Admin UI | ⭐ |
| `BOOTSTRAP.md` | Setup instructions | ⭐⭐ |

## 🚀 Quick Start Commands

```bash
# 1. Automated bootstrap
./quickstart.sh

# 2. Manual steps
cd mcp-core && cargo build --release
cd ../sdk-node && pnpm install && pnpm build
cd ../admin-web && pnpm install && pnpm build

# 3. Start observability stack
docker-compose up -d

# 4. Run MCP server
cd mcp-core
export CONTEXT_ENGINE=on
export FS_ALLOWLIST=/workspace,/tmp
./target/release/nurones-mcp --config ../.mcp/config.json

# 5. Start admin UI (separate terminal)
cd admin-web && pnpm start
# Open http://localhost:3000
```

## 🧪 Testing Strategy

### Unit Tests (Rust)
```bash
cd mcp-core
cargo test                          # All tests
cargo test context_validation       # ContextFrame validation
cargo test autotune_safety          # Safety boundary tests
cargo test test_rollback            # Rollback mechanism
```

### SDK Tests (Node)
```bash
cd sdk-node
pnpm test
```

### Integration Tests
- Manual Qoder command execution
- Admin UI interaction
- Observability stack verification

## 📊 Observability Endpoints

| Service | Endpoint | Purpose |
|---------|----------|---------|
| Prometheus | http://localhost:9090 | Metrics visualization |
| Prometheus Scrape | http://localhost:9464/metrics | MCP server metrics |
| OTel Collector | http://localhost:4318 | Trace ingestion |
| Admin UI | http://localhost:3000 | Management interface |

## 🔒 Safety Mechanisms

1. **Context Engine Boundaries:**
   - Autotune only when `risk_level=0` AND `context_confidence≥0.6`
   - Max change: ±10% per 24 hours
   - Require 2 consecutive successes before baseline update

2. **Rollback:**
   - Snapshots at every spiral checkpoint
   - Single-command restoration: `qoder run nurones.mcp.rollback`

3. **Filesystem Safety:**
   - Allowlist enforcement (`FS_ALLOWLIST`)
   - Read-only flag support in ContextFrame

4. **Deterministic Mode:**
   - `export CONTEXT_ENGINE=off` disables all adaptive features

## 📋 Spiral-0 Acceptance Checklist

- [ ] **AT-CONTEXT-SCHEMA:** ContextFrame validated; default fallback works
- [ ] **AT-AUTO-SAFE:** Context Engine limited to ±10% range
- [ ] **AT-QODER-INTEG:** Commands registered; telemetry visible
- [ ] **AT-FS-SEC:** Sandbox and context-logged FS ops validated
- [ ] **AT-ROLLBACK:** Rollback restores stable config instantly
- [ ] **AT-UI-BUILD:** React UI compiles; all tabs render

## 🔄 Next Spirals

| Spiral | Duration | Focus |
|--------|----------|-------|
| S1 | 3 weeks | Enhanced WASI runtime support |
| S2 | 4 weeks | Deep Qoder integration (panels, commands) |
| S3 | 3 weeks | Production context engine hardening |
| S4 | 4 weeks | 72h stress test + final acceptance |

## 📖 Documentation Index

- **README.md:** Overview, architecture, quick start
- **BOOTSTRAP.md:** Detailed setup guide with troubleshooting
- **spec/1_nurones_mcp_server_prd_v0-5.md:** Full PRD (SSOT)
- **This file:** Project structure reference

## 🤝 Contributing

1. Follow Rust style guide (rustfmt)
2. TypeScript: strict mode, no `any`
3. All PRs require tests
4. Admin UI: NO visual drift from `.figma/fe-design` (enforced by CI)

## 📞 Support

- GitHub Issues: Technical problems
- Nurones Team: Architecture questions
- Qoder Platform: Integration support

---

**Status:** ✅ Spiral-0 Bootstrap Complete  
**Next Milestone:** Spiral-1 Kickoff (Enhanced Runtime)
