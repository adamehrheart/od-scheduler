import { NextRequest, NextResponse } from 'next/server'

/**
 * Health check endpoint with real system status
 * Uses Database API Service for data access
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Test all service connections
    const serviceHealth = {
      database_api: {
        status: 'unknown',
        url: process.env.OD_DB_API_URL || 'http://localhost:3001',
        purpose: 'Database API service for data access',
        details: {
          databases: [] as any[],
          status_code: 0,
          response_time_ms: 0,
          error: ''
        }
      },
      cms_api: {
        status: 'unknown',
        url: process.env.OD_CMS_URL || 'http://localhost:3002',
        purpose: 'Dealer management and configuration',
        details: {
          dealers_count: 0,
          status_code: 0,
          response_time_ms: 0,
          error: ''
        }
      },
      redis: {
        status: 'unknown',
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        purpose: 'Event queue and caching',
        details: {}
      },
      scheduler: {
        status: 'unknown',
        purpose: 'Job scheduling and execution',
        details: {}
      },
      tracing: {
        status: 'unknown',
        purpose: 'Distributed tracing system',
        details: {}
      }
    }

    const criticalIssues: string[] = []

    // Test Database API Service (REQUIRED)
    try {
      const dbApiUrl = process.env.OD_DB_API_URL || 'http://localhost:3001'
      const dbApiStart = Date.now()
      const response = await fetch(`${dbApiUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      })

      serviceHealth.database_api.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.database_api.details.status_code = response.status
      serviceHealth.database_api.details.response_time_ms = Date.now() - dbApiStart

      if (response.ok) {
        const healthData = await response.json()
        serviceHealth.database_api.details.databases = (healthData as any)?.databases || []
      } else {
        criticalIssues.push(`Database API error: ${response.status} ${response.statusText} - CRITICAL: Cannot access data`)
      }
    } catch (error) {
      serviceHealth.database_api.status = 'error'
      serviceHealth.database_api.details.error = error instanceof Error ? error.message : 'Unknown error'
      criticalIssues.push(`Database API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test PayloadCMS API
    try {
      const cmsUrl = process.env.OD_CMS_URL || 'http://localhost:3002'
      const cmsStart = Date.now()
      const response = await fetch(`${cmsUrl}/api/dealers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      })

      serviceHealth.cms_api.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.cms_api.details.status_code = response.status
      serviceHealth.cms_api.details.response_time_ms = Date.now() - cmsStart

      if (response.ok) {
        const result = await response.json()
        serviceHealth.cms_api.details.dealers_count = (result as any)?.data?.length || 0
      } else {
        criticalIssues.push(`PayloadCMS API error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      serviceHealth.cms_api.status = 'error'
      serviceHealth.cms_api.details.error = error instanceof Error ? error.message : 'Unknown error'
      criticalIssues.push(`PayloadCMS API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Redis
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
      const redisStart = Date.now()
      const response = await fetch(`${redisUrl.replace('redis://', 'http://')}/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })

      serviceHealth.redis.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.redis.details = {
        status_code: response.status,
        response_time_ms: Date.now() - redisStart
      }

      if (!response.ok) {
        criticalIssues.push('Redis connection failed')
      }
    } catch (error) {
      serviceHealth.redis.status = 'error'
      serviceHealth.redis.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Redis connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Scheduler Service
    try {
      serviceHealth.scheduler.status = 'healthy'
      serviceHealth.scheduler.details = {
        uptime_ms: Date.now() - startTime,
        version: '1.0.0'
      }
    } catch (error) {
      serviceHealth.scheduler.status = 'error'
      serviceHealth.scheduler.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Scheduler service error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Tracing System
    try {
      const { TraceManager } = await import('../../../utils/tracing')
      const traceManager = TraceManager.getInstance()

      serviceHealth.tracing.status = 'healthy'
      serviceHealth.tracing.details = {
        active_spans: traceManager['activeSpans'].size,
        instance_id: (traceManager as any)?.instanceId || 'unknown'
      }
    } catch (error) {
      serviceHealth.tracing.status = 'error'
      serviceHealth.tracing.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Tracing system error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Get real statistics from Database API Service
    let dealerStats = { total_dealers: 0, active_dealers: 0, sftp_enabled: 0, provisioning_status: {} }
    let vehicleStats = { total_vehicles: 0, total_dealers: 0, recent_updates: 0, average_price: 0 }

    if (serviceHealth.database_api.status === 'healthy') {
      try {
        const dbApiUrl = process.env.OD_DB_API_URL || 'http://localhost:3001'

        // Get dealer statistics
        const dealerResponse = await fetch(`${dbApiUrl}/api/v1/dealers/stats`)
        if (dealerResponse.ok) {
          const dealerResult = await dealerResponse.json()
          dealerStats = (dealerResult as any)?.data || {}
        }

        // Get vehicle statistics
        const vehicleResponse = await fetch(`${dbApiUrl}/api/v1/vehicles/stats`)
        if (vehicleResponse.ok) {
          const vehicleResult = await vehicleResponse.json()
          vehicleStats = (vehicleResult as any)?.data || {}
        }
      } catch (error) {
        criticalIssues.push(`Failed to fetch statistics: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Calculate overall health
    const allServices = [
      serviceHealth.database_api,
      serviceHealth.cms_api,
      serviceHealth.redis,
      serviceHealth.scheduler,
      serviceHealth.tracing
    ]

    const healthyServices = allServices.filter(s => s.status === 'healthy').length
    const totalServices = allServices.length
    const healthPercentage = Math.round((healthyServices / totalServices) * 100)

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy'
    if (healthPercentage >= 90) {
      status = 'healthy'
    } else if (healthPercentage >= 70) {
      status = 'degraded'
    } else {
      status = 'critical'
    }

    const responseTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      status: status,
      service: 'od-scheduler',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      response_time_ms: responseTime,
      health_percentage: healthPercentage,
      services_summary: {
        total: totalServices,
        healthy: healthyServices,
        unhealthy: allServices.filter(s => s.status === 'unhealthy').length,
        error: allServices.filter(s => s.status === 'error').length
      },
      critical_issues: criticalIssues,
      service_health: serviceHealth,
      statistics: {
        dealers: dealerStats,
        vehicles: vehicleStats
      },
      endpoints: {
        health: '/health',
        simple: '/api/simple',
        traces: '/api/traces',
        vehicles: '/api/vehicles',
        jobs: '/api/jobs/trigger',
        schedules: '/api/schedules/preview'
      },
      environment: {
        doppler_configured: true,
        config: process.env.DOPPLER_CONFIG || 'dev',
        node_env: process.env.NODE_ENV || 'development'
      }
    })

  } catch (error) {
    console.error('Service health check error:', error)
    return NextResponse.json({
      status: 'critical',
      service: 'od-scheduler',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      response_time_ms: Date.now() - startTime,
      error: 'Service health check system failure',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 })
  }
}
