/**
 * Session Compression Tool - Main Entry Point
 * Path A + Path B: Full implementation with LLM, quality scoring, and Notion
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
  CompressInputV1,
  CompressOutputV1,
  SessionDigest,
  IndexEntry,
  SourceSpec
} from './types';
import { parseTimestamp, generateSessionId } from './timestamp-parser';
import { compressDigest, formatSessionDigest } from './compressor';
import { LLMCompressor, CompressionTier } from './llm-compressor';
import { QualityScorer } from './quality-scorer';
import { NotionFetcher } from './notion-client';
import { IdempotencyManager } from './idempotency';
import { Logger } from './logger';
import { metrics } from './metrics';
import { tracer } from './tracing';
import { rbac } from './rbac';

const DEFAULT_OUTPUT_DIR = '/tmp/summaries';
const DEFAULT_TIMEZONE = 'Australia/Adelaide';

/**
 * Process a single source
 */
async function processSource(
  source: SourceSpec,
  options: {
    charLimit: number;
    preserveMarkup: boolean;
    timezone: string;
    outputDir: string;
    dryRun: boolean;
    tier: CompressionTier;
    enableQualityCheck: boolean;
    llmCompressor?: LLMCompressor;
    qualityScorer?: QualityScorer;
    notionFetcher?: NotionFetcher;
  }
): Promise<SessionDigest> {
  let content: string;
  let filepath: string | undefined;
  
  // Load content based on source type
  if (source.kind === 'paste') {
    content = source.content;
  } else if (source.kind === 'file') {
    filepath = source.path;
    content = fs.readFileSync(filepath, 'utf-8');
  } else if (source.kind === 'notion' && options.notionFetcher) {
    const pageId = NotionFetcher.extractPageId(source.url);
    const page = await options.notionFetcher.fetchPage(pageId);
    content = page.content;
    filepath = source.url;
  } else {
    throw new Error(`Unsupported source kind: ${(source as any).kind}`);
  }
  
  // Parse timestamp
  const timestamp = parseTimestamp(content, filepath, options.timezone);
  
  // Generate session ID
  const sessionId = generateSessionId(content, filepath);
  
  // Compress content using appropriate tier
  let compressedText: string;
  let tier: CompressionTier = options.tier;
  let tokensUsed = 0;
  let llmModel: string | undefined;
  let cost: number | undefined;
  let qualityScore: number | undefined;
  let qualityPassed: boolean | undefined;
  let rollbackOccurred = false;
  
  if (tier === 'T0' || !options.llmCompressor) {
    // Extractive compression (no LLM)
    const compressed = compressDigest(content, {
      charLimit: options.charLimit,
      preserveMarkup: options.preserveMarkup
    });
    compressedText = compressed.digest;
  } else {
    // LLM-based compression
    const llmResult = await options.llmCompressor.compress(content, tier, options.charLimit);
    compressedText = llmResult.summary;
    tokensUsed = llmResult.tokensUsed;
    llmModel = llmResult.model;
    cost = llmResult.cost;
    
    // Quality check if enabled
    if (options.enableQualityCheck && options.qualityScorer) {
      const score = options.qualityScorer.score(content, compressedText, tier);
      qualityScore = score.rougeL;
      qualityPassed = score.passed;
      
      // Rollback if quality too low
      if (options.qualityScorer.shouldRollback(score)) {
        const fallbackTier = options.qualityScorer.getFallbackTier();
        const logger = new Logger({
          session_id: sessionId,
          operation: 'quality_rollback'
        });
        logger.warn('Quality check failed, rolling back', {
          tier,
          quality_score: (score.rougeL * 100).toFixed(1) + '%',
          threshold: (score.threshold * 100).toFixed(0) + '%',
          fallback_tier: fallbackTier
        });
        
        // Retry with fallback tier
        if (fallbackTier === 'T0') {
          const compressed = compressDigest(content, {
            charLimit: options.charLimit,
            preserveMarkup: options.preserveMarkup
          });
          compressedText = compressed.digest;
        } else {
          const fallbackResult = await options.llmCompressor.compress(content, fallbackTier, options.charLimit);
          compressedText = fallbackResult.summary;
          tokensUsed += fallbackResult.tokensUsed;
          cost = (cost || 0) + (fallbackResult.cost || 0);
        }
        
        tier = fallbackTier;
        rollbackOccurred = true;
      }
    }
  }
  
  // Create final digest with metadata
  const compressed = compressDigest(compressedText, {
    charLimit: options.charLimit,
    preserveMarkup: options.preserveMarkup
  });
  
  const formattedDigest = formatSessionDigest(sessionId, timestamp, compressed);
  
  // Determine output path
  let outputPath: string | undefined;
  if (!options.dryRun) {
    const dateStr = timestamp.utc.split('T')[0].replace(/-/g, '');
    const filename = `${dateStr}_${sessionId}_summary_${compressed.charCount}.md`;
    outputPath = path.join(options.outputDir, filename);
    
    // Ensure output directory exists
    fs.mkdirSync(options.outputDir, { recursive: true });
    
    // Write file
    fs.writeFileSync(outputPath, formattedDigest, 'utf-8');
  }
  
  return {
    session_id: sessionId,
    path: outputPath,
    digest: formattedDigest,
    sha256: compressed.sha256,
    session_timestamp_utc: timestamp.utc,
    local_timestamp_adelaide: timestamp.adelaide,
    tier_used: tier,
    inferred_timestamp_source: timestamp.source,
    char_count: compressed.charCount,
    tokens_used: tokensUsed > 0 ? tokensUsed : undefined,
    llm_model: llmModel,
    quality_score: qualityScore,
    quality_passed: qualityPassed,
    cost: cost,
    rollback_occurred: rollbackOccurred
  };
}

/**
 * Build index file
 */
function buildIndex(
  summaries: SessionDigest[],
  outputDir: string,
  dryRun: boolean
): string | undefined {
  // Sort by UTC timestamp
  const sorted = [...summaries].sort((a, b) => 
    a.session_timestamp_utc.localeCompare(b.session_timestamp_utc)
  );
  
  const entries: IndexEntry[] = sorted.map(s => ({
    session_id: s.session_id,
    session_timestamp_utc: s.session_timestamp_utc,
    local_timestamp_adelaide: s.local_timestamp_adelaide,
    path: s.path || '',
    sha256: s.sha256,
    char_count: s.char_count,
    created_at: new Date().toISOString()
  }));
  
  const indexPath = path.join(outputDir, '_index.json');
  
  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
    return indexPath;
  }
  
  return undefined;
}

/**
 * Build timeline file
 */
function buildTimeline(
  summaries: SessionDigest[],
  outputDir: string,
  dryRun: boolean
): string | undefined {
  // Sort by UTC timestamp (oldest first)
  const sorted = [...summaries].sort((a, b) => 
    a.session_timestamp_utc.localeCompare(b.session_timestamp_utc)
  );
  
  const lines = [
    '# Session Timeline',
    '',
    '_Chronological index of all sessions (oldest → newest)_',
    '',
    ...sorted.map(s => {
      const date = s.local_timestamp_adelaide.split('T')[0];
      return `- **${date}** - [${s.session_id}](${path.basename(s.path || '')}) (${s.char_count} chars)`;
    })
  ];
  
  const timelinePath = path.join(outputDir, '_timeline.md');
  
  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(timelinePath, lines.join('\n'), 'utf-8');
    return timelinePath;
  }
  
  return undefined;
}

/**
 * Main compression function with full observability and RBAC
 */
export async function compressSession(input: CompressInputV1): Promise<CompressOutputV1> {
  // Start root trace span
  const rootSpan = tracer.startSpan('session.compress', {
    reason_trace_id: input.reason_trace_id,
    tenant_id: input.tenant_id,
    sources_count: input.sources.length,
    char_limit: input.char_limit,
    tier: input.compression_tier || 'T0'
  });

  const startTime = Date.now();

  try {
    // Initialize logger with context
    const logger = new Logger({
      reason_trace_id: input.reason_trace_id,
      tenant_id: input.tenant_id,
      operation: 'session.compress'
    });
    
    logger.info('Starting session compression', {
      sources: input.sources.length,
      char_limit: input.char_limit,
      tier: input.compression_tier || 'T0'
    });
    
    const outputDir = input.output_dir || DEFAULT_OUTPUT_DIR;
    const timezone = input.timezone || DEFAULT_TIMEZONE;
    const preserveMarkup = input.preserve_markup ?? false;
    const dryRun = input.dry_run ?? false;
    let tier: CompressionTier = input.compression_tier || 'T0';
    
    // RBAC: Auto-tune tier based on risk level
    tier = rbac.autoTuneTier(tier, input.context_frame);
    tracer.addEvent('rbac_tier_autotuned', { original: input.compression_tier, final: tier });
    
    // RBAC: Validate character limit
    rbac.validateCharLimit(input.char_limit, input.context_frame);
    tracer.addEvent('rbac_char_limit_validated');
    
    // RBAC: Validate tier
    rbac.validateTier(tier, input.context_frame);
    tracer.addEvent('rbac_tier_validated');
    
    // RBAC: Check if quality check is required
    const enableQualityCheck = input.enable_quality_check ?? rbac.requiresQualityCheck(input.context_frame);
    if (enableQualityCheck) {
      tracer.addEvent('quality_check_enabled', { required_by_rbac: rbac.requiresQualityCheck(input.context_frame) });
    }
  
  // Idempotency check
  const idempotency = new IdempotencyManager();
  const idempKey = idempotency.generateKey(
    input.tenant_id,
    input.reason_trace_id,
    input.sources,
    input.char_limit,
    outputDir
  );
  
  // Check for duplicate
  if (idempotency.isDuplicate(idempKey.key)) {
    const existing = idempotency.getExistingResult(idempKey.key);
    logger.warn('Duplicate request detected', {
      idempotency_key: idempKey.key.slice(0, 12) + '...',
      original_processed: existing?.metadata.processed
    });
    
    // Return minimal response for duplicate
    return {
      report: {
        processed: existing?.metadata.processed || 0,
        written: 0, // Already written previously
        dry_run: true,
        timeline_updated: false,
        duplicate_request: true
      },
      summaries: [],
      index_path: undefined,
      timeline_path: undefined
    } as any; // Type assertion needed for duplicate_request field
  }
  
  // Initialize Path B components if tier > T0
  let llmCompressor: LLMCompressor | undefined;
  let qualityScorer: QualityScorer | undefined;
  let notionFetcher: NotionFetcher | undefined;
  
  if (tier !== 'T0') {
    llmCompressor = new LLMCompressor({
      provider: input.llm_config?.provider || 'openai',
      apiKey: input.llm_config?.apiKey
    });
    
    if (!llmCompressor.isAvailable()) {
      logger.warn('LLM not available, falling back to T0', { requested_tier: tier });
      llmCompressor = undefined;
    } else {
      logger.info('LLM compressor initialized', { tier, provider: input.llm_config?.provider || 'openai' });
    }
  }
  
  if (enableQualityCheck) {
    qualityScorer = new QualityScorer();
  }
  
  // Check if any source needs Notion
  const hasNotionSource = input.sources.some(s => s.kind === 'notion');
  if (hasNotionSource) {
    // RBAC: Validate Notion sources are allowed
    rbac.validateNotionSource(input.context_frame);
    tracer.addEvent('rbac_notion_validated');
    
    notionFetcher = new NotionFetcher();
    if (!notionFetcher.isAvailable()) {
      logger.error('Notion API key not configured');
      throw new Error('Notion API key not configured. Set NOTION_API_KEY environment variable.');
    }
    logger.info('Notion fetcher initialized');
  }
  
  // Process all sources
  const summaries: SessionDigest[] = [];
  let totalTokens = 0;
  let totalCost = 0;
  let rollbackCount = 0;
  const qualityScores: number[] = [];
  
  for (const source of input.sources) {
    const summary = await processSource(source, {
      charLimit: input.char_limit,
      preserveMarkup,
      timezone,
      outputDir,
      dryRun,
      tier,
      enableQualityCheck,
      llmCompressor,
      qualityScorer,
      notionFetcher
    });
    summaries.push(summary);
    
    // Aggregate metrics
    if (summary.tokens_used) totalTokens += summary.tokens_used;
    if (summary.cost) totalCost += summary.cost;
    if (summary.rollback_occurred) rollbackCount++;
    if (summary.quality_score !== undefined) qualityScores.push(summary.quality_score);
  }
  
  // Calculate average quality score
  const avgQualityScore = qualityScores.length > 0
    ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
    : undefined;
  
  // Build index and timeline
  const indexPath = buildIndex(summaries, outputDir, dryRun);
  const timelinePath = buildTimeline(summaries, outputDir, dryRun);
  
  const result: CompressOutputV1 = {
    report: {
      processed: summaries.length,
      written: dryRun ? 0 : summaries.length,
      dry_run: dryRun,
      timeline_updated: !dryRun,
      total_tokens_used: totalTokens > 0 ? totalTokens : undefined,
      total_cost: totalCost > 0 ? totalCost : undefined,
      quality_rollbacks: rollbackCount > 0 ? rollbackCount : undefined,
      avg_quality_score: avgQualityScore
    },
    summaries,
    index_path: indexPath,
    timeline_path: timelinePath
  };
  
  // Store idempotency record (even for dry-run to prevent duplicate processing)
  if (!dryRun) {
    idempotency.storeResult(idempKey, result);
    logger.info('Idempotency record stored', { key: idempKey.key.slice(0, 12) + '...' });
  }
  
  // Cleanup old idempotency records (TTL: 24 hours)
  const cleaned = idempotency.cleanup(24);
  if (cleaned > 0) {
    logger.debug('Cleaned up old idempotency records', { count: cleaned });
  }
  
  logger.info('Session compression complete', {
    processed: summaries.length,
    written: result.report.written,
    total_cost: result.report.total_cost,
    avg_quality: result.report.avg_quality_score
  });
  
  // Emit metrics
  const latency = Date.now() - startTime;
  metrics.recordLatency(latency, tier, 'compress_session');
  if (totalTokens > 0) {
    metrics.recordTokensSaved(totalTokens, tier, input.tenant_id);
  }
  if (totalCost > 0) {
    metrics.recordCost(totalCost, tier, input.tenant_id);
  }
  if (avgQualityScore !== undefined) {
    metrics.recordQualityScore(avgQualityScore, tier, input.tenant_id);
  }
  if (rollbackCount > 0) {
    metrics.recordRougeFallback(input.compression_tier || 'T0', tier, input.tenant_id);
  }
  metrics.recordWrites(dryRun ? 0 : summaries.length, input.tenant_id);
  
  // Emit observability data
  await metrics.emit();
  await tracer.emit();
  
  return result;
  } catch (error) {
    // End span with error
    tracer.endSpan(rootSpan, error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    // End span on success
    tracer.endSpan(rootSpan);
  }
}
