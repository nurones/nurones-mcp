/**
 * Structured logger for production-grade logging
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogContext {
  reason_trace_id?: string;
  tenant_id?: string;
  session_id?: string;
  tier?: string;
  [key: string]: any;
}

export class Logger {
  private minLevel: LogLevel;
  private context: LogContext;

  constructor(context: LogContext = {}, minLevel: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.minLevel = minLevel;
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error | any, data?: any): void {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, ...data }
      : { error, ...data };
    this.log(LogLevel.ERROR, message, errorData);
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (this.shouldLog(level)) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...this.context,
        ...data
      };

      const output = JSON.stringify(logEntry);

      switch (level) {
        case LogLevel.ERROR:
          console.error(output);
          break;
        case LogLevel.WARN:
          console.warn(output);
          break;
        default:
          console.log(output);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger(
      { ...this.context, ...additionalContext },
      this.minLevel
    );
  }
}

// Global logger instance
export const logger = new Logger({}, LogLevel.INFO);
