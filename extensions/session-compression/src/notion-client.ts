import { Client } from '@notionhq/client';

export interface NotionConfig {
  bearerToken?: string;
  fetchMode?: 'html' | 'markdown' | 'plaintext';
}

export interface NotionPage {
  content: string;
  title: string;
  url: string;
  lastModified: string;
}

export class NotionFetcher {
  private client: Client | null = null;
  private config: NotionConfig;

  constructor(config?: NotionConfig) {
    this.config = config || {};
    
    const token = this.config.bearerToken || process.env.NOTION_API_KEY;
    if (token) {
      this.client = new Client({ auth: token });
    }
  }

  /**
   * Fetch page content from Notion
   */
  async fetchPage(pageId: string): Promise<NotionPage> {
    if (!this.client) {
      throw new Error('Notion client not initialized. Set bearerToken or NOTION_API_KEY.');
    }

    // Get page metadata
    const page = await this.client.pages.retrieve({ page_id: pageId }) as any;
    
    // Get page blocks
    const blocks = await this.client.blocks.children.list({
      block_id: pageId,
      page_size: 100
    });

    const content = this.blocksToText(blocks.results);
    const title = this.extractTitle(page);
    const lastModified = page.last_edited_time || new Date().toISOString();

    return {
      content,
      title,
      url: `https://notion.so/${pageId.replace(/-/g, '')}`,
      lastModified
    };
  }

  /**
   * Extract title from page properties
   */
  private extractTitle(page: any): string {
    const properties = page.properties || {};
    const titleProp = Object.values(properties).find((p: any) => p.type === 'title') as any;
    
    if (titleProp && titleProp.title && titleProp.title.length > 0) {
      return titleProp.title.map((t: any) => t.plain_text).join('');
    }
    
    return 'Untitled';
  }

  /**
   * Convert Notion blocks to plain text
   */
  private blocksToText(blocks: any[]): string {
    const lines: string[] = [];

    for (const block of blocks) {
      const text = this.blockToText(block);
      if (text) {
        lines.push(text);
      }
    }

    return lines.join('\n\n');
  }

  /**
   * Convert single block to text
   */
  private blockToText(block: any): string {
    const type = block.type;
    
    switch (type) {
      case 'paragraph':
        return this.richTextToPlain(block.paragraph?.rich_text || []);
      
      case 'heading_1':
        return `# ${this.richTextToPlain(block.heading_1?.rich_text || [])}`;
      
      case 'heading_2':
        return `## ${this.richTextToPlain(block.heading_2?.rich_text || [])}`;
      
      case 'heading_3':
        return `### ${this.richTextToPlain(block.heading_3?.rich_text || [])}`;
      
      case 'bulleted_list_item':
        return `- ${this.richTextToPlain(block.bulleted_list_item?.rich_text || [])}`;
      
      case 'numbered_list_item':
        return `1. ${this.richTextToPlain(block.numbered_list_item?.rich_text || [])}`;
      
      case 'code':
        const code = this.richTextToPlain(block.code?.rich_text || []);
        return `\`\`\`\n${code}\n\`\`\``;
      
      case 'quote':
        return `> ${this.richTextToPlain(block.quote?.rich_text || [])}`;
      
      default:
        return '';
    }
  }

  /**
   * Convert rich text array to plain text
   */
  private richTextToPlain(richText: any[]): string {
    return richText.map(rt => rt.plain_text || '').join('');
  }

  /**
   * Extract page ID from Notion URL
   */
  static extractPageId(url: string): string {
    // https://www.notion.so/Page-Title-abc123def456...
    // or https://notion.so/abc123def456...
    const match = url.match(/([a-f0-9]{32})/);
    if (!match) {
      throw new Error(`Invalid Notion URL: ${url}`);
    }
    
    const id = match[1];
    // Format as UUID: abc123de-f456-...
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }

  /**
   * Check if Notion client is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
}
