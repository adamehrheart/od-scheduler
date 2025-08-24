import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SchedulerService } from '../../src/scheduler.js'
import { processMultiDealerJobs } from '../../src/scheduler.js'
import { logInfo, logError } from '../../src/utils.js'

/**
 * Vercel Cron Job Endpoint
 * 
 * This endpoint is called by Vercel's cron job system daily
 * to execute scheduled data pull jobs for all active dealers.
 * 
 * Cron Schedule: 0 9 * * * (daily at 9 AM)
 * 
 * Features:
 * - Multi-dealer dependency management
 * - Intelligent job scheduling
 * - Parallel processing where safe
 * - Enhanced error handling
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    logInfo('Cron job triggered - running scheduled jobs')

    // Check if multi-dealer processing is requested
    const useMultiDealer = req.query.multi_dealer === 'true' || req.query.multi_dealer === '1';

    let result;

    if (useMultiDealer) {
      logInfo('Using enhanced multi-dealer dependency management');

      // Use the new multi-dealer dependency manager
      result = await processMultiDealerJobs(20); // Process up to 20 jobs

      // Transform result to match expected format
      result = {
        jobs_executed: result.processedJobs,
        jobs_succeeded: result.successfulJobs,
        jobs_failed: result.failedJobs,
        execution_time_ms: result.processingTimeMs,
        dealers_processed: result.dealersProcessed,
        dependency_violations: result.dependencyViolations
      };
    } else {
      logInfo('Using legacy scheduler service');

      // Initialize scheduler service
      const scheduler = new SchedulerService()

      // Run all scheduled jobs
      result = await scheduler.runJobs()
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: useMultiDealer ? 'Multi-dealer jobs executed successfully' : 'Scheduled jobs executed successfully',
      timestamp: new Date().toISOString(),
      result,
      processing_mode: useMultiDealer ? 'multi_dealer' : 'legacy'
    })

          logInfo('Cron job completed successfully', {
        jobs_executed: result.jobs_executed,
        jobs_succeeded: result.jobs_succeeded,
        jobs_failed: result.jobs_failed,
        execution_time_ms: result.execution_time_ms,
        processing_mode: useMultiDealer ? 'multi_dealer' : 'legacy',
        ...(useMultiDealer && {
          dealers_processed: (result as any).dealers_processed,
          dependency_violations: (result as any).dependency_violations
        })
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
