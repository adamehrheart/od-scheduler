import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SchedulerService } from '../../src/scheduler.js'
import { logInfo, logError } from '../../src/utils.js'

/**
 * Vercel Cron Job Endpoint
 * 
 * This endpoint is called by Vercel's cron job system daily
 * to execute scheduled Dealer.com data pull jobs for all active dealers.
 * 
 * Cron Schedule: 0 9 * * * (daily at 9 AM)
 * 
 * Features:
 * - Dealer.com direct API integration
 * - Multi-config inventory segmentation
 * - Parallel dealer processing
 * - Robust error handling
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    logInfo('Cron job triggered - running Dealer.com jobs')

    // Initialize scheduler service
    const scheduler = new SchedulerService()

    // Run all scheduled jobs  
    const result = await scheduler.runJobs()

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Dealer.com jobs executed successfully',
      timestamp: new Date().toISOString(),
      result
    })

    logInfo('Cron job completed successfully', {
      jobs_executed: result.jobs_executed,
      jobs_succeeded: result.jobs_succeeded,
      jobs_failed: result.jobs_failed,
      execution_time_ms: result.execution_time_ms
    })

  } catch (error) {
    logError('Cron job failed', error)

    res.status(500).json({
      success: false,
      message: 'Scheduled job execution failed',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
