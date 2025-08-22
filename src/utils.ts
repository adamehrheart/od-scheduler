import { createClient } from '@supabase/supabase-js'
import type { ScheduledJob, JobExecution } from './types.js'

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

export function logInfo(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '')
}

export function logSuccess(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ✅ SUCCESS: ${message}`, data ? JSON.stringify(data, null, 2) : '')
}

export function logWarning(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  console.warn(`[${timestamp}] ⚠️ WARNING: ${message}`, data ? JSON.stringify(data, null, 2) : '')
}

export function logError(message: string, error?: any) {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] ❌ ERROR: ${message}`, error ? JSON.stringify(error, null, 2) : '')
}

// ============================================================================
// DATABASE UTILITIES
// ============================================================================

export function getSupabaseClient() {
  const supabaseUrl = process.env.OD_SUPABASE_URL
  const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing OD_SUPABASE_URL or OD_SUPABASE_SERVICE_ROLE environment variables')
  }

  return createClient(supabaseUrl, supabaseKey)
}

// ============================================================================
// SCHEDULING UTILITIES
// ============================================================================

export function shouldRunJob(job: ScheduledJob, force: boolean = false): boolean {
  if (force) return true
  if (job.status !== 'active') return false
  
  const now = new Date()
  
  // If no last run, run immediately
  if (!job.last_run) return true
  
  // If next run is set and it's time
  if (job.next_run && now >= job.next_run) return true
  
  // Default schedules
  const hoursSinceLastRun = (now.getTime() - job.last_run.getTime()) / (1000 * 60 * 60)
  
  switch (job.schedule) {
    case 'hourly':
      return hoursSinceLastRun >= 1
    case 'daily':
      return hoursSinceLastRun >= 24
    case 'weekly':
      return hoursSinceLastRun >= 168 // 7 days
    case 'custom':
      // For custom schedules, rely on next_run field
      return job.next_run ? now >= job.next_run : false
    default:
      return false
  }
}

export function calculateNextRun(job: ScheduledJob): Date {
  const now = new Date()
  
  switch (job.schedule) {
    case 'hourly':
      return new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
    case 'custom':
      // For custom schedules, calculate based on cron expression
      // This is a simplified version - you might want to use a proper cron parser
      return new Date(now.getTime() + 4 * 60 * 60 * 1000) // Default to 4 hours
    default:
      return new Date(now.getTime() + 4 * 60 * 60 * 1000) // Default to 4 hours
  }
}

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

export function createPerformanceTimer() {
  const startTime = Date.now()
  
  return {
    startTime,
    getDuration: () => Date.now() - startTime,
    getDurationMs: () => Date.now() - startTime,
  }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function validateJob(job: any): job is ScheduledJob {
  return (
    job &&
    typeof job.id === 'string' &&
    typeof job.dealer_id === 'string' &&
    typeof job.platform === 'string' &&
    typeof job.status === 'string' &&
    job.status === 'active'
  )
}

export function validateExecution(execution: any): execution is JobExecution {
  return (
    execution &&
    typeof execution.id === 'string' &&
    typeof execution.job_id === 'string' &&
    typeof execution.dealer_id === 'string' &&
    typeof execution.status === 'string'
  )
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

export function formatError(error: any): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return JSON.stringify(error)
}

export function isRetryableError(error: any): boolean {
  const errorMessage = formatError(error).toLowerCase()
  
  // Network errors are retryable
  if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
    return true
  }
  
  // Rate limit errors are retryable
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return true
  }
  
  // Temporary server errors are retryable
  if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
    return true
  }
  
  return false
}
