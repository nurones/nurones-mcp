/**
 * Digest Compressor - Character limit enforcement with header preservation
 */

import * as crypto from 'crypto';

export interface CompressionOptions {
  charLimit: number;
  preserveMarkup: boolean;
}

export interface CompressedDigest {
  digest: string;
  charCount: number;
  sha256: string;
  headerPreserved: boolean;
}

/**
 * Extract header section (lines before first blank line or ### marker)
 */
function extractHeader(content: string): { header: string; body: string } {
  const lines = content.split('\n');
  let headerEndIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // End header at first blank line or ### marker
    if (line === '' || line.startsWith('###')) {
      headerEndIndex = i;
      break;
    }
  }
  
  if (headerEndIndex === 0) {
    return { header: '', body: content };
  }
  
  const header = lines.slice(0, headerEndIndex).join('\n');
  const body = lines.slice(headerEndIndex).join('\n');
  
  return { header, body };
}

/**
 * Strip markdown if requested
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')      // Headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1')     // Italic
    .replace(/`([^`]+)`/g, '$1')       // Inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/^[-*+]\s+/gm, '')        // List markers
    .trim();
}

/**
 * Compress content to character limit while preserving header
 */
export function compressDigest(
  content: string,
  options: CompressionOptions
): CompressedDigest {
  const { charLimit, preserveMarkup } = options;
  
  // Extract header
  const { header, body } = extractHeader(content);
  
  // Process body
  let processedBody = body.trim();
  if (!preserveMarkup) {
    processedBody = stripMarkdown(processedBody);
  }
  
  // Calculate available space for body
  const headerLength = header.length;
  const availableForBody = charLimit - headerLength - 2; // -2 for newlines
  
  // Trim body if needed
  if (processedBody.length > availableForBody) {
    processedBody = processedBody.slice(0, availableForBody).trim();
    // Try to end at sentence boundary
    const lastPeriod = processedBody.lastIndexOf('.');
    const lastNewline = processedBody.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);
    if (cutPoint > availableForBody * 0.8) {
      processedBody = processedBody.slice(0, cutPoint + 1);
    }
  }
  
  // Reconstruct digest
  const digest = header ? `${header}\n\n${processedBody}` : processedBody;
  const charCount = digest.length;
  
  // Generate SHA256
  const sha256 = crypto.createHash('sha256').update(digest).digest('hex');
  
  return {
    digest,
    charCount,
    sha256,
    headerPreserved: header.length > 0
  };
}

/**
 * Format session digest with metadata
 */
export function formatSessionDigest(
  sessionId: string,
  timestamp: { utc: string; adelaide: string; source: string },
  compressed: CompressedDigest
): string {
  const header = [
    `# Session Digest: ${sessionId}`,
    `**Timestamp (UTC):** ${timestamp.utc}`,
    `**Timestamp (Adelaide):** ${timestamp.adelaide}`,
    `**Source:** ${timestamp.source}`,
    `**Characters:** ${compressed.charCount}`,
    `**SHA256:** ${compressed.sha256}`,
    '',
    '---',
    ''
  ].join('\n');
  
  return header + compressed.digest;
}
