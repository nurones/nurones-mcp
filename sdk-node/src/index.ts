/**
 * @nurones/mcp-sdk v0.5
 * Node/TypeScript SDK with ContextFrame support
 */

/**
 * ContextFrame schema v1.0 — Required for all MCP operations
 */
export interface ContextFrame {
  /** Trace of reasoning flow — required */
  reason_trace_id: string;
  /** Tenant isolation key — required */
  tenant_id: string;
  /** Deployment stage — required */
  stage: 'dev' | 'staging' | 'prod';
  /** Risk level: 0=safe, 1=caution, 2=block autotune — required */
  risk_level: 0 | 1 | 2;
  /** Measure of new behavior (0..1) */
  novelty_score?: number;
  /** Determines eligibility for self-tuning (0..1) */
  context_confidence?: number;
  /** Resource budgets */
  budgets?: {
    cpu_ms?: number;
    mem_mb?: number;
    rps?: number;
  };
  /** Feature flags */
  flags?: {
    allow_autotune?: boolean;
    read_only?: boolean;
  };
  /** ISO timestamp */
  ts: string;
}

/**
 * Event metadata for persistence layer
 */
export interface EventMetadata {
  correlationId: string;
  causationId?: string;
  userId?: string;
}

/**
 * Event response structure
 */
export interface EventResponse {
  eventId: string;
  streamId: string;
  version: number;
  timestamp: string;
}

/**
 * Contract 1: IEventPersistence
 */
export interface IEventPersistence {
  appendEvent(
    stream: string,
    type: string,
    data: object,
    metadata: EventMetadata & ContextFrame
  ): Promise<EventResponse>;
  
  queryDuplicate(correlationId: string): Promise<string | null>;
}

/**
 * Tool execution context
 */
export interface ExecutionContext {
  toolId: string;
  input: Record<string, any>;
  timeout?: number;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime: number;
  contextUsed: ContextFrame;
}

/**
 * Contract 2: IToolExecutor
 */
export interface IToolExecutor {
  execute(
    toolId: string,
    input: Record<string, any>,
    ctx: ExecutionContext & ContextFrame
  ): Promise<ToolResult>;
  
  validateManifest(path: string): Promise<boolean>;
}

/**
 * Configuration scope types
 */
export type ConfigScope = 'tenant' | 'profile' | 'toolset';

/**
 * Contract 3: IConfigRegistry
 */
export interface IConfigRegistry {
  load(
    scope: ConfigScope,
    context?: ContextFrame
  ): Promise<Record<string, any>>;
  
  update(
    scope: string,
    data: object,
    context?: ContextFrame
  ): Promise<void>;
}

/**
 * Trace status enumeration
 */
export type TraceStatus = 'ok' | 'error';

/**
 * Contract 4: IObservabilityService
 */
export interface IObservabilityService {
  record(
    metric: string,
    value: number,
    tags?: Record<string, string>,
    context?: ContextFrame
  ): void;
  
  startTrace(name: string, context?: ContextFrame): string;
  
  endTrace(id: string, status?: TraceStatus): void;
}

/**
 * File write options
 */
export interface WriteOptions {
  encoding?: string;
  mode?: number;
  createDirs?: boolean;
}

/**
 * File search options
 */
export interface SearchOptions {
  maxResults?: number;
  includeHidden?: boolean;
  caseSensitive?: boolean;
}

/**
 * File diff result
 */
export interface FileDiff {
  line: number;
  type: 'add' | 'remove' | 'modify';
  content: string;
}

/**
 * File search result
 */
export interface SearchResult {
  path: string;
  matches: Array<{
    line: number;
    content: string;
  }>;
}

/**
 * Contract 6: IFilesystemToolset
 */
export interface IFilesystemToolset {
  read(path: string, context?: ContextFrame): Promise<string>;
  
  write(
    path: string,
    content: string,
    opts?: WriteOptions,
    context?: ContextFrame
  ): Promise<void>;
  
  diff(
    pathA: string,
    pathB: string,
    context?: ContextFrame
  ): Promise<FileDiff[]>;
  
  search(
    pattern: string,
    options?: SearchOptions,
    context?: ContextFrame
  ): Promise<SearchResult[]>;
}

/**
 * Utility: Create default ContextFrame
 */
export function createDefaultContext(overrides?: Partial<ContextFrame>): ContextFrame {
  return {
    reason_trace_id: overrides?.reason_trace_id || `trace-${Date.now()}`,
    tenant_id: overrides?.tenant_id || 'default',
    stage: overrides?.stage || 'dev',
    risk_level: overrides?.risk_level ?? 0,
    context_confidence: overrides?.context_confidence ?? 0.7,
    ts: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Utility: Validate ContextFrame
 */
export function validateContext(ctx: ContextFrame): boolean {
  if (!ctx.reason_trace_id || !ctx.tenant_id || !ctx.stage) {
    return false;
  }
  if (![0, 1, 2].includes(ctx.risk_level)) {
    return false;
  }
  if (!['dev', 'staging', 'prod'].includes(ctx.stage)) {
    return false;
  }
  return true;
}

export * from './types';
