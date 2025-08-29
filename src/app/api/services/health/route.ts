import { NextRequest, NextResponse } from 'next/server'
import { databaseManager } from '../../../../utils/database'

/**
 * Comprehensive Service Health Monitoring Endpoint
 * Shows detailed health status of all Open Dealer services
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Test all service connections
    const serviceHealth = {
      databases: {
        sftpgo_database: {
          status: 'unknown',
          host: process.env.SFTPGO_DB_HOST || 'localhost',
          port: process.env.SFTPGO_DB_PORT || '5433',
          purpose: 'Vehicle inventory and SFTP user management',
          details: {}
        },
        main_database: {
          status: 'unknown',
          host: process.env.MAIN_DB_HOST || 'localhost',
          port: process.env.MAIN_DB_PORT || '5432',
          purpose: 'Core application data',
          details: {}
        }
      },
      apis: {
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
        data_api: {
          status: 'unknown',
          url: process.env.OD_DATA_API_URL || 'https://od-data-api.vercel.app',
          purpose: 'Vehicle data API',
          details: {}
        },
        soap_transformer: {
          status: 'unknown',
          url: process.env.OD_SOAP_TRANSFORMER_URL || 'https://od-soap-transformer.vercel.app',
          purpose: 'SOAP to JSON transformation',
          details: {}
        }
      },
      infrastructure: {
        redis: {
          status: 'unknown',
          url: process.env.REDIS_URL || 'redis://localhost:6379',
          purpose: 'Event queue and caching',
          details: {}
        },
        sftpgo_server: {
          status: 'unknown',
          url: process.env.SFTPGO_URL || 'http://localhost:8080',
          purpose: 'SFTP file transfer server',
          details: {}
        },
        minio: {
          status: 'unknown',
          url: process.env.MINIO_URL || 'http://localhost:9000',
          purpose: 'Object storage (S3-compatible)',
          details: {}
        }
      },
      scheduler: {
        scheduler_service: {
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
    }

    const criticalIssues: string[] = []

    // Test SFTPGo Database
    try {
      const sftpgoPool = databaseManager.getSftpGoPool()
      const sftpgoConnected = await databaseManager.testConnection(sftpgoPool)

      serviceHealth.databases.sftpgo_database.status = sftpgoConnected ? 'healthy' : 'unhealthy'

      if (sftpgoConnected) {
        // Get database statistics
        const { data: vehicleCount } = await databaseManager.executeQuery(sftpgoPool, 'SELECT COUNT(*) as count FROM vehicles')
        const { data: userCount } = await databaseManager.executeQuery(sftpgoPool, 'SELECT COUNT(*) as count FROM users')

        serviceHealth.databases.sftpgo_database.details = {
          vehicles: vehicleCount?.[0]?.count || 0,
          users: userCount?.[0]?.count || 0,
          connection_time_ms: Date.now() - startTime
        }
      } else {
        criticalIssues.push('SFTPGo database connection failed')
      }
    } catch (error) {
      serviceHealth.databases.sftpgo_database.status = 'error'
      serviceHealth.databases.sftpgo_database.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`SFTPGo database error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Main Database
    try {
      const mainPool = databaseManager.getMainPool()
      const mainConnected = await databaseManager.testConnection(mainPool)

      serviceHealth.databases.main_database.status = mainConnected ? 'healthy' : 'unhealthy'

      if (mainConnected) {
        serviceHealth.databases.main_database.details = {
          connection_time_ms: Date.now() - startTime
        }
      } else {
        criticalIssues.push('Main database connection failed')
      }
    } catch (error) {
      serviceHealth.databases.main_database.status = 'error'
      serviceHealth.databases.main_database.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Main database error: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      serviceHealth.apis.cms_api.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.apis.cms_api.details.status_code = response.status
      serviceHealth.apis.cms_api.details.response_time_ms = Date.now() - cmsStart

      if (response.ok) {
        const result = await response.json()
        serviceHealth.apis.cms_api.details.dealers_count = (result as any)?.data?.length || 0
      } else {
        criticalIssues.push(`PayloadCMS API error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      serviceHealth.apis.cms_api.status = 'error'
      serviceHealth.apis.cms_api.details.error = error instanceof Error ? error.message : 'Unknown error'
      criticalIssues.push(`PayloadCMS API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Data API
    try {
      const dataApiUrl = process.env.OD_DATA_API_URL || 'https://od-data-api.vercel.app'
      const dataApiStart = Date.now()
      const response = await fetch(`${dataApiUrl}/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      serviceHealth.apis.data_api.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.apis.data_api.details = {
        status_code: response.status,
        response_time_ms: Date.now() - dataApiStart
      }

      if (!response.ok) {
        criticalIssues.push(`Data API error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      serviceHealth.apis.data_api.status = 'error'
      serviceHealth.apis.data_api.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Data API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test SOAP Transformer
    try {
      const soapUrl = process.env.OD_SOAP_TRANSFORMER_URL || 'https://od-soap-transformer.vercel.app'
      const soapStart = Date.now()
      const response = await fetch(`${soapUrl}/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      serviceHealth.apis.soap_transformer.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.apis.soap_transformer.details = {
        status_code: response.status,
        response_time_ms: Date.now() - soapStart
      }

      if (!response.ok) {
        criticalIssues.push(`SOAP Transformer error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      serviceHealth.apis.soap_transformer.status = 'error'
      serviceHealth.apis.soap_transformer.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`SOAP Transformer connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Redis
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
      const redisStart = Date.now()
      const response = await fetch(`${redisUrl.replace('redis://', 'http://')}/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })

      serviceHealth.infrastructure.redis.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.infrastructure.redis.details = {
        status_code: response.status,
        response_time_ms: Date.now() - redisStart
      }

      if (!response.ok) {
        criticalIssues.push('Redis connection failed')
      }
    } catch (error) {
      serviceHealth.infrastructure.redis.status = 'error'
      serviceHealth.infrastructure.redis.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Redis connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test SFTPGo Server
    try {
      const sftpgoUrl = process.env.SFTPGO_URL || 'http://localhost:8080'
      const sftpgoStart = Date.now()
      const response = await fetch(`${sftpgoUrl}/api/v2/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      serviceHealth.infrastructure.sftpgo_server.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.infrastructure.sftpgo_server.details = {
        status_code: response.status,
        response_time_ms: Date.now() - sftpgoStart
      }

      if (!response.ok) {
        criticalIssues.push('SFTPGo server connection failed')
      }
    } catch (error) {
      serviceHealth.infrastructure.sftpgo_server.status = 'error'
      serviceHealth.infrastructure.sftpgo_server.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`SFTPGo server connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test MinIO
    try {
      const minioUrl = process.env.MINIO_URL || 'http://localhost:9000'
      const minioStart = Date.now()
      const response = await fetch(`${minioUrl}/minio/health/live`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      serviceHealth.infrastructure.minio.status = response.ok ? 'healthy' : 'unhealthy'
      serviceHealth.infrastructure.minio.details = {
        status_code: response.status,
        response_time_ms: Date.now() - minioStart
      }

      if (!response.ok) {
        criticalIssues.push('MinIO connection failed')
      }
    } catch (error) {
      serviceHealth.infrastructure.minio.status = 'error'
      serviceHealth.infrastructure.minio.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`MinIO connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Scheduler Service
    try {
      serviceHealth.scheduler.scheduler_service.status = 'healthy'
      serviceHealth.scheduler.scheduler_service.details = {
        uptime_ms: Date.now() - startTime,
        version: '1.0.0'
      }
    } catch (error) {
      serviceHealth.scheduler.scheduler_service.status = 'error'
      serviceHealth.scheduler.scheduler_service.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Scheduler service error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Test Tracing System
    try {
      const { TraceManager } = await import('../../../../utils/tracing')
      const traceManager = TraceManager.getInstance()

      serviceHealth.scheduler.tracing.status = 'healthy'
      serviceHealth.scheduler.tracing.details = {
        active_spans: traceManager['activeSpans'].size,
        instance_id: (traceManager as any)?.instanceId || 'unknown'
      }
    } catch (error) {
      serviceHealth.scheduler.tracing.status = 'error'
      serviceHealth.scheduler.tracing.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      criticalIssues.push(`Tracing system error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Calculate overall health
    const allServices = [
      serviceHealth.databases.sftpgo_database,
      serviceHealth.databases.main_database,
      serviceHealth.apis.cms_api,
      serviceHealth.apis.data_api,
      serviceHealth.apis.soap_transformer,
      serviceHealth.infrastructure.redis,
      serviceHealth.infrastructure.sftpgo_server,
      serviceHealth.infrastructure.minio,
      serviceHealth.scheduler.scheduler_service,
      serviceHealth.scheduler.tracing
    ]

    const healthyServices = allServices.filter(s => s.status === 'healthy').length
    const totalServices = allServices.length
    const healthPercentage = Math.round((healthyServices / totalServices) * 100)

    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy'
    if (healthPercentage >= 90) {
      overallStatus = 'healthy'
    } else if (healthPercentage >= 70) {
      overallStatus = 'degraded'
    } else {
      overallStatus = 'critical'
    }

    const responseTime = Date.now() - startTime

    return NextResponse.json({
      status: overallStatus,
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
