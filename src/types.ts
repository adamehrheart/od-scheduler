// ============================================================================
// SCHEDULER TYPES - MIGRATED TO CENTRAL PACKAGE
// ============================================================================
//
// The core job and scheduler types have been moved to @adamehrheart/schema:
// - ScheduledJob, JobExecution, JobResult
// - RunJobsRequest, RunJobsResponse
// - All validation schemas and event types
//
// Import from central package instead:
// import { ScheduledJob, JobExecution, JobResult } from '@adamehrheart/schema'
//
// This file now only contains re-exports for backward compatibility.

// Re-export consolidated types for backward compatibility
export type {
  ScheduledJob,
  JobExecution,
  JobResult,
  RunJobsRequest,
  RunJobsResponse,
  CleanupRequest,
  CleanupResponse,
  TraceContext,
  Span,
  SpanEvent,
  SchedulerEvent,
  EventClientConfig
} from '@adamehrheart/schema'

// Re-export validation schemas (these are values, not types)
export {
  zScheduledJob,
  zJobExecution,
  zTraceContext,
  zRunJobsRequest,
  zCleanupRequest
} from '@adamehrheart/schema'

// ============================================================================
// END OF FILE - All types now centralized in @adamehrheart/schema
// ============================================================================