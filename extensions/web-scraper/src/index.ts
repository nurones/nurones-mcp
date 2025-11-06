/**
 * MCP Extension: Web Scraper
 * Ultimate web scraping tool with crawling, parsing, and extraction
 */

import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ScrapeUrlInput {
  url: string;
  selectors?: Record<string, string>;
  headers?: Record<string, string>;
  userAgent?: string;
  timeout?: number;
  format?: 'json' | 'html' | 'text';
  outputDir?: string;
}

export interface ScrapeSiteInput {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  sameDomain?: boolean;
  selectors?: Record<string, string>;
  rateLimit?: number;
  concurrency?: number;
  respectRobots?: boolean;
  outputDir?: string;
}

export interface ParseHtmlInput {
  html: string;
  selectors: Record<string, string>;
}

export interface ExtractLinksInput {
  url: string;
  html?: string;
  includeExternal?: boolean;
  filter?: string;
}

export interface ToolOutput {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    timestamp: string;
    idempotencyKey: string;
    duration: number;
  };
}

/**
 * Generate idempotency key for safe retries
 */
function generateIdempotencyKey(input: any): string {
  const normalized = JSON.stringify(input, Object.keys(input).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Scrape single URL
 */
export async function scrapeUrl(input: ScrapeUrlInput): Promise<ToolOutput> {
  const startTime = Date.now();
  const idempotencyKey = generateIdempotencyKey(input);

  try {
    const headers = {
      'User-Agent': input.userAgent || 'Mozilla/5.0 (compatible; NuronesMCP-Scraper/1.0)',
      ...input.headers,
    };

    const response = await fetch(input.url, {
      headers,
      timeout: input.timeout || 30000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let data: any = {};

    if (input.selectors) {
      // Extract data using selectors
      for (const [key, selector] of Object.entries(input.selectors)) {
        const elements = $(selector);
        if (elements.length === 1) {
          data[key] = elements.text().trim();
        } else if (elements.length > 1) {
          data[key] = elements.map((i, el) => $(el).text().trim()).get();
        }
      }
    } else {
      // Return based on format
      switch (input.format) {
        case 'text':
          data = { text: $('body').text().trim() };
          break;
        case 'html':
          data = { html };
          break;
        default:
          data = {
            title: $('title').text().trim(),
            headings: $('h1, h2, h3').map((i, el) => $(el).text().trim()).get(),
            paragraphs: $('p').map((i, el) => $(el).text().trim()).get().slice(0, 10),
            links: $('a[href]').map((i, el) => $(el).attr('href')).get().slice(0, 20),
          };
      }
    }

    // Save to file if outputDir specified
    if (input.outputDir) {
      const filename = `${crypto.createHash('md5').update(input.url).digest('hex')}.json`;
      const filepath = path.join(input.outputDir, filename);
      await fs.mkdir(input.outputDir, { recursive: true });
      await fs.writeFile(filepath, JSON.stringify({ url: input.url, data, timestamp: new Date().toISOString() }, null, 2));
    }

    return {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Crawl entire site
 */
export async function scrapeSite(input: ScrapeSiteInput): Promise<ToolOutput> {
  const startTime = Date.now();
  const idempotencyKey = generateIdempotencyKey(input);

  try {
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [{ url: input.startUrl, depth: 0 }];
    const results: any[] = [];
    const maxPages = input.maxPages || 50;
    const maxDepth = input.maxDepth || 3;
    const rateLimit = input.rateLimit || 1000;

    const baseDomain = new URL(input.startUrl).hostname;

    while (queue.length > 0 && results.length < maxPages) {
      const { url, depth } = queue.shift()!;

      if (visited.has(url) || depth > maxDepth) continue;
      visited.add(url);

      // Rate limiting
      if (results.length > 0) {
        await new Promise(resolve => setTimeout(resolve, rateLimit));
      }

      const scrapeResult = await scrapeUrl({
        url,
        selectors: input.selectors,
        format: 'json',
      });

      if (scrapeResult.success) {
        results.push({
          url,
          depth,
          data: scrapeResult.data,
        });

        // Extract and queue new links
        const linksResult = await extractLinks({ url, includeExternal: !input.sameDomain });
        if (linksResult.success && linksResult.data?.links) {
          for (const link of linksResult.data.links) {
            try {
              const linkUrl = new URL(link, url).href;
              const linkDomain = new URL(linkUrl).hostname;
              
              if (!input.sameDomain || linkDomain === baseDomain) {
                if (!visited.has(linkUrl)) {
                  queue.push({ url: linkUrl, depth: depth + 1 });
                }
              }
            } catch (e) {
              // Invalid URL, skip
            }
          }
        }
      }
    }

    // Save crawl results
    if (input.outputDir) {
      const filename = `crawl-${crypto.createHash('md5').update(input.startUrl).digest('hex')}.json`;
      const filepath = path.join(input.outputDir, filename);
      await fs.mkdir(input.outputDir, { recursive: true });
      await fs.writeFile(filepath, JSON.stringify({
        startUrl: input.startUrl,
        pagesScraped: results.length,
        results,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }

    return {
      success: true,
      data: {
        pagesScraped: results.length,
        results,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Parse HTML with selectors
 */
export async function parseHtml(input: ParseHtmlInput): Promise<ToolOutput> {
  const startTime = Date.now();
  const idempotencyKey = generateIdempotencyKey(input);

  try {
    const $ = cheerio.load(input.html);
    const data: Record<string, any> = {};

    for (const [key, selector] of Object.entries(input.selectors)) {
      const elements = $(selector);
      if (elements.length === 1) {
        data[key] = elements.text().trim();
      } else if (elements.length > 1) {
        data[key] = elements.map((i, el) => $(el).text().trim()).get();
      } else {
        data[key] = null;
      }
    }

    return {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Extract all links from URL or HTML
 */
export async function extractLinks(input: ExtractLinksInput): Promise<ToolOutput> {
  const startTime = Date.now();
  const idempotencyKey = generateIdempotencyKey(input);

  try {
    let html = input.html;

    if (!html && input.url) {
      const response = await fetch(input.url);
      html = await response.text();
    }

    if (!html) {
      throw new Error('Either url or html must be provided');
    }

    const $ = cheerio.load(html);
    const links = $('a[href]')
      .map((i, el) => $(el).attr('href'))
      .get()
      .filter((href): href is string => !!href);

    let filteredLinks = links;

    if (!input.includeExternal && input.url) {
      const baseDomain = new URL(input.url).hostname;
      filteredLinks = links.filter(link => {
        try {
          const linkUrl = new URL(link, input.url);
          return linkUrl.hostname === baseDomain;
        } catch {
          return false;
        }
      });
    }

    if (input.filter) {
      const regex = new RegExp(input.filter);
      filteredLinks = filteredLinks.filter(link => regex.test(link));
    }

    return {
      success: true,
      data: {
        totalLinks: links.length,
        filteredLinks: filteredLinks.length,
        links: filteredLinks,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: new Date().toISOString(),
        idempotencyKey,
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Main extension entry point
 */
export async function initialize(): Promise<void> {
  console.log('Extension web-scraper initialized');
}

/**
 * Route tool execution to appropriate handler
 */
export async function executeTool(toolName: string, input: any): Promise<ToolOutput> {
  switch (toolName) {
    case 'scrape.url':
      return scrapeUrl(input);
    case 'scrape.site':
      return scrapeSite(input);
    case 'parse.html':
      return parseHtml(input);
    case 'extract.links':
      return extractLinks(input);
    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
  }
}
