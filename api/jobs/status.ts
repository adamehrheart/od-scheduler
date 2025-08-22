import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseClient, logInfo, logError } from '../../src/utils.js'

/**
 * Job Status Monitoring Endpoint
 * 
 * Provides status information about recent job executions
 * and overall system health.
 * 
 * Usage:
 * GET /api/jobs/status?dealer_id=optional&platform=optional&limit=50
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET to check job status.'
    })
  }

  try {
    const { dealer_id, platform, limit = '50' } = req.query
    const limitNum = parseInt(limit as string, 10)

    logInfo('Job status requested', { dealer_id, platform, limit: limitNum })

    const supabase = getSupabaseClient()

    // Build query for recent job executions
    let query = supabase
      .from('job_executions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limitNum)

    // Apply filters
    if (dealer_id) {
      query = query.eq('dealer_id', dealer_id as string)
    }
    if (platform) {
      query = query.eq('platform', platform as string)
    }

    const { data: executions, error } = await query

    if (error) {
      throw new Error(`Failed to fetch job executions: ${error.message}`)
    }

    // Get summary statistics
    const { data: summary, error: summaryError } = await supabase
      .from('job_executions')
      .select('status, platform')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours

    if (summaryError) {
      logError('Failed to fetch summary statistics', summaryError)
    }

    // Calculate statistics
    const stats = {
      total_executions_24h: summary?.length || 0,
      successful_executions_24h: summary?.filter(e => e.status === 'success').length || 0,
      failed_executions_24h: summary?.filter(e => e.status === 'failed').length || 0,
      running_executions_24h: summary?.filter(e => e.status === 'running').length || 0,
      platform_breakdown: summary?.reduce((acc, e) => {
        acc[e.platform] = (acc[e.platform] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}
    }

    // Return status information
    res.status(200).json({
      success: true,
      message: 'Job status retrieved successfully',
      timestamp: new Date().toISOString(),
      data: {
        recent_executions: executions || [],
        statistics: stats,
        filters: {
          dealer_id: dealer_id || null,
          platform: platform || null,
          limit: limitNum
        }
      }
    })

    logInfo('Job status retrieved successfully', {
      executions_count: executions?.length || 0,
      total_24h: stats.total_executions_24h,
      successful_24h: stats.successful_executions_24h,
      failed_24h: stats.failed_executions_24h
    })

  } catch (error) {
    logError('Job status request failed', error)
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve job status',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
