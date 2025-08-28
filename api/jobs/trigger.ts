import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SchedulerService } from '../../src/scheduler.js'
import { logInfo, logError } from '@adamehrheart/utils'

/**
 * On-Demand Job Trigger Endpoint
 *
 * This endpoint allows manual triggering of dealer ingestion jobs for:
 * - Immediate updates when dealer needs fresh data
 * - Testing specific dealer configurations
 * - Recovery from failed scheduled runs
 * - Emergency data refresh requests
 *
 * POST /api/jobs/trigger
 *
 * Body Parameters:
 * - dealer_id?: string - Optional specific dealer ID to trigger
 * - platform?: string - Optional platform filter (dealer.com, homenet, etc.)
 * - force?: boolean - Force execution even if not in optimal time window
 * - priority?: 'high' | 'normal' - Job priority (high bypasses normal scheduling)
 *
 * Query Parameters:
 * - async?: boolean - Whether to run jobs asynchronously (default: false)
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    })
  }

  try {
    logInfo('On-demand job trigger requested', {
      body: req.body,
      query: req.query,
      userAgent: req.headers['user-agent']
    })

    // Parse request parameters
    const {
      dealer_id,
      platform,
      force = true, // Default to force for manual triggers
      priority = 'normal'
    } = req.body

    const asyncMode = req.query.async === 'true'

    // Validate parameters
    if (dealer_id && typeof dealer_id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'dealer_id must be a string'
      })
    }

    if (platform && typeof platform !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'platform must be a string'
      })
    }

    if (priority && !['high', 'normal'].includes(priority)) {
      return res.status(400).json({
        success: false,
        error: 'priority must be "high" or "normal"'
      })
    }

    // Initialize scheduler service
    const scheduler = new SchedulerService()

    if (asyncMode) {
      // Asynchronous mode - start job and return immediately
      logInfo('Starting jobs asynchronously')

      // Don't await - let it run in background
      scheduler.runJobs({
        dealer_id,
        platform,
        force: Boolean(force)
      }).then(result => {
        logInfo('Async job execution completed', {
          jobs_executed: result.jobs_executed,
          jobs_succeeded: result.jobs_succeeded,
          jobs_failed: result.jobs_failed,
          execution_time_ms: result.execution_time_ms
        })
      }).catch(error => {
        logError('Async job execution failed', error)
      })

      return res.status(202).json({
        success: true,
        message: 'Jobs started asynchronously',
        mode: 'async',
        parameters: {
          dealer_id: dealer_id || 'all',
          platform: platform || 'all',
          force: Boolean(force),
          priority
        },
        timestamp: new Date().toISOString()
      })

    } else {
      // Synchronous mode - wait for completion
      logInfo('Running jobs synchronously')

      const startTime = Date.now()
      const result = await scheduler.runJobs({
        dealer_id,
        platform,
        force: Boolean(force)
      })

      const response = {
        success: true,
        message: 'Jobs executed successfully',
        mode: 'sync',
        parameters: {
          dealer_id: dealer_id || 'all',
          platform: platform || 'all',
          force: Boolean(force),
          priority
        },
        results: {
          jobs_executed: result.jobs_executed,
          jobs_succeeded: result.jobs_succeeded,
          jobs_failed: result.jobs_failed,
          total_execution_time_ms: result.execution_time_ms,
          average_job_time_ms: result.jobs_executed > 0 ?
            Math.round(result.execution_time_ms / result.jobs_executed) : 0
        },
        summary: result.jobs_executed > 0 ? {
          success_rate: Math.round((result.jobs_succeeded / result.jobs_executed) * 100),
          total_vehicles_processed: result.results.reduce((sum, r) =>
            sum + (r.execution.vehicles_processed || 0), 0
          ),
          errors: result.results
            .filter(r => !r.success)
            .map(r => ({
              dealer: r.job.dealer_name,
              platform: r.job.platform,
              error: r.error
            }))
        } : null,
        timestamp: new Date().toISOString()
      }

      res.status(200).json(response)

      logInfo('On-demand job trigger completed', {
        jobs_executed: result.jobs_executed,
        jobs_succeeded: result.jobs_succeeded,
        jobs_failed: result.jobs_failed,
        execution_time_ms: result.execution_time_ms,
        mode: 'sync'
      })
    }

  } catch (error) {
    logError('On-demand job trigger failed', error)

    res.status(500).json({
      success: false,
      error: 'Failed to trigger jobs',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * GET handler for endpoint documentation
 */
export function GET(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    endpoint: '/api/jobs/trigger',
    method: 'POST',
    description: 'Trigger dealer ingestion jobs on-demand',
    parameters: {
      body: {
        dealer_id: {
          type: 'string',
          required: false,
          description: 'Specific dealer ID to trigger (omit for all dealers)'
        },
        platform: {
          type: 'string',
          required: false,
          description: 'Platform filter (dealer.com, homenet, etc.)'
        },
        force: {
          type: 'boolean',
          required: false,
          default: true,
          description: 'Force execution even outside optimal time window'
        },
        priority: {
          type: 'string',
          required: false,
          default: 'normal',
          options: ['high', 'normal'],
          description: 'Job execution priority'
        }
      },
      query: {
        async: {
          type: 'boolean',
          required: false,
          default: false,
          description: 'Run jobs asynchronously (returns immediately)'
        }
      }
    },
    examples: {
      trigger_all: {
        url: 'POST /api/jobs/trigger',
        body: { force: true }
      },
      trigger_specific_dealer: {
        url: 'POST /api/jobs/trigger',
        body: { dealer_id: 'dealer-123', force: true }
      },
      trigger_async: {
        url: 'POST /api/jobs/trigger?async=true',
        body: { force: true, priority: 'high' }
      }
    }
  })
}
