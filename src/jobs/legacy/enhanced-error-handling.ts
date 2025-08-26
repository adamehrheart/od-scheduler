/**
 * Enhanced Error Handling for Job Queue System
 *
 * Provides robust error handling, retry logic, and circuit breaker patterns
 * for all job types in the Open Dealer scheduler.
 */

import { createSupabaseClientFromEnv } from '@adamehrheart/utils';

export interface ErrorHandlingConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeoutMs: number;
}

export interface JobError {
  type: 'retryable' | 'non_retryable' | 'circuit_breaker';
  message: string;
  originalError: any;
  retryAfterMs?: number;
}

export class EnhancedErrorHandler {
  private supabase = createSupabaseClientFromEnv();
  private circuitBreakerState: Map<string, { failures: number; lastFailure: number; open: boolean }> = new Map();

  private defaultConfig: ErrorHandlingConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeoutMs: 60000
  };

  /**
   * Analyze an error and determine the appropriate handling strategy
   */
  analyzeError(error: any, jobType: string, attempt: number): JobError {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorStr = errorMessage.toLowerCase();

    // Circuit breaker check
    const circuitBreakerKey = `${jobType}:${this.getErrorPattern(errorStr)}`;
    if (this.isCircuitBreakerOpen(circuitBreakerKey)) {
      return {
        type: 'circuit_breaker',
        message: `Circuit breaker open for ${jobType} - too many consecutive failures`,
        originalError: error
      };
    }

    // Determine if error is retryable
    if (this.isRetryableError(errorStr, jobType)) {
      const retryAfterMs = this.calculateRetryDelay(attempt);
      return {
        type: 'retryable',
        message: errorMessage,
        originalError: error,
        retryAfterMs
      };
    }

    return {
      type: 'non_retryable',
      message: errorMessage,
      originalError: error
    };
  }

  /**
   * Check if an error should trigger circuit breaker
   */
  private isCircuitBreakerError(errorStr: string, jobType: string): boolean {
    switch (jobType) {
      case 'url_shortening':
        return errorStr.includes('rate limit') || errorStr.includes('429') || errorStr.includes('403');
      case 'dealer_com_feed':
        return errorStr.includes('500') || errorStr.includes('503') || errorStr.includes('timeout');
      case 'product_detail_scraping':
        return errorStr.includes('timeout') || errorStr.includes('network') || errorStr.includes('econnreset');
      default:
        return errorStr.includes('500') || errorStr.includes('timeout') || errorStr.includes('network');
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(errorStr: string, jobType: string): boolean {
    // Network and timeout errors are always retryable
    if (errorStr.includes('timeout') || errorStr.includes('network') || errorStr.includes('econnreset')) {
      return true;
    }

    // Job-specific retryable errors
    switch (jobType) {
      case 'url_shortening':
        // Retry on rate limits, but not on validation errors
        return errorStr.includes('rate limit') || errorStr.includes('429') || errorStr.includes('temporary');

      case 'dealer_com_feed':
        // Retry on server errors, but not on authentication errors
        return errorStr.includes('500') || errorStr.includes('503') || errorStr.includes('temporary');

      case 'product_detail_scraping':
        // Retry on network issues, but not on data validation errors
        return errorStr.includes('timeout') || errorStr.includes('network') || errorStr.includes('econnreset');

      default:
        return errorStr.includes('500') || errorStr.includes('503') || errorStr.includes('temporary');
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.defaultConfig.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.defaultConfig.maxDelayMs);
  }

  /**
   * Extract error pattern for circuit breaker
   */
  private getErrorPattern(errorStr: string): string {
    if (errorStr.includes('rebrandly api error')) return 'rebrandly_api';
    if (errorStr.includes('dealer.com') && errorStr.includes('500')) return 'dealer_com_server';
    if (errorStr.includes('cannot read properties of undefined')) return 'undefined_property';
    if (errorStr.includes('timeout') || errorStr.includes('network')) return 'network_timeout';
    if (errorStr.includes('rate limit') || errorStr.includes('429')) return 'rate_limit';
    if (errorStr.includes('already exists')) return 'duplicate';
    if (errorStr.includes('invalid format')) return 'validation';

    return 'unknown';
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(key: string): boolean {
    const state = this.circuitBreakerState.get(key);
    if (!state) return false;

    if (state.open) {
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      if (timeSinceLastFailure > this.defaultConfig.circuitBreakerTimeoutMs) {
        // Reset circuit breaker
        this.circuitBreakerState.set(key, { failures: 0, lastFailure: 0, open: false });
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record a failure for circuit breaker
   */
  recordFailure(jobType: string, error: any): void {
    const errorStr = (error?.message || error?.toString() || '').toLowerCase();
    const pattern = this.getErrorPattern(errorStr);
    const key = `${jobType}:${pattern}`;

    if (!this.isCircuitBreakerError(errorStr, jobType)) {
      return; // Don't count non-circuit-breaker errors
    }

    const state = this.circuitBreakerState.get(key) || { failures: 0, lastFailure: 0, open: false };
    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.defaultConfig.circuitBreakerThreshold) {
      state.open = true;
    }

    this.circuitBreakerState.set(key, state);
  }

  /**
   * Record a success to reset circuit breaker
   */
  recordSuccess(jobType: string, error: any): void {
    const errorStr = (error?.message || error?.toString() || '').toLowerCase();
    const pattern = this.getErrorPattern(errorStr);
    const key = `${jobType}:${pattern}`;

    const state = this.circuitBreakerState.get(key);
    if (state) {
      state.failures = 0;
      state.open = false;
      this.circuitBreakerState.set(key, state);
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [key, state] of this.circuitBreakerState.entries()) {
      status[key] = {
        failures: state.failures,
        open: state.open,
        lastFailure: state.lastFailure ? new Date(state.lastFailure).toISOString() : null
      };
    }

    return status;
  }
}

/**
 * Enhanced job execution wrapper with error handling
 */
export async function executeJobWithErrorHandling<T>(
  jobId: string,
  jobType: string,
  jobFunction: () => Promise<T>,
  errorHandler: EnhancedErrorHandler,
  logFunction: (level: string, message: string, data?: any) => void = console.log
): Promise<{ success: boolean; result?: T; error?: JobError }> {
  const supabase = createSupabaseClientFromEnv();

  try {
    // Mark job as processing
    await supabase
      .from('job_queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Execute the job
    const result = await jobFunction();

    // Record success for circuit breaker
    errorHandler.recordSuccess(jobType, null);

    // Mark job as completed
    await supabase
      .from('job_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: result
      })
      .eq('id', jobId);

    logFunction('info', `Job ${jobId} completed successfully`);
    return { success: true, result };

  } catch (error: any) {
    // Analyze the error
    const { data: jobData } = await supabase
      .from('job_queue')
      .select('attempts, max_attempts')
      .eq('id', jobId)
      .single();

    const attempts = jobData?.attempts || 0;
    const maxAttempts = jobData?.max_attempts || 3;

    const jobError = errorHandler.analyzeError(error, jobType, attempts + 1);

    // Record failure for circuit breaker
    errorHandler.recordFailure(jobType, error);

    logFunction('error', `Job ${jobId} failed`, {
      error: jobError.message,
      type: jobError.type,
      attempts: attempts + 1,
      maxAttempts
    });

    // Handle different error types
    if (jobError.type === 'circuit_breaker') {
      // Mark as failed - circuit breaker is open
      await supabase
        .from('job_queue')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: jobError.message
        })
        .eq('id', jobId);

      return { success: false, error: jobError };
    }

    if (jobError.type === 'retryable' && attempts < maxAttempts) {
      // Schedule for retry
      const retryAt = new Date(Date.now() + (jobError.retryAfterMs || 5000));

      await supabase
        .from('job_queue')
        .update({
          status: 'retry',
          attempts: attempts + 1,
          error: jobError.message,
          scheduled_at: retryAt.toISOString()
        })
        .eq('id', jobId);

      logFunction('info', `Job ${jobId} scheduled for retry`, {
        retryAt: retryAt.toISOString(),
        attempt: attempts + 1
      });

      return { success: false, error: jobError };
    }

    // Mark as failed - non-retryable or max attempts exceeded
    await supabase
      .from('job_queue')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: jobError.message
      })
      .eq('id', jobId);

    return { success: false, error: jobError };
  }
}
