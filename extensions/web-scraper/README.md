# Web Scraper Extension

Ultimate web scraping tool for MCP with crawling, parsing, and extraction capabilities.

## Tools

### scrape.url
Scrape a single URL and extract data using CSS selectors.

**Input:**
```json
{
  "url": "https://example.com",
  "selectors": {
    "title": "h1",
    "description": "meta[name='description']",
    "content": "article p"
  },
  "format": "json",
  "outputDir": "/workspace/scrapes"
}
```

### scrape.site
Crawl and scrape an entire website.

**Input:**
```json
{
  "startUrl": "https://example.com",
  "maxPages": 100,
  "maxDepth": 3,
  "sameDomain": true,
  "rateLimit": 1000,
  "outputDir": "/workspace/crawls"
}
```

### parse.html
Parse HTML content with CSS selectors.

**Input:**
```json
{
  "html": "<html>...</html>",
  "selectors": {
    "heading": "h1",
    "links": "a[href]"
  }
}
```

### extract.links
Extract all links from a URL or HTML.

**Input:**
```json
{
  "url": "https://example.com",
  "includeExternal": false,
  "filter": "^/blog/"
}
```

## Development

Build: `npm run build`
Watch: `npm run dev`

## SDK Usage

```typescript
import { scrapeUrl, scrapeSite } from '@nurones/mcp-ext-web-scraper';

const result = await scrapeUrl({
  url: 'https://example.com',
  selectors: { title: 'h1' }
});
```
