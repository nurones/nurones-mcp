import { CompressionTier } from './llm-compressor';

export interface QualityScore {
  rougeL: number;
  tier: CompressionTier;
  passed: boolean;
  threshold: number;
}

export interface QualityConfig {
  thresholds: {
    [K in CompressionTier]?: number;
  };
  autoRollback: boolean;
  fallbackTier: CompressionTier;
}

const DEFAULT_CONFIG: QualityConfig = {
  thresholds: {
    T1: 0.85,
    T2: 0.70,
    T3: 0.60
  },
  autoRollback: true,
  fallbackTier: 'T0'
};

export class QualityScorer {
  private config: QualityConfig;

  constructor(config?: Partial<QualityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate ROUGE-L score (Longest Common Subsequence based)
   */
  calculateRougeL(reference: string, summary: string): number {
    const refTokens = this.tokenize(reference);
    const sumTokens = this.tokenize(summary);

    if (refTokens.length === 0 || sumTokens.length === 0) {
      return 0;
    }

    const lcsLength = this.lcs(refTokens, sumTokens);
    
    const precision = lcsLength / sumTokens.length;
    const recall = lcsLength / refTokens.length;

    if (precision + recall === 0) {
      return 0;
    }

    // F1 score
    const fScore = (2 * precision * recall) / (precision + recall);
    return fScore;
  }

  /**
   * Score a compression result against original
   */
  score(original: string, summary: string, tier: CompressionTier): QualityScore {
    const rougeL = this.calculateRougeL(original, summary);
    const threshold = this.config.thresholds[tier] || 0.5;
    const passed = rougeL >= threshold;

    return {
      rougeL,
      tier,
      passed,
      threshold
    };
  }

  /**
   * Determine if rollback is needed
   */
  shouldRollback(score: QualityScore): boolean {
    return this.config.autoRollback && !score.passed;
  }

  /**
   * Get fallback tier
   */
  getFallbackTier(): CompressionTier {
    return this.config.fallbackTier;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * Calculate Longest Common Subsequence length
   */
  private lcs(seq1: string[], seq2: string[]): number {
    const m = seq1.length;
    const n = seq2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (seq1[i - 1] === seq2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Get quality assessment message
   */
  getAssessment(score: QualityScore): string {
    const percentage = (score.rougeL * 100).toFixed(1);
    const status = score.passed ? 'PASS' : 'FAIL';
    return `ROUGE-L: ${percentage}% (${status}, threshold: ${(score.threshold * 100).toFixed(0)}%)`;
  }
}
