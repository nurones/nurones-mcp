/**
 * Session Compression Extension - Types
 * Minimal viable implementation (Path A)
 */

export type SourceSpec =
  | { kind: 'paste'; content: string }
  | { kind: 'file'; path: string };

export interface ContextFrame {
  reason_trace_id: string;
  tenant_id: string;
  stage: 'dev' | 'staging' | 'prod';
  risk_level: 0 | 1 | 2;
  ts: string;
}

export interface CompressInputV1 {
  sources: SourceSpec[];
  char_limit: number;
  preserve_markup?: boolean;
  timezone?: string;
  output_dir?: string;
  filename_scheme?: 'date_session_len' | 'source_len';
  dry_run?: boolean;
  context_frame: ContextFrame;
  reason_trace_id: string;
  tenant_id: string;
}

export interface SessionDigest {
  session_id: string;
  path?: string;
  digest: string;
  sha256: string;
  session_timestamp_utc: string;
  local_timestamp_adelaide: string;
  tier_used: 'extractive';
  inferred_timestamp_source: 'front_matter' | 'inline' | 'filename' | 'mtime';
  char_count: number;
}

export interface CompressOutputV1 {
  report: {
    processed: number;
    written: number;
    dry_run: boolean;
    timeline_updated: boolean;
  };
  summaries: SessionDigest[];
  index_path?: string;
  timeline_path?: string;
}

export interface IndexEntry {
  session_id: string;
  session_timestamp_utc: string;
  local_timestamp_adelaide: string;
  path: string;
  sha256: string;
  char_count: number;
  created_at: string;
}
