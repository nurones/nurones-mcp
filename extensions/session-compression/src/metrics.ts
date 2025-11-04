/**
 * Prometheus-compatible metrics for session compression
 * Metrics are emitted in OpenMetrics format
 */

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export class Metrics {
  private metrics: Map<string, MetricValue[]> = new Map();

  /**
   * Record tokens saved (compression ratio)
   */
  recordTokensSaved(tokensSaved: number, tier: string, tenantId: string): void {
    this.addMetric('session_tokens_saved', tokensSaved, {
      tier,
      tenant_id: tenantId
    });
  }

  /**
   * Record quality score (ROUGE-L)
   */
  recordQualityScore(score: number, tier: string, tenantId: string): void {
    this.addMetric('session_quality_score', score, {
      tier,
      tenant_id: tenantId
    });
  }

  /**
   * Record latency in milliseconds
   */
  recordLatency(latencyMs: number, tier: string, operation: string): void {
    this.addMetric('session_latency_ms', latencyMs, {
      tier,
      operation
    });
  }

  /**
   * Record character overflow trims
   */
  recordCharOverflow(trimmedChars: number, tier: string): void {
    this.addMetric('session_char_overflow_trims', trimmedChars, {
      tier
    });
  }

  /**
   * Record ROUGE-L fallback (quality-driven rollback)
   */
  recordRougeFallback(fromTier: string, toTier: string, tenantId: string): void {
    this.addMetric('session_rouge_fallbacks_total', 1, {
      from_tier: fromTier,
      to_tier: toTier,
      tenant_id: tenantId
    });
  }

  /**
   * Record filesystem writes
   */
  recordWrites(count: number, tenantId: string): void {
    this.addMetric('session_writes_count', count, {
      tenant_id: tenantId
    });
  }

  /**
   * Record cost in USD
   */
  recordCost(costUsd: number, tier: string, tenantId: string): void {
    this.addMetric('session_cost_usd', costUsd, {
      tier,
      tenant_id: tenantId
    });
  }

  /**
   * Add metric to collection
   */
  private addMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push({
      name,
      value,
      labels,
      timestamp: Date.now()
    });
  }

  /**
   * Export metrics in Prometheus OpenMetrics format
   */
  export(): string {
    const lines: string[] = [];

    for (const [name, values] of this.metrics.entries()) {
      // Add TYPE and HELP
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`# HELP ${name} Session compression metric`);

      // Add metric values
      for (const metric of values) {
        const labelStr = Object.entries(metric.labels || {})
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');

        const metricLine = labelStr
          ? `${name}{${labelStr}} ${metric.value} ${metric.timestamp}`
          : `${name} ${metric.value} ${metric.timestamp}`;

        lines.push(metricLine);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Emit metrics to MCP observability service
   */
  async emit(observabilityEndpoint?: string): Promise<void> {
    const metricsData = this.export();

    if (observabilityEndpoint) {
      try {
        await fetch(observabilityEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: metricsData
        });
      } catch (error) {
        console.error('Failed to emit metrics:', error);
      }
    }

    // Also log for local observability
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Metrics emitted',
      metrics: Array.from(this.metrics.entries()).map(([name, values]) => ({
        name,
        count: values.length,
        latest: values[values.length - 1]?.value
      }))
    }));
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }
}

// Global metrics instance
export const metrics = new Metrics();
