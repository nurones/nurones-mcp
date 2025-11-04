# Session Compression Extension - Path B Roadmap

## Overview
Advanced features for session compression with LLM integration, quality scoring, and external integrations.

## Path B Features (Future Enhancement)

### 1. LLM Integration (Compression Tiers)
- **T0 (Extractive)**: Simple text extraction (current implementation)
- **T1 (Light Abstractive)**: Basic summarization with keyword extraction
- **T2 (Abstractive)**: Full abstractive summarization with context preservation
- **T3 (Entity Roll-up)**: Advanced entity extraction and relationship mapping

**Implementation:**
- OpenAI/Anthropic API integration
- Configurable model selection per tier
- Token budget management
- Cost tracking per compression

### 2. Quality Scoring (ROUGE-L)
- **ROUGE-L Metrics**: Compute longest common subsequence similarity
- **Quality Thresholds**: 
  - T1 ≥ 0.85
  - T2 ≥ 0.70
  - T3 ≥ 0.60
- **Auto-Rollback**: Fallback to safer tier on quality failure
- **Event Emission**: `compression.quality_rollback` events

**Dependencies:**
```bash
npm install rouge
# or Python-based: pip install rouge-score
```

### 3. Notion API Integration
- **Bearer Token Management**: Tenant-scoped secret refs
- **Fetch Modes**: HTML, Markdown, Plaintext
- **Source Spec Extension**:
  ```typescript
  | { kind: 'notion'; url: string; bearerSecretRef?: string }
  ```
- **Error Handling**: Fallback to inline summary on API failures

### 4. Idempotency & Event Persistence
- **Idempotency Key**: `sha256(tenant_id + reason_trace_id + sorted(source_ids) + char_limit + output_dir)`
- **Event Store**: UUIDv7 events with first-write-wins semantics
- **Duplicate Detection**: `IEventPersistence.queryDuplicate()`
- **Rollback Support**: Version tracking with snapshot pointers

### 5. Advanced Observability
**Prometheus Metrics:**
- `session.tokens_saved` - Token reduction achieved
- `session.quality_score` - ROUGE-L score distribution
- `session.latency_ms` - Processing time breakdown
- `session.char_overflow_trims` - Character limit violations
- `session.rouge_fallbacks` - Quality-driven tier rollbacks
- `session.writes_count` - Filesystem operations

**OpenTelemetry Traces:**
- Root span per invocation
- Child spans per source
- Attributes: `reason_trace_id`, `tenant_id`, `tier`, `quality_score`

### 6. RBAC & Security Enhancements
- **ContextFrame Gates**: Risk-level based autotune control
- **Tenant Isolation**: Secret management per tenant
- **Read-Only Mode**: Honor `read_only` flag in ContextFrame
- **Quota Enforcement**: Rate limiting and resource budgets
- **Allowlist Validation**: Strict filesystem boundary checks

### 7. Performance Targets
- **p50 Latency**: <10ms orchestration (LLM-free path)
- **p95 Latency**: <500ms (with T2 LLM compression)
- **Rollback Time**: <30s for batch operations
- **Test Coverage**: 90%+ line coverage

### 8. UI Enhancements
**Admin Web:**
- Live preview of digest before execution
- Compression history with rollback button
- Quality score visualization
- Cost tracking dashboard

**VS Code/Qoder:**
- Palette commands with autocomplete
- Inline preview of summaries
- Batch operation progress indicators

## Implementation Phases

### Phase 1: Foundation (Current - Path A) ✅
- [x] Basic file/paste compression
- [x] Timestamp parsing (4-step priority)
- [x] Character limit enforcement
- [x] Index & timeline generation
- [x] MCP tool registration
- [x] Admin UI basic page

### Phase 2: LLM Integration
- [ ] OpenAI API client
- [ ] Tier-based compression logic
- [ ] Token budget management
- [ ] Model configuration per tier

### Phase 3: Quality Assurance
- [ ] ROUGE-L scoring implementation
- [ ] Quality threshold validation
- [ ] Auto-rollback mechanism
- [ ] Quality metrics tracking

### Phase 4: External Integrations
- [ ] Notion API client
- [ ] Secret management system
- [ ] Multi-source batch processing
- [ ] Error recovery strategies

### Phase 5: Production Hardening
- [ ] Idempotency with event store
- [ ] Comprehensive observability
- [ ] RBAC enforcement
- [ ] Performance optimization
- [ ] Load testing & benchmarks

## Configuration Examples

### LLM Provider Config
```json
{
  "llm": {
    "provider": "openai",
    "tiers": {
      "T1": { "model": "gpt-4o-mini", "max_tokens": 1000 },
      "T2": { "model": "gpt-4o", "max_tokens": 2000 },
      "T3": { "model": "gpt-4o", "max_tokens": 4000 }
    },
    "api_key_ref": "env:OPENAI_API_KEY"
  }
}
```

### Quality Thresholds
```json
{
  "quality": {
    "rouge_l_thresholds": {
      "T1": 0.85,
      "T2": 0.70,
      "T3": 0.60
    },
    "auto_rollback": true,
    "fallback_tier": "T0"
  }
}
```

## Testing Strategy

### Unit Tests
- Timestamp extraction (all 4 sources)
- Character limit edge cases
- Markdown stripping logic
- Session ID collision handling

### Integration Tests
- End-to-end API execution
- File writing & index generation
- Timeline chronological ordering
- RBAC permission enforcement

### Performance Tests
- Batch processing (100+ sessions)
- Large file handling (>1MB)
- Concurrent execution
- Memory leak detection

## Migration Path
Existing Path A implementations remain fully functional. Path B features are additive and opt-in via configuration flags.

## Dependencies
```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "rouge": "^1.0.0",
    "@notionhq/client": "^2.0.0"
  }
}
```

## References
- UMT FR-007: Compression Tier Specifications
- UMCF: Context Frame Governance
- MCP Server Architecture: Tool Execution Model
