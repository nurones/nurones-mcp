<p align="center">
  <img src="docs/images/banner.svg" alt="Nurones MCP Banner" width="100%"/>
</p>

<h3 align="center">🧠 Nurones MCP Server</h3>
<p align="center">Self-adaptive, context-aware Model Context Protocol (MCP) server — <b>Rust core</b> · <b>TypeScript SDK</b> · <b>VS Code & Qoder extensions</b>.</p>

<p align="center">
  <a href="https://github.com/nurones/nurones-mcp/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/nurones/nurones-mcp/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/nurones/nurones-mcp/actions/workflows/bench.yml"><img alt="Bench" src="https://github.com/nurones/nurones-mcp/actions/workflows/bench.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
  <img alt="Stars" src="https://img.shields.io/github/stars/nurones/nurones-mcp?style=social">
</p>

---

## 🚀 Quick Start
```bash
git clone https://github.com/nurones/nurones-mcp.git
cd nurones-mcp
./quickstart.sh
```

**VS Code**: open `/extensions/vscode`, `npm i && npm run build`, then press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → "Nurones MCP".

**Qoder**: open `/extensions/qoder`, `npm i && npm run build`, then access via Qoder Command Palette → "Nurones MCP".

## 🧩 Architecture

| Layer                  | Tech         | Purpose                                 |
| ---------------------- | ------------ | --------------------------------------- |
| **mcp-core/**          | Rust (Tokio) | Event bus, ContextFrame, WASI tools     |
| **sdk-node/**          | TypeScript   | Contracts, schemas, integration helpers |
| **extensions/vscode/** | TypeScript   | VS Code integration (developer UX)      |
| **extensions/qoder/**  | TypeScript   | Qoder IDE integration (AI-native UX)    |
| **admin-web/**         | React/Next   | Telemetry + governance                  |
| **.mcp/**              | JSON         | Config + tool manifests                 |

## 💡 Highlights

* Context-aware routing with safety bounds (±10%/day)
* WASI tool execution (fs.read / fs.write examples)
* OpenTelemetry + Prometheus out of the box
* CI/CD + CodeQL + Release workflows
* MIT licensed

## 📚 Docs

* **Quick Start:** [docs/guides/QUICKSTART.md](docs/guides/QUICKSTART.md)
* **Architecture:** [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)
* **Contributing:** [docs/governance/CONTRIBUTING.md](docs/governance/CONTRIBUTING.md)
* **Releases:** [docs/governance/RELEASES.md](docs/governance/RELEASES.md)
* **Phase notes (archive):** [docs/archive/](docs/archive/)

## 🔌 Extension Naming

- Publish as `@nurones/mcp-ext-<name>`
- Place source in `extensions/<name>/`
- Reuse contracts from `sdk-node`

## 🌍 Community

Open a Discussion or an Issue with your use case / ideas. PRs welcome!

MIT © 2025 Nurones
