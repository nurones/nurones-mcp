# Changelog

All notable changes to the Nurones MCP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Contract SSOT with JSON schemas and TypeScript/Rust types
- Comprehensive contract conformance tests (Rust + Node)
- GitHub Actions CI/CD workflows (build, test, bench, release)
- CodeQL security scanning
- Performance benchmarking infrastructure
- VS Code extension packaging in CI

### Changed
- Event Bus now supports bounded channels with backpressure
- Performance configuration added to `.mcp/config.json`

## [0.5.0] - 2025-11-03

### Added
- Initial project bootstrap
- Rust MCP core server with ContextFrame v1.0
- WASI runtime integration for tools (fs.read, fs.write)
- Node/TypeScript SDK with all 6 contract interfaces
- React/TypeScript admin web UI (5-tab dashboard)
- VS Code extension (primary host)
- Qoder integration (secondary host)
- Context Engine with adaptive tuning (±10%/day safety bounds)
- Event Bus with idempotent routing
- Tool Executor with WASI support
- Observability stack (OTel + Prometheus)
- Comprehensive documentation (9 guides, 792 lines)

### Performance
- Baseline: 16/16 tests passing
- WASI tools: fs.read, fs.write (65KB binaries)
- Build time: <5 minutes for all components

### Security
- Filesystem allowlist validation
- Read-only flag support
- Log redaction for PII protection
- Context-driven RBAC

## [0.4.0] - Planning Phase

### Planned
- Spiral-1 Week 2: Performance optimization (10K evt/s target)
- Spiral-1 Week 3: Enhanced observability (WebView telemetry)
- Spiral-2: Deep VS Code integration
- Spiral-3: Production Context Engine hardening
- Spiral-4: 72h stress testing

---

## Release Process

1. Update version in `Cargo.toml` and `package.json` files
2. Update `CHANGELOG.md` with changes since last release
3. Create git tag: `git tag -a v0.5.0 -m "Release v0.5.0"`
4. Push tag: `git push origin v0.5.0`
5. GitHub Actions will automatically build and create release

## Links

- [GitHub Releases](https://github.com/nurones/nurones-mcp/releases)
- [Documentation](README.md)
- [Contributing Guide](CONTRIBUTING.md)
