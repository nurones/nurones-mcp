// Contract SSOT - JSON Schemas (runtime validation) + TS types (compile-time)

/**
 * ContextFrame JSON Schema v1.0
 * Runtime validation schema for ContextFrame structure
 */
export const ContextFrameSchema = {
  type: "object",
  required: ["reason_trace_id", "tenant_id", "stage", "risk_level", "ts"],
  properties: {
    reason_trace_id: { type: "string", minLength: 1 },
    tenant_id: { type: "string", minLength: 1 },
    stage: { enum: ["dev", "staging", "prod"] },
    risk_level: { enum: [0, 1, 2] },
    novelty_score: { type: "number", minimum: 0, maximum: 1 },
    context_confidence: { type: "number", minimum: 0, maximum: 1 },
    budgets: { type: "object", additionalProperties: true },
    flags: { type: "object", additionalProperties: true },
    ts: { type: "string", format: "date-time" }
  },
  additionalProperties: false
} as const;

/**
 * Tool Manifest JSON Schema
 * Runtime validation for tool configuration files
 */
export const ToolManifestSchema = {
  type: "object",
  required: ["name", "version", "entry", "permissions"],
  properties: {
    name: { type: "string", minLength: 1 },
    version: { type: "string", minLength: 1 },
    entry: { type: "string", minLength: 1 },
    permissions: { type: "array", items: { type: "string" } },
    description: { type: "string" }
  },
  additionalProperties: true
} as const;

/**
 * Event Metadata Schema
 */
export const EventMetadataSchema = {
  type: "object",
  required: ["correlation_id"],
  properties: {
    correlation_id: { type: "string", minLength: 1 },
    causation_id: { type: "string" },
    user_id: { type: "string" }
  },
  additionalProperties: false
} as const;

/**
 * TypeScript types matching schemas
 */
export type ContextFrame = {
  reason_trace_id: string;
  tenant_id: string;
  stage: "dev" | "staging" | "prod";
  risk_level: 0 | 1 | 2;
  novelty_score?: number;
  context_confidence?: number;
  budgets?: Record<string, number>;
  flags?: Record<string, boolean>;
  ts: string;
};

export type ToolManifest = {
  name: string;
  version: string;
  entry: string;
  permissions: string[];
  description?: string;
};

export type EventMetadata = {
  correlation_id: string;
  causation_id?: string;
  user_id?: string;
};

/**
 * Contract enforcement: Any public API that mutates state MUST accept ContextFrame.
 * Read-only APIs MAY accept it (tiered propagation).
 */
