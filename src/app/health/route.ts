import { NextRequest, NextResponse } from 'next/server'

/**
 * Standard Health Check Endpoint
 *
 * Provides a standardized health check at /health across all Open Dealer services.
 * This endpoint follows the enterprise API standards and provides consistent
 * health reporting format.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Basic service health check
    const serviceStatus = {
      service: 'od-scheduler',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      response_time_ms: Date.now() - startTime
    }

    // Test basic functionality
    try {
      // Test that we can access environment variables (Doppler)
      const dopplerConfigured = !!process.env.DOPPLER_CONFIG

      serviceStatus.status = dopplerConfigured ? 'healthy' : 'degraded'

      return NextResponse.json({
        success: true,
        ...serviceStatus,
        environment: {
          node_env: process.env.NODE_ENV || 'development',
          doppler_configured: dopplerConfigured,
          config: process.env.DOPPLER_CONFIG || 'unknown'
        },
        endpoints: {
          health: '/health',
          detailed_health: '/api/health',
          services_health: '/api/services/health'
        }
      })
    } catch (error) {
      return NextResponse.json({
        success: false,
        service: 'od-scheduler',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 503 })
    }
  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json({
      success: false,
      service: 'od-scheduler',
      status: 'critical',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      response_time_ms: Date.now() - startTime,
      error: 'Health check system failure'
    }, { status: 503 })
  }
}
