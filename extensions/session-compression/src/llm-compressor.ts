import OpenAI from 'openai';

export type CompressionTier = 'T0' | 'T1' | 'T2' | 'T3';

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  apiKey?: string;
  tiers: {
    [K in CompressionTier]?: {
      model: string;
      maxTokens: number;
      temperature?: number;
    };
  };
}

export interface LLMCompressionResult {
  summary: string;
  tier: CompressionTier;
  tokensUsed: number;
  model: string;
  cost?: number;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'openai',
  tiers: {
    T1: { model: 'gpt-4o-mini', maxTokens: 1000, temperature: 0.3 },
    T2: { model: 'gpt-4o', maxTokens: 2000, temperature: 0.3 },
    T3: { model: 'gpt-4o', maxTokens: 4000, temperature: 0.2 }
  }
};

export class LLMCompressor {
  private client: OpenAI | null = null;
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize OpenAI client if API key is available
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (apiKey && this.config.provider === 'openai') {
      this.client = new OpenAI({ apiKey });
    }
  }

  /**
   * Compress content using specified tier
   */
  async compress(
    content: string,
    tier: CompressionTier,
    charLimit: number
  ): Promise<LLMCompressionResult> {
    if (tier === 'T0') {
      // T0 is extractive - no LLM needed
      return {
        summary: content.slice(0, charLimit),
        tier: 'T0',
        tokensUsed: 0,
        model: 'extractive'
      };
    }

    if (!this.client) {
      throw new Error('LLM client not initialized. Set OPENAI_API_KEY environment variable.');
    }

    const tierConfig = this.config.tiers[tier];
    if (!tierConfig) {
      throw new Error(`No configuration for tier ${tier}`);
    }

    const prompt = this.buildPrompt(content, tier, charLimit);
    
    const response = await this.client.chat.completions.create({
      model: tierConfig.model,
      messages: [
        { role: 'system', content: this.getSystemPrompt(tier) },
        { role: 'user', content: prompt }
      ],
      max_tokens: tierConfig.maxTokens,
      temperature: tierConfig.temperature || 0.3
    });

    const summary = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    return {
      summary,
      tier,
      tokensUsed,
      model: tierConfig.model,
      cost: this.estimateCost(tierConfig.model, tokensUsed)
    };
  }

  /**
   * Build compression prompt based on tier
   */
  private buildPrompt(content: string, tier: CompressionTier, charLimit: number): string {
    switch (tier) {
      case 'T1':
        return `Summarize the following session content to approximately ${charLimit} characters. Focus on key points and main topics. Preserve important details.\n\nContent:\n${content}`;
      
      case 'T2':
        return `Create an abstractive summary of the following session content (target: ${charLimit} chars). Preserve context, key decisions, and action items. Use natural, flowing prose.\n\nContent:\n${content}`;
      
      case 'T3':
        return `Analyze the following session and create a structured summary (target: ${charLimit} chars) with:
1. Key entities (people, systems, concepts)
2. Relationships and interactions
3. Decisions and action items
4. Important context

Content:
${content}`;
      
      default:
        return content;
    }
  }

  /**
   * Get system prompt for tier
   */
  private getSystemPrompt(tier: CompressionTier): string {
    switch (tier) {
      case 'T1':
        return 'You are a session summarizer. Create concise, keyword-focused summaries that preserve the most important information.';
      
      case 'T2':
        return 'You are an expert session analyst. Create flowing, abstractive summaries that capture context, decisions, and key insights while maintaining readability.';
      
      case 'T3':
        return 'You are an advanced session analyzer. Extract entities, relationships, and structure from conversations. Create summaries that reveal patterns and connections.';
      
      default:
        return 'You are a helpful assistant.';
    }
  }

  /**
   * Estimate cost based on model and tokens (approximate)
   */
  private estimateCost(model: string, tokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
      'gpt-4o': { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
      'gpt-4-turbo': { input: 10 / 1_000_000, output: 30 / 1_000_000 }
    };

    const rates = pricing[model] || pricing['gpt-4o-mini'];
    // Rough estimate: assume 70% input, 30% output
    return (tokens * 0.7 * rates.input) + (tokens * 0.3 * rates.output);
  }

  /**
   * Check if LLM is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
}
