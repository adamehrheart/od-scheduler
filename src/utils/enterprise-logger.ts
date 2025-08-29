/**
 * Enterprise Logger Service
 *
 * Provides structured, enterprise-grade logging for the Open Dealer scheduler service.
 * Replaces all console.log usage with proper structured logging that includes
 * correlation IDs, timestamps, and contextual metadata.
 *
 * @package od-scheduler
 * @version 1.0.0 - Enterprise Logging Implementation
 */

interface LogContext {
  /** Unique identifier for request correlation */
  correlationId?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** User ID if available */
  userId?: string;
  /** Dealer ID for business context */
  dealerId?: string;
  /** Job ID for job-related logs */
  jobId?: string;
  /** Operation being performed */
  operation?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  service: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Enterprise Logger Class
 *
 * Provides structured logging with correlation IDs, proper error handling,
 * and contextual metadata for enterprise-grade observability.
 */
class EnterpriseLogger {
  private serviceName: string;
  private environment: string;

  constructor(serviceName: string = 'od-scheduler') {
    this.serviceName = serviceName;
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Create structured log entry
   *
   * @param level - Log level (info, warn, error, debug)
   * @param message - Human-readable log message
   * @param context - Additional context and metadata
   * @param error - Error object if applicable
   */
  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      context
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    return logEntry;
  }

  /**
   * Output log entry to appropriate destination
   *
   * In development: Pretty-printed to console
   * In production: JSON format for log aggregation
   *
   * @param logEntry - Structured log entry
   */
  private outputLogEntry(logEntry: LogEntry): void {
    if (this.environment === 'development') {
      // Pretty format for development
      const timestamp = logEntry.timestamp;
      const level = logEntry.level.toUpperCase().padEnd(5);
      const service = `[${logEntry.service}]`;
      const context = logEntry.context ?
        ` | ${Object.entries(logEntry.context).map(([key, value]) => `${key}=${value}`).join(' ')}` : '';

      console.log(`${timestamp} ${level} ${service} ${logEntry.message}${context}`);

      if (logEntry.error) {
        console.log(`  ↳ Error: ${logEntry.error.name}: ${logEntry.error.message}`);
        if (logEntry.error.stack) {
          console.log(`    ${logEntry.error.stack}`);
        }
      }
    } else {
      // JSON format for production log aggregation
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Log informational message
   *
   * @param message - Human-readable message describing the operation
   * @param context - Additional context and metadata
   *
   * @example
   * ```typescript
   * logger.logInfo('Job processing started', {
   *   jobId: 'job-123',
   *   dealerId: 'dealer-456',
   *   correlationId: 'req-789'
   * });
   * ```
   */
  public logInfo(message: string, context?: LogContext): void {
    const logEntry = this.createLogEntry('info', message, context);
    this.outputLogEntry(logEntry);
  }

  /**
   * Log warning message
   *
   * @param message - Human-readable warning message
   * @param context - Additional context and metadata
   *
   * @example
   * ```typescript
   * logger.logWarning('Job retry attempt', {
   *   jobId: 'job-123',
   *   retryAttempt: 2,
   *   maxRetries: 3
   * });
   * ```
   */
  public logWarning(message: string, context?: LogContext): void {
    const logEntry = this.createLogEntry('warn', message, context);
    this.outputLogEntry(logEntry);
  }

  /**
   * Log error message with structured error details
   *
   * @param message - Human-readable error description
   * @param error - Error object with stack trace
   * @param context - Additional context and metadata
   *
   * @example
   * ```typescript
   * logger.logError('Database connection failed', databaseError, {
   *   operation: 'job-creation',
   *   dealerId: 'dealer-123',
   *   correlationId: 'req-456'
   * });
   * ```
   */
  public logError(message: string, error: Error, context?: LogContext): void {
    const logEntry = this.createLogEntry('error', message, context, error);
    this.outputLogEntry(logEntry);
  }

  /**
   * Log debug message (only output in development)
   *
   * @param message - Debug message
   * @param context - Additional context and metadata
   */
  public logDebug(message: string, context?: LogContext): void {
    if (this.environment === 'development') {
      const logEntry = this.createLogEntry('debug', message, context);
      this.outputLogEntry(logEntry);
    }
  }

  /**
   * Create child logger with pre-filled context
   *
   * Useful for maintaining correlation IDs and context throughout
   * a request lifecycle without manually passing context each time.
   *
   * @param baseContext - Context to include in all log entries
   * @returns New logger instance with pre-filled context
   *
   * @example
   * ```typescript
   * const requestLogger = logger.withContext({
   *   correlationId: 'req-123',
   *   userId: 'user-456'
   * });
   *
   * requestLogger.logInfo('Processing started'); // Includes correlation ID
   * ```
   */
  public withContext(baseContext: LogContext): EnterpriseLogger {
    const childLogger = new EnterpriseLogger(this.serviceName);

    // Override logging methods to include base context
    const originalLogInfo = childLogger.logInfo.bind(childLogger);
    const originalLogWarning = childLogger.logWarning.bind(childLogger);
    const originalLogError = childLogger.logError.bind(childLogger);
    const originalLogDebug = childLogger.logDebug.bind(childLogger);

    childLogger.logInfo = (message: string, context?: LogContext) => {
      originalLogInfo(message, { ...baseContext, ...context });
    };

    childLogger.logWarning = (message: string, context?: LogContext) => {
      originalLogWarning(message, { ...baseContext, ...context });
    };

    childLogger.logError = (message: string, error: Error, context?: LogContext) => {
      originalLogError(message, error, { ...baseContext, ...context });
    };

    childLogger.logDebug = (message: string, context?: LogContext) => {
      originalLogDebug(message, { ...baseContext, ...context });
    };

    return childLogger;
  }
}

// Export singleton instance
export const enterpriseLogger = new EnterpriseLogger('od-scheduler');

// Export class for creating child loggers with specific contexts
export { EnterpriseLogger };

// Export types for use in other modules
export type { LogContext, LogEntry };
