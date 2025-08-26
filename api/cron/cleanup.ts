import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSupabaseClientFromEnv, logInfo, logError, createPerformanceTimer } from '@adamehrheart/utils'

/**
 * Vercel Cron Job Endpoint - Cleanup
 *
 * This endpoint is called by Vercel's cron job system daily at 2 AM
 * to perform cleanup operations like removing old job executions
 * and maintaining database performance.
 *
 * Cron Schedule: 0 2 * * * (daily at 2 AM)
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const timer = createPerformanceTimer()

  try {
    logInfo('Cleanup cron job triggered')

    const supabase = createSupabaseClientFromEnv()
    let totalDeleted = 0

    // 1. Clean up old job executions (keep last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { error: executionsError, count: executionsDeleted } = await supabase
      .from('job_executions')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString())
      .select('id')

    if (executionsError) {
      logError('Failed to clean up old job executions', executionsError)
    } else {
      totalDeleted += executionsDeleted || 0
      logInfo(`Cleaned up ${executionsDeleted} old job executions`)
    }

    // 2. Clean up old API key events (keep last 90 days)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const { error: eventsError, count: eventsDeleted } = await supabase
      .from('api_key_events')
      .delete()
      .lt('created_at', ninetyDaysAgo.toISOString())
      .select('id')

    if (eventsError) {
      logError('Failed to clean up old API key events', eventsError)
    } else {
      totalDeleted += eventsDeleted || 0
      logInfo(`Cleaned up ${eventsDeleted} old API key events`)
    }

    // 3. Clean up old vehicle links (keep last 60 days)
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const { error: linksError, count: linksDeleted } = await supabase
      .from('vehicle_links')
      .delete()
      .lt('created_at', sixtyDaysAgo.toISOString())
      .select('id')

    if (linksError) {
      logError('Failed to clean up old vehicle links', linksError)
    } else {
      totalDeleted += linksDeleted || 0
      logInfo(`Cleaned up ${linksDeleted} old vehicle links`)
    }

    const executionTime = timer.getDurationMs()

    logInfo('Cleanup cron job completed successfully', {
      total_records_deleted: totalDeleted,
      execution_time_ms: executionTime
    })

    res.status(200).json({
      success: true,
      message: 'Cleanup completed successfully',
      timestamp: new Date().toISOString(),
      result: {
        records_deleted: totalDeleted,
        execution_time_ms: executionTime
      }
    })

  } catch (error) {
    logError('Cleanup cron job failed', error)

    res.status(500).json({
      success: false,
      message: 'Cleanup operation failed',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      execution_time_ms: timer.getDurationMs()
    })
  }
}
