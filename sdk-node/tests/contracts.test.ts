// Contract Conformance Tests for SDK

import { expect, test, describe } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  ContextFrameSchema,
  ToolManifestSchema,
  EventMetadataSchema,
  type ContextFrame,
  type ToolManifest,
  type EventMetadata
} from "../src/contracts";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

describe("ContextFrame Contract", () => {
  const validate = ajv.compile(ContextFrameSchema);

  test("accepts valid ContextFrame", () => {
    const ctx: ContextFrame = {
      reason_trace_id: "test-trace-123",
      tenant_id: "default",
      stage: "dev",
      risk_level: 0,
      context_confidence: 0.7,
      ts: new Date().toISOString()
    };
    
    const result = validate(ctx);
    if (!result) console.error(validate.errors);
    expect(result).toBe(true);
  });

  test("rejects missing required fields", () => {
    const invalid = {
      reason_trace_id: "test",
      // missing tenant_id, stage, risk_level, ts
    };
    
    expect(validate(invalid)).toBe(false);
    expect(validate.errors).toBeDefined();
  });

  test("rejects invalid stage value", () => {
    const invalid = {
      reason_trace_id: "test",
      tenant_id: "default",
      stage: "production", // invalid, should be "prod"
      risk_level: 0,
      ts: new Date().toISOString()
    };
    
    expect(validate(invalid)).toBe(false);
  });

  test("rejects invalid risk_level", () => {
    const invalid = {
      reason_trace_id: "test",
      tenant_id: "default",
      stage: "dev",
      risk_level: 5, // invalid, must be 0, 1, or 2
      ts: new Date().toISOString()
    };
    
    expect(validate(invalid)).toBe(false);
  });

  test("validates optional fields within bounds", () => {
    const ctx: ContextFrame = {
      reason_trace_id: "test",
      tenant_id: "default",
      stage: "staging",
      risk_level: 1,
      novelty_score: 0.5,
      context_confidence: 0.8,
      budgets: { cpu_ms: 1000 },
      flags: { allow_autotune: true },
      ts: new Date().toISOString()
    };
    
    expect(validate(ctx)).toBe(true);
  });
});

describe("Tool Manifest Contract", () => {
  const validate = ajv.compile(ToolManifestSchema);

  test("accepts valid tool manifest", () => {
    const manifest: ToolManifest = {
      name: "fs.read",
      version: "1.1.0",
      entry: "wasm://examples/fs-read/target/wasm32-wasip1/release/fs_read.wasm",
      permissions: ["read"],
      description: "File read tool"
    };
    
    expect(validate(manifest)).toBe(true);
  });

  test("rejects missing required fields", () => {
    const invalid = {
      name: "fs.read",
      // missing version, entry, permissions
    };
    
    expect(validate(invalid)).toBe(false);
  });

  test("validates permissions array", () => {
    const manifest = {
      name: "fs.write",
      version: "1.0.0",
      entry: "wasm://test.wasm",
      permissions: ["write", "read"]
    };
    
    expect(validate(manifest)).toBe(true);
  });
});

describe("Event Metadata Contract", () => {
  const validate = ajv.compile(EventMetadataSchema);

  test("accepts valid metadata", () => {
    const metadata: EventMetadata = {
      correlation_id: "test-correlation-123",
      causation_id: "test-causation-456",
      user_id: "user-789"
    };
    
    expect(validate(metadata)).toBe(true);
  });

  test("accepts minimal metadata", () => {
    const metadata: EventMetadata = {
      correlation_id: "test-123"
    };
    
    expect(validate(metadata)).toBe(true);
  });

  test("rejects missing correlation_id", () => {
    const invalid = {
      user_id: "test"
    };
    
    expect(validate(invalid)).toBe(false);
  });
});
