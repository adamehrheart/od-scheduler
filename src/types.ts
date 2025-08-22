import { z } from 'zod'

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ScheduledJob {
  id: string
  dealer_id: string
  dealer_name: string
  platform: 'homenet' | 'dealer.com' | 'scraping' | 'vinsolutions' | 'dealersocket' | 'cobalt'
  schedule: 'hourly' | 'daily' | 'weekly' | 'custom'
  cron_expression?: string
  last_run?: Date
  next_run?: Date
  status: 'active' | 'paused' | 'error'
  environment: 'production' | 'staging' | 'development' | 'testing'
  config: {
    api_endpoint?: string
    credentials?: object
    selectors?: object
    rate_limit?: number
  }
  created_at: Date
  updated_at: Date
}

export interface JobExecution {
  id: string
  job_id: string
  dealer_id: string
  platform: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  start_time: Date
  end_time?: Date
  vehicles_found: number
  vehicles_processed: number
  errors?: string[]
  performance_metrics: {
    duration_ms: number
    api_calls: number
    rate_limits_hit: number
  }
  created_at: Date
}

export interface JobResult {
  job: ScheduledJob
  execution: JobExecution
  success: boolean
  error?: string
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
