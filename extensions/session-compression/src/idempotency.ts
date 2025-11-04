import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface IdempotencyKey {
  key: string;
  tenant_id: string;
  reason_trace_id: string;
  sources_hash: string;
  char_limit: number;
  output_dir: string;
}

export interface IdempotencyRecord {
  key: string;
  created_at: string;
  result_hash: string;
  metadata: {
    tenant_id: string;
    reason_trace_id: string;
    processed: number;
    written: number;
  };
}

const IDEMPOTENCY_DIR = '/tmp/mcp-idempotency';

export class IdempotencyManager {
  private recordsPath: string;

  constructor(recordsDir: string = IDEMPOTENCY_DIR) {
    this.recordsPath = path.join(recordsDir, 'records.json');
    this.ensureDir(recordsDir);
  }

  /**
   * Generate idempotency key from inputs
   */
  generateKey(
    tenantId: string,
    reasonTraceId: string,
    sources: any[],
    charLimit: number,
    outputDir: string
  ): IdempotencyKey {
    // Sort sources to ensure consistent hashing
    const sortedSources = [...sources].sort((a, b) => {
      const aKey = JSON.stringify(a);
      const bKey = JSON.stringify(b);
      return aKey.localeCompare(bKey);
    });

    const sourcesHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(sortedSources))
      .digest('hex');

    const keyData = `${tenantId}:${reasonTraceId}:${sourcesHash}:${charLimit}:${outputDir}`;
    const key = crypto.createHash('sha256').update(keyData).digest('hex');

    return {
      key,
      tenant_id: tenantId,
      reason_trace_id: reasonTraceId,
      sources_hash: sourcesHash,
      char_limit: charLimit,
      output_dir: outputDir
    };
  }

  /**
   * Check if operation has already been processed
   */
  isDuplicate(key: string): boolean {
    const records = this.loadRecords();
    return key in records;
  }

  /**
   * Get existing result if duplicate
   */
  getExistingResult(key: string): IdempotencyRecord | null {
    const records = this.loadRecords();
    return records[key] || null;
  }

  /**
   * Store operation result
   */
  storeResult(
    key: IdempotencyKey,
    result: any
  ): void {
    const records = this.loadRecords();

    const resultHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(result))
      .digest('hex');

    const record: IdempotencyRecord = {
      key: key.key,
      created_at: new Date().toISOString(),
      result_hash: resultHash,
      metadata: {
        tenant_id: key.tenant_id,
        reason_trace_id: key.reason_trace_id,
        processed: result.report?.processed || 0,
        written: result.report?.written || 0
      }
    };

    records[key.key] = record;
    this.saveRecords(records);
  }

  /**
   * Clean up old records (older than TTL)
   */
  cleanup(ttlHours: number = 24): number {
    const records = this.loadRecords();
    const cutoff = Date.now() - (ttlHours * 60 * 60 * 1000);
    let removed = 0;

    for (const [key, record] of Object.entries(records)) {
      const createdAt = new Date(record.created_at).getTime();
      if (createdAt < cutoff) {
        delete records[key];
        removed++;
      }
    }

    if (removed > 0) {
      this.saveRecords(records);
    }

    return removed;
  }

  /**
   * Load records from disk
   */
  private loadRecords(): Record<string, IdempotencyRecord> {
    if (!fs.existsSync(this.recordsPath)) {
      return {};
    }

    try {
      const data = fs.readFileSync(this.recordsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load idempotency records:', error);
      return {};
    }
  }

  /**
   * Save records to disk
   */
  private saveRecords(records: Record<string, IdempotencyRecord>): void {
    try {
      fs.writeFileSync(
        this.recordsPath,
        JSON.stringify(records, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save idempotency records:', error);
    }
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
