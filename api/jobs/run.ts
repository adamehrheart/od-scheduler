import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SchedulerService } from '../../src/scheduler.js'
import { logInfo, logError } from '@adamehrheart/utils'

/**
 * Manual Job Execution Endpoint
 * 
 * Allows manual execution of scheduled jobs for testing or on-demand runs.
 * Supports filtering by dealer_id and platform.
 * 
 * Usage:
 * POST /api/jobs/run
 * {
 *   "force": true,
 *   "dealer_id": "optional-dealer-id",
 *   "platform": "optional-platform"
 * }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST to run jobs.'
    })
  }

  try {
    logInfo('Manual job execution requested', req.body)

    // Initialize scheduler service
    const scheduler = new SchedulerService()
    
    // Run jobs with request parameters
    const result = await scheduler.runJobs(req.body)

    // Return detailed response
    res.status(200).json({
      success: true,
      message: 'Jobs executed successfully',
      timestamp: new Date().toISOString(),
      request: req.body,
      result
    })

    logInfo('Manual job execution completed', {
      jobs_executed: result.jobs_executed,
      jobs_succeeded: result.jobs_succeeded,
      jobs_failed: result.jobs_failed,
      execution_time_ms: result.execution_time_ms
    })

  } catch (error) {
    logError('Manual job execution failed', error)
    
    res.status(500).json({
      success: false,
      message: 'Job execution failed',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
