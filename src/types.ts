import { z } from 'zod'

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ScheduledJob {
  id: string
  dealer_id: string
  dealer_name: string
  platform: 'homenet' | 'dealer.com' | 'web_scraping'
  schedule: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'ondemand'
  status: 'active' | 'inactive' | 'paused'
  environment: 'development' | 'staging' | 'production'
  config: Record<string, any>
  created_at: Date
  updated_at: Date
  last_run?: Date
  next_run?: Date
  // Enhanced tracing fields
  correlation_id?: string
  trace_id?: string
  span_id?: string
  parent_span_id?: string
}

export interface JobExecution {
  id: string
  job_id: string
  dealer_id: string
  platform: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  start_time: Date
  end_time?: Date
  duration_ms?: number
  vehicles_found?: number
  vehicles_processed?: number
  error_message?: string
  retry_count: number
  max_retries: number
  // Enhanced tracing fields
  correlation_id: string
  trace_id: string
  span_id: string
  parent_span_id?: string
  // Performance metrics
  performance_metrics?: {
    duration_ms: number
    api_calls: number
    rate_limits_hit: number
    avg_response_time: number
    memory_usage_mb: number
    cpu_usage_percent: number
  }
  // Context and metadata
  context?: {
    user_agent?: string
    ip_address?: string
    trigger_source: 'cron' | 'manual' | 'api' | 'retry'
    batch_id?: string
    priority: 'premium' | 'standard' | 'economy'
    timezone: string
    local_run_time: string
  }
}

export interface JobResult {
  success: boolean
  job_id: string
  dealer_id: string
  platform: string
  execution: JobExecution
  data?: {
    vehicles_found: number
    vehicles_processed: number
    vehicles_updated: number
    vehicles_created: number
    vehicles_deleted: number
  }
  error?: {
    message: string
    code?: string
    retryable: boolean
    stack_trace?: string
  }
  // Enhanced tracing
  correlation_id: string
  trace_id: string
  span_id: string
  parent_span_id?: string
  // Timing breakdown
  timing?: {
    total_duration_ms: number
    api_duration_ms: number
    processing_duration_ms: number
    database_duration_ms: number
    event_publishing_duration_ms: number
  }
  // Legacy support - allow job object for backward compatibility
  job?: ScheduledJob
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const ScheduledJobSchema = z.object({
  id: z.string(),
  dealer_id: z.string(),
  dealer_name: z.string(),
  platform: z.enum(['homenet', 'dealer.com', 'scraping', 'vinsolutions', 'dealersocket', 'cobalt']),
  schedule: z.enum(['hourly', 'daily', 'weekly', 'custom']),
  cron_expression: z.string().optional(),
  last_run: z.date().optional(),
  next_run: z.date().optional(),
  status: z.enum(['active', 'paused', 'error']),
  environment: z.enum(['production', 'staging', 'development', 'testing']),
  config: z.object({
    api_endpoint: z.string().optional(),
    credentials: z.record(z.any()).optional(),
    selectors: z.record(z.any()).optional(),
    rate_limit: z.number().optional(),
  }),
  created_at: z.date(),
  updated_at: z.date(),
})

export const JobExecutionSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  dealer_id: z.string(),
  platform: z.string(),
  status: z.enum(['running', 'success', 'failed', 'skipped']),
  start_time: z.date(),
  end_time: z.date().optional(),
  vehicles_found: z.number(),
  vehicles_processed: z.number(),
  errors: z.array(z.string()).optional(),
  performance_metrics: z.object({
    duration_ms: z.number(),
    api_calls: z.number(),
    rate_limits_hit: z.number(),
  }),
  created_at: z.date(),
})

// ============================================================================
// API TYPES
// ============================================================================

export interface RunJobsRequest {
  force?: boolean
  dealer_id?: string
  platform?: string
}

export interface RunJobsResponse {
  success: boolean
  jobs_executed: number
  jobs_succeeded: number
  jobs_failed: number
  results: JobResult[]
  execution_time_ms: number
}

export interface CleanupRequest {
  days_to_keep?: number
}

export interface CleanupResponse {
  success: boolean
  records_deleted: number
  execution_time_ms: number
}
