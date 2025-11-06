# @nurones/mcp — Final SSOT Product Requirements & Architecture (v0.5)

**License:** Apache-2.0 (Core) + MIT (Extensions)  
**Version:** 0.5-NURONES (Spiral + Context Engineering Hardened)  
**Architect:** JW (Unified Meta-Cognitive Framework v3.4)  
**Release Date:** November 2025  
**Status:** Final Production-Grade SSOT (Nurones Component)

---

## 1. Overview

The **@nurones/mcp** is a **core Nurones component** developed to run within the **Qoder Platform** (analogous to VS Code). It provides a self-adaptive, context-aware Model Context Protocol (MCP) runtime. This document defines the full production specification optimized for Qoder integration, ensuring that Qoder can host, execute, and manage this component with minimal sponsor intervention.

This release represents the **final, hardened version** of the @nurones/mcp component, including spiral development, context engineering, rollback and safety mechanisms, and a temporary React TypeScript UI for administrative control.

---

## 2. Spiral Development Model

### 2.1 Spiral Loop Structure
Each spiral iteration includes:
1. **Prototype:** Define goals and risks; develop isolated features.  
2. **Integrate:** Merge subsystems into unified @nurones/mcp runtime for Qoder.  
3. **Evaluate:** Validate contextual metrics and performance.  
4. **Harden:** Stress-test, validate rollbacks, finalize configurations.

### 2.2 Iteration Schedule
| Spiral | Duration | Focus | Output |
|---------|-----------|--------|---------|
| S1 | 3 weeks | Core Rust MCP runtime | Baseline component for Qoder integration |
| S2 | 4 weeks | VS Code / Qoder Integration | Command palette, event linkages |
| S3 | 3 weeks | Context Engine + Safety controls | Autonomous operation verified |
| S4 | 4 weeks | Production hardening | Final SSOT-ready component |

---

## 3. Context Engineering Framework

### 3.1 Purpose
Enable self-adaptive performance and autonomous operation inside Qoder while maintaining deterministic safety boundaries.

### 3.2 Components
- **Context Memory Layer:** Persists `reason_trace_id`, `risk_level`, and performance data.
- **Adaptive Config Engine:** Auto-tunes limits and retries when context confidence ≥ 0.6.
- **Context Evaluator:** Derives operational scores (`context_confidence`, `novelty_score`, `learning_value`).
- **Rollback Manager:** Enables single-command restoration to last stable configuration.

### 3.3 ContextFrame Schema (v1.0)
```typescript
export interface ContextFrame {
  reason_trace_id: string;           // required — trace of reasoning flow
  tenant_id: string;                 // required — isolation key
  stage: 'dev' | 'staging' | 'prod'; // required — deployment stage
  risk_level: 0 | 1 | 2;             // required — 0 = safe, 1 = caution, 2 = block autotune
  novelty_score?: number;            // 0..1 — measure of new behavior
  context_confidence?: number;       // 0..1 — determines eligibility for self-tuning
  budgets?: { cpu_ms?: number; mem_mb?: number; rps?: number };
  flags?: { allow_autotune?: boolean; read_only?: boolean };
  ts: string;                        // ISO timestamp
}
```

### 3.4 Safety Boundaries
- Autotune active only when `risk_level = 0` **and** `context_confidence ≥ 0.6`.
- Limit automated changes to ±10% in 24 hours.
- Require two consecutive successful SLO cycles before persisting new baselines.
- Rollback snapshots auto-generated at each spiral checkpoint.
- `CONTEXT_ENGINE=off` forces deterministic configuration.

### 3.5 Migration from v0.2
- Backward-compatible via compatibility shim adding a default `ContextFrame`.
- Deprecation window = 2 spirals (~14 weeks).
- Static deterministic mode always available.

---

## 4. Functional Requirements

### 4.1 Core MCP Engine
| ID | Feature | Description |
|----|----------|-------------|
| FR-001 | **Event Bus** | Context-aware, idempotent event routing with rollback safety. |
| FR-002 | **Tool Executor** | Executes WASI/Node tools in isolation; propagates ContextFrame selectively (Tier 1 only). |
| FR-003 | **Adaptive Config Engine** | Auto-tunes quotas and limits using live context metrics. |
| FR-004 | **RBAC & Policy Engine** | Enforces context-driven role permissions; adjusts by risk level. |
| FR-005 | **Explainability Engine** | Creates Reason Trace Cards for all operations (viewable in Qoder). |

### 4.2 Qoder Integration
| ID | Feature | Description |
|----|----------|-------------|
| FR-006 | **Command Palette Support** | Register @nurones/mcp commands directly in Qoder's palette. |
| FR-007 | **Trace Viewer Integration** | Show live ContextFrame data and spans in Qoder telemetry panel. |
| FR-008 | **Adaptive Debug Panel** | Interactive debugging for risk tuning and rollback. |

### 4.3 React TypeScript Frontend (Temporary Admin UI)
| ID | Feature | Description |
|----|----------|-------------|
| FR-009 | **Framework** | Next.js + TypeScript + Tailwind + shadcn/ui. |
| FR-010 | **Layout** | Header → Description → Tabs → Scrollable Area with cyan-accent dark/light theme. |
| FR-011 | **Pages** | Dashboard, Tools, Policies, Telemetry, Context Monitor. |
| FR-012 | **API Bridge** | Exposes `/api/context` and `/api/telemetry` for Qoder consumption. |

### 4.4 Filesystem Tools
| ID | Feature | Description |
|----|----------|-------------|
| FR-013 | **FS Operations** | Read, write, search, diff, and archive controlled by ContextFrame. |
| FR-014 | **FS Quotas** | Adaptive throttling using contextual metrics. |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|-----------|-------------|
| NFR-001 | **Performance** | Sustain 10K events/sec; auto-tune to <10ms p50 latency. |
| NFR-002 | **Security** | WASI isolation; signed manifests; adaptive RBAC. |
| NFR-003 | **Reliability** | Self-healing, rollback <30s. |
| NFR-004 | **Scalability** | Qoder container scaling based on telemetry. |
| NFR-005 | **Maintainability** | Modular Rust + TypeScript; 90% test coverage. |
| NFR-006 | **Observability** | OTel + Prometheus integrated; context-linked spans. |
| NFR-007 | **Governance** | Runs autonomously; Qoder provides visual oversight only. |

---

## 6. Contract Specifications

### Contract 1: IEventPersistence
```typescript
interface IEventPersistence {
  appendEvent(stream: string, type: string, data: object, metadata: EventMetadata & ContextFrame): Promise<EventResponse>;
  queryDuplicate(correlationId: string): Promise<EventId | null>;
}
```
- Guarantees: Context data inclusion; rollback-safe idempotency.

### Contract 2: IToolExecutor
```typescript
interface IToolExecutor {
  execute(toolId: string, input: Record<string, any>, ctx: ExecutionContext & ContextFrame): Promise<ToolResult>;
  validateManifest(path: string): Promise<boolean>;
}
```
- Guarantees: Tiered context propagation; bounded learning adjustments.

### Contract 3: IConfigRegistry
```typescript
interface IConfigRegistry {
  load(scope: 'tenant'|'profile'|'toolset', context?: ContextFrame): Promise<Record<string, any>>;
  update(scope: string, data: object, context?: ContextFrame): Promise<void>;
}
```
- Guarantees: Context-validated configuration updates with rollback.

### Contract 4: IObservabilityService
```typescript
interface IObservabilityService {
  record(metric: string, value: number, tags?: Record<string,string>, context?: ContextFrame): void;
  startTrace(name: string, context?: ContextFrame): string;
  endTrace(id: string, status?: 'ok'|'error'): void;
}
```
- Guarantees: OTel compatibility; contextualized telemetry.

### Contract 5: IQoderIntegration
```typescript
interface IQoderIntegration {
  registerExtension(manifest: string, context?: ContextFrame): Promise<boolean>;
  exposeCommands(commands: QoderCommand[], context?: ContextFrame): Promise<void>;
  streamTelemetry(callback: (log: string)=>void, context?: ContextFrame): Promise<void>;
}
```
- Guarantees: Secure Qoder extension linkage with ContextFrame propagation.

### Contract 6: IFilesystemToolset
```typescript
interface IFilesystemToolset {
  read(path: string, context?: ContextFrame): Promise<string>;
  write(path: string, content: string, opts?: WriteOptions, context?: ContextFrame): Promise<void>;
  diff(pathA: string, pathB: string, context?: ContextFrame): Promise<FileDiff[]>;
  search(pattern: string, options?: SearchOptions, context?: ContextFrame): Promise<SearchResult[]>;
}
```
- Guarantees: Context-governed IO and adaptive throttling.

---

## 7. Deliverables
- **Rust MCP Server (Core Runtime)**  
- **Node SDK (ContextFrame Support)**  
- **Qoder Integration Layer (Command + Telemetry)**  
- **React/TypeScript Admin UI (temporary baseline)**  
- **Observability Stack (OTel + Prometheus)**  
- **Migration Toolkit (v0.2 → v0.5)**  
- **Spiral Program Plan + Hardening Protocols**

---

## 8. Acceptance Gates
| ID | Test | Description |
|----|------|-------------|
| AT-CONTEXT-SCHEMA | ContextFrame validated; default fallback supported. |
| AT-AUTO-SAFE | Context Engine limited to ±10% adaptive range. |
| AT-HARDEN-STRESS | 72h sustained load @10K events/sec. |
| AT-QODER-INTEG | Qoder command + telemetry integration functional. |
| AT-FS-SEC | Sandbox and context-logged FS ops validated. |
| AT-ROLLBACK | Rollback restores previous stable config instantly. |
| AT-UI-BUILD | React UI compiles and deploys for Qoder management. |

---

**Final Statement:**  
This document represents the **final SSOT for the @nurones/mcp component**, fully optimized for **Qoder Platform execution**. It defines the complete production requirements, contracts, context specifications, and safety mechanisms necessary for integration and operation as a Qoder-managed component.

---
**End of Document — @nurones/mcp v0.5 Final SSOT (for Qoder Platform)**

