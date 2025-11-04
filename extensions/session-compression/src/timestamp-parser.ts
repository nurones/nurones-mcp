/**
 * Timestamp Parser - 4-step priority
 * 1. Front-matter (YAML)
 * 2. Inline timestamps
 * 3. Filename patterns
 * 4. File mtime
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { format, parseISO } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';

export type TimestampSource = 'front_matter' | 'inline' | 'filename' | 'mtime';

export interface ParsedTimestamp {
  utc: string;
  adelaide: string;
  source: TimestampSource;
}

const ADELAIDE_TZ = 'Australia/Adelaide';

/**
 * Parse front-matter from markdown content
 */
function parseFrontMatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return null;
  
  try {
    return yaml.load(match[1]) as Record<string, any>;
  } catch {
    return null;
  }
}

/**
 * Extract timestamp from front-matter
 */
function extractFromFrontMatter(content: string): Date | null {
  const frontMatter = parseFrontMatter(content);
  if (!frontMatter) return null;
  
  // Try common timestamp keys
  const keys = ['timestamp', 'date', 'created', 'session_timestamp', 'time'];
  for (const key of keys) {
    if (frontMatter[key]) {
      try {
        return new Date(frontMatter[key]);
      } catch {
        continue;
      }
    }
  }
  
  return null;
}

/**
 * Extract inline timestamps (ISO format or common patterns)
 */
function extractInlineTimestamp(content: string): Date | null {
  // ISO 8601 pattern
  const isoPattern = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)/;
  const match = content.match(isoPattern);
  
  if (match) {
    try {
      return new Date(match[1]);
    } catch {
      // Fall through
    }
  }
  
  // Date + time patterns (e.g., "2025-11-04 14:30:00")
  const dateTimePattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
  const dtMatch = content.match(dateTimePattern);
  
  if (dtMatch) {
    try {
      return new Date(dtMatch[1]);
    } catch {
      // Fall through
    }
  }
  
  return null;
}

/**
 * Extract timestamp from filename
 * Patterns: YYYYMMDD_*, YYYY-MM-DD_*, etc.
 */
function extractFromFilename(filename: string): Date | null {
  // YYYYMMDD pattern
  const yyyymmdd = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (yyyymmdd) {
    try {
      const [, year, month, day] = yyyymmdd;
      return new Date(`${year}-${month}-${day}`);
    } catch {
      // Fall through
    }
  }
  
  // YYYY-MM-DD pattern
  const dashedDate = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (dashedDate) {
    try {
      return new Date(dashedDate[1]);
    } catch {
      // Fall through
    }
  }
  
  return null;
}

/**
 * Get file modification time
 */
function getFileMtime(filepath: string): Date {
  const stats = fs.statSync(filepath);
  return stats.mtime;
}

/**
 * Parse timestamp with 4-step priority
 */
export function parseTimestamp(
  content: string,
  filepath?: string,
  timezone: string = ADELAIDE_TZ
): ParsedTimestamp {
  let date: Date | null = null;
  let source: TimestampSource = 'mtime';
  
  // Step 1: Front-matter
  date = extractFromFrontMatter(content);
  if (date && !isNaN(date.getTime())) {
    source = 'front_matter';
  }
  
  // Step 2: Inline timestamps
  if (!date) {
    date = extractInlineTimestamp(content);
    if (date && !isNaN(date.getTime())) {
      source = 'inline';
    }
  }
  
  // Step 3: Filename
  if (!date && filepath) {
    const filename = filepath.split('/').pop() || '';
    date = extractFromFilename(filename);
    if (date && !isNaN(date.getTime())) {
      source = 'filename';
    }
  }
  
  // Step 4: File mtime
  if (!date && filepath) {
    date = getFileMtime(filepath);
    source = 'mtime';
  }
  
  // Fallback to now if all else fails
  if (!date || isNaN(date.getTime())) {
    date = new Date();
    source = 'mtime';
  }
  
  // Convert to UTC and Adelaide time
  const utc = date.toISOString();
  const adelaide = formatInTimeZone(date, ADELAIDE_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  
  return { utc, adelaide, source };
}

/**
 * Generate session ID from content
 */
export function generateSessionId(content: string, filepath?: string): string {
  // Use filename if available
  if (filepath) {
    const filename = filepath.split('/').pop() || '';
    const base = filename.replace(/\.(md|txt)$/, '');
    return base.replace(/[^a-zA-Z0-9-_]/g, '_');
  }
  
  // Otherwise hash first 64 chars
  const preview = content.slice(0, 64).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_]/g, '');
  return `session_${preview.slice(0, 32)}`;
}
