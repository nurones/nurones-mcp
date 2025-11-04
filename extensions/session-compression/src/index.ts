/**
 * Session Compression Tool - Main Entry Point
 * Path A: Minimal viable implementation
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
  } else {
    throw new Error(`Unsupported source kind: ${(source as any).kind}`);
  }
  
  // Parse timestamp
  const timestamp = parseTimestamp(content, filepath, options.timezone);
  
  // Generate session ID
  const sessionId = generateSessionId(content, filepath);
  
  // Compress content
  const compressed = compressDigest(content, {
    charLimit: options.charLimit,
    preserveMarkup: options.preserveMarkup
  });
  
  // Format final digest
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
    tier_used: 'extractive',
    inferred_timestamp_source: timestamp.source,
    char_count: compressed.charCount
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
 * Main compression function
 */
export async function compressSession(input: CompressInputV1): Promise<CompressOutputV1> {
  const outputDir = input.output_dir || DEFAULT_OUTPUT_DIR;
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const preserveMarkup = input.preserve_markup ?? false;
  const dryRun = input.dry_run ?? false;
  
  // Process all sources
  const summaries: SessionDigest[] = [];
  
  for (const source of input.sources) {
    const summary = await processSource(source, {
      charLimit: input.char_limit,
      preserveMarkup,
      timezone,
      outputDir,
      dryRun
    });
    summaries.push(summary);
  }
  
  // Build index and timeline
  const indexPath = buildIndex(summaries, outputDir, dryRun);
  const timelinePath = buildTimeline(summaries, outputDir, dryRun);
  
  return {
    report: {
      processed: summaries.length,
      written: dryRun ? 0 : summaries.length,
      dry_run: dryRun,
      timeline_updated: !dryRun
    },
    summaries,
    index_path: indexPath,
    timeline_path: timelinePath
  };
}
