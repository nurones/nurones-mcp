/**
 * OpenTelemetry-compatible distributed tracing
 */

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  status: 'ok' | 'error';
  errorMessage?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export class Tracer {
  private spans: Span[] = [];
  private activeSpan: Span | null = null;

  /**
   * Start a new root span
   */
  startSpan(name: string, attributes: Record<string, any> = {}): Span {
    const span: Span = {
      traceId: this.generateId(),
      spanId: this.generateId(),
      parentSpanId: this.activeSpan?.spanId,
      name,
      startTime: Date.now(),
      attributes: this.sanitizeAttributes(attributes),
      events: [],
      status: 'ok'
    };

    this.spans.push(span);
    this.activeSpan = span;

    return span;
  }

  /**
   * End the current span
   */
  endSpan(span: Span, error?: Error): void {
    span.endTime = Date.now();

    if (error) {
      span.status = 'error';
      span.errorMessage = error.message;
      span.attributes.error = true;
      span.attributes.error_type = error.name;
    }

    // Pop back to parent
    if (span.parentSpanId) {
      this.activeSpan = this.spans.find(s => s.spanId === span.parentSpanId) || null;
    } else {
      this.activeSpan = null;
    }
  }

  /**
   * Add event to current span
   */
  addEvent(name: string, attributes?: Record<string, any>): void {
    if (this.activeSpan) {
      this.activeSpan.events.push({
        name,
        timestamp: Date.now(),
        attributes: attributes ? this.sanitizeAttributes(attributes) : undefined
      });
    }
  }

  /**
   * Set attribute on current span
   */
  setAttribute(key: string, value: string | number | boolean): void {
    if (this.activeSpan) {
      this.activeSpan.attributes[key] = value;
    }
  }

  /**
   * Export traces in JSON format
   */
  export(): string {
    return JSON.stringify({
      resourceSpans: [{
        resource: {
          attributes: {
            'service.name': 'session-compression',
            'service.version': '1.0.0'
          }
        },
        scopeSpans: [{
          scope: {
            name: 'nurones.mcp.session-compression'
          },
          spans: this.spans.map(span => ({
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            name: span.name,
            kind: 'SPAN_KIND_INTERNAL',
            startTimeUnixNano: span.startTime * 1000000,
            endTimeUnixNano: (span.endTime || Date.now()) * 1000000,
            attributes: Object.entries(span.attributes).map(([key, value]) => ({
              key,
              value: { [this.getValueType(value)]: value }
            })),
            events: span.events.map(event => ({
              name: event.name,
              timeUnixNano: event.timestamp * 1000000,
              attributes: event.attributes ? Object.entries(event.attributes).map(([key, value]) => ({
                key,
                value: { [this.getValueType(value)]: value }
              })) : []
            })),
            status: {
              code: span.status === 'ok' ? 1 : 2,
              message: span.errorMessage
            }
          }))
        }]
      }]
    }, null, 2);
  }

  /**
   * Emit traces to OpenTelemetry collector
   */
  async emit(collectorEndpoint?: string): Promise<void> {
    const tracesData = this.export();

    if (collectorEndpoint) {
      try {
        await fetch(collectorEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: tracesData
        });
      } catch (error) {
        console.error('Failed to emit traces:', error);
      }
    }

    // Log for local observability
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Traces emitted',
      trace_count: this.spans.length,
      root_traces: this.spans.filter(s => !s.parentSpanId).length
    }));
  }

  /**
   * Clear all spans
   */
  clear(): void {
    this.spans = [];
    this.activeSpan = null;
  }

  /**
   * Generate trace/span ID
   */
  private generateId(): string {
    return Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');
  }

  /**
   * Sanitize attributes to primitive types
   */
  private sanitizeAttributes(attrs: Record<string, any>): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (value !== null && value !== undefined) {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  /**
   * Get OpenTelemetry value type
   */
  private getValueType(value: string | number | boolean): string {
    if (typeof value === 'string') return 'stringValue';
    if (typeof value === 'number') return Number.isInteger(value) ? 'intValue' : 'doubleValue';
    if (typeof value === 'boolean') return 'boolValue';
    return 'stringValue';
  }
}

// Global tracer instance
export const tracer = new Tracer();
