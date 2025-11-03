# Spiral-1 Roadmap — Enhanced WASI Runtime & Performance

**Duration:** 3 weeks  
**Primary Host:** VS Code  
**Secondary Host:** Qoder  
**Focus:** WASI tool packaging, performance optimization (5k→10k evt/s)

---

## Week 1: WASI Tool Infrastructure

### Goals
- Package existing tools as WASI modules
- Implement WASI runtime in mcp-core
- Test tool execution with context propagation

### Tasks

#### 1.1 WASI Runtime Integration
- [ ] Add `wasmtime` dependency to `mcp-core/Cargo.toml`
- [ ] Implement `WasiToolExecutor` trait
- [ ] Add WASI sandbox configuration
- [ ] Test with simple WASI module

#### 1.2 Tool Packaging
- [ ] Create `tools-wasm/` directory
- [ ] Package `fs.read` as WASI module
- [ ] Package `fs.write` as WASI module
- [ ] Package `telemetry.push` as native module
- [ ] Update tool manifests with WASI entry points

#### 1.3 Context Propagation in WASI
- [ ] Pass ContextFrame via WASI environment
- [ ] Implement context serialization
- [ ] Test context integrity across WASI boundary
- [ ] Verify trace linkage

#### 1.4 VS Code Integration
- [ ] Update extension to support WASI tools
- [ ] Add tool manifest validation
- [ ] Test tool execution from VS Code
- [ ] Verify output in Output Channel

### Acceptance Criteria
- ✅ At least 2 tools packaged as WASI modules
- ✅ Context propagation verified end-to-end
- ✅ Tools execute successfully from VS Code
- ✅ Traces visible in OTel Collector

---

## Week 2: Performance Optimization

### Goals
- Achieve 5k events/sec baseline
- Optimize to 10k events/sec
- Validate adaptive tuning under load

### Tasks

#### 2.1 Baseline Performance
- [ ] Create load testing harness
- [ ] Measure current throughput (est. ~1k evt/s)
- [ ] Profile bottlenecks with `perf`
- [ ] Document p50/p95/p99 latencies

#### 2.2 Event Bus Optimization
- [ ] Implement lock-free event queue
- [ ] Batch event processing
- [ ] Optimize idempotency checks
- [ ] Add connection pooling

#### 2.3 Context Engine Tuning
- [ ] Optimize metric storage (RwLock → DashMap)
- [ ] Implement lazy evaluation
- [ ] Cache frequently accessed contexts
- [ ] Reduce allocation overhead

#### 2.4 WASI Runtime Performance
- [ ] Enable WASI module caching
- [ ] Pre-compile WASI modules
- [ ] Optimize context serialization
- [ ] Benchmark WASI vs native tools

#### 2.5 Observability Overhead
- [ ] Profile OTel span creation
- [ ] Implement sampling (1:100 for high-volume)
- [ ] Optimize metric recording
- [ ] Reduce log verbosity in production

### Acceptance Criteria
- ✅ Sustained 10k events/sec for 1 hour
- ✅ p50 latency < 10ms
- ✅ p95 latency < 50ms
- ✅ Context Engine overhead < 5%

---

## Week 3: Enhanced Observability & Hardening

### Goals
- Add real-time performance metrics to VS Code
- Implement advanced safety controls
- Prepare for 72h stress test (Spiral-4)

### Tasks

#### 3.1 VS Code Performance Dashboard
- [ ] Create WebView panel for metrics
- [ ] Display real-time event throughput
- [ ] Show Context Engine metrics
- [ ] Add latency histograms
- [ ] Integrate Prometheus queries

#### 3.2 Advanced Safety Controls
- [ ] Implement circuit breaker pattern
- [ ] Add rate limiting per tool
- [ ] Enhance retry/backoff policies
- [ ] Add health check endpoint

#### 3.3 Enhanced Logging & Debugging
- [ ] Structured logging with `tracing`
- [ ] Add debug mode with verbose output
- [ ] Implement log filtering by trace ID
- [ ] Create diagnostic dump command

#### 3.4 Configuration Hot-Reload
- [ ] Watch `.mcp/config.json` for changes
- [ ] Implement safe config reload
- [ ] Add validation before applying
- [ ] Notify VS Code on config changes

#### 3.5 Documentation & Testing
- [ ] Update all READMEs with WASI info
- [ ] Create performance tuning guide
- [ ] Add integration tests for VS Code
- [ ] Document troubleshooting scenarios

### Acceptance Criteria
- ✅ VS Code dashboard shows live metrics
- ✅ Safety controls tested under failure scenarios
- ✅ Configuration hot-reload works
- ✅ Documentation complete and accurate

---

## Spiral-1 Final Acceptance Gates

### AT-WASI-TOOLS
- [ ] At least 2 tools packaged as WASI modules
- [ ] WASI execution verified from VS Code
- [ ] Context propagation maintained
- [ ] Tool manifests validated

### AT-PERFORMANCE
- [ ] Sustained 10k events/sec
- [ ] p50 latency < 10ms
- [ ] p95 latency < 50ms
- [ ] No memory leaks over 1 hour

### AT-VSCODE-PRIMARY
- [ ] VS Code extension fully functional
- [ ] All commands working
- [ ] Status bar shows accurate state
- [ ] Output Channel provides useful logs

### AT-OBSERVABILITY
- [ ] OTel traces complete and linked
- [ ] Prometheus metrics exposed
- [ ] VS Code dashboard operational
- [ ] Performance graphs accurate

### AT-SAFETY
- [ ] Circuit breaker functional
- [ ] Rate limiting enforced
- [ ] Filesystem allowlist validated
- [ ] Log redaction working

---

## Deliverables

1. **WASI Runtime** (`mcp-core/src/wasi_executor.rs`)
2. **WASI Tools** (`tools-wasm/*.wasm`)
3. **Performance Benchmarks** (`benchmarks/results.md`)
4. **VS Code Dashboard Panel** (`extensions/vscode/src/dashboard.ts`)
5. **Integration Tests** (`extensions/vscode/tests/*.test.ts`)
6. **Updated Documentation** (all READMEs, guides)

---

## Risk Mitigation

### Risk: WASI Integration Complexity
- **Mitigation**: Start with simplest tool (fs.read)
- **Fallback**: Keep native execution path available

### Risk: Performance Target Unmet
- **Mitigation**: Incremental optimization with profiling
- **Fallback**: Adjust target to realistic baseline + 50%

### Risk: VS Code API Changes
- **Mitigation**: Pin VS Code engine version
- **Fallback**: Test on multiple VS Code versions

### Risk: Context Engine Overhead
- **Mitigation**: Implement lazy evaluation and caching
- **Fallback**: Allow disabling for high-throughput scenarios

---

## Post-Spiral-1: Next Steps

### Spiral-2 (4 weeks): Deep VS Code Integration
- Custom panels and views
- Inline tool execution
- Context visualization
- Enhanced debugging

### Spiral-3 (3 weeks): Production Context Engine
- Multi-tenant isolation
- Advanced RBAC
- Audit logging
- Compliance controls

### Spiral-4 (4 weeks): Production Hardening
- 72h stress test
- Security audit
- Performance optimization
- Final acceptance

---

## Weekly Checkpoints

### Week 1 Checkpoint
- [ ] WASI runtime functional
- [ ] 2 tools packaged
- [ ] Context propagation verified

### Week 2 Checkpoint
- [ ] 5k evt/s baseline achieved
- [ ] Optimization plan documented
- [ ] 10k evt/s target in sight

### Week 3 Checkpoint
- [ ] VS Code dashboard live
- [ ] Safety controls tested
- [ ] Documentation complete

### Final Spiral-1 Review
- [ ] All acceptance gates passed
- [ ] Demo to stakeholders
- [ ] Spiral-2 kickoff scheduled

---

**Status**: 🚀 Ready to Begin  
**Start Date**: TBD  
**End Date**: TBD + 3 weeks  
**Next Milestone**: AT-WASI-TOOLS
