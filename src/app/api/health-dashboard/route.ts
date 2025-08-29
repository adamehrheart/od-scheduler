/**
 * Enterprise Health Dashboard API - Shopify-Inspired
 * Real-time service monitoring with comprehensive metrics
 */

import { NextRequest, NextResponse } from 'next/server';

// Service configuration inspired by Shopify's multi-service architecture
const SERVICES = {
  'od-db': {
    name: 'API Aggregation',
    url: 'http://db-api:3001/health',  // ✅ FIXED: od-db runs on port 3001 internally
    external_url: 'http://localhost:3004/health',
    description: '22 Enterprise Integration APIs',
    critical: true
  },
  'od-data-api': {
    name: 'Vehicle Data API',
    url: 'http://data-api:3002/health',  // ✅ FIXED: All Next.js services use port 3002 internally
    external_url: 'http://localhost:3001/health',
    description: 'Vehicle inventory management',
    critical: true
  },
  'od-scheduler': {
    name: 'Job Management',
    url: 'http://scheduler:3002/health',  // ✅ FIXED: Use Docker internal network
    external_url: 'http://localhost:3003/health',
    description: 'Background job processing',
    critical: true
  },
  'od-cms': {
    name: 'Dealer Management',
    url: 'http://cms:3002/',
    external_url: 'http://localhost:3002/',
    description: 'PayloadCMS dealer portal',
    critical: true
  },
  'od-ingestion': {
    name: 'File Processing',
    url: 'http://ingestion-worker:4000/health',
    external_url: 'http://localhost:4000/health',
    description: 'SFTP file ingestion worker',
    critical: false
  },
  'sftpgo': {
    name: 'File Transfer',
    url: 'http://sftpgo:8080/healthz',
    external_url: 'http://localhost:8080/healthz',
    description: 'SFTP server for dealer uploads',
    critical: false
  }
};

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  response_time_ms: number;
  last_check: string;
  error?: string;
  details?: any;
  external_url: string;
  description: string;
  critical: boolean;
}

interface HealthDashboard {
  overall_status: 'healthy' | 'degraded' | 'critical';
  services: Record<string, ServiceHealth>;
  summary: {
    total_services: number;
    healthy_services: number;
    degraded_services: number;
    down_services: number;
    critical_services_down: number;
  };
  system_metrics: {
    uptime_percentage: number;
    avg_response_time_ms: number;
    error_rate_percentage: number;
  };
  metadata: {
    timestamp: string;
    check_duration_ms: number;
    version: string;
  };
}

async function checkServiceHealth(serviceName: string, config: any): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(config.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenDealer-HealthCheck/1.0'
      }
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    let status: 'healthy' | 'degraded' | 'down' = 'healthy';
    let details: any = null;

    if (response.ok) {
      // Try to parse response for additional details
      try {
        const responseText = await response.text();
        if (responseText.trim().startsWith('{')) {
          details = JSON.parse(responseText);
        }
      } catch (e) {
        // Non-JSON response is fine for health checks
      }

      // Determine status based on response time
      if (responseTime > 2000) {
        status = 'degraded'; // Slow response
      }
    } else {
      status = response.status >= 500 ? 'down' : 'degraded';
    }

    return {
      name: config.name,
      status,
      response_time_ms: responseTime,
      last_check: new Date().toISOString(),
      details,
      external_url: config.external_url,
      description: config.description,
      critical: config.critical
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      name: config.name,
      status: 'down',
      response_time_ms: responseTime,
      last_check: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Connection failed',
      external_url: config.external_url,
      description: config.description,
      critical: config.critical
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    console.log('🔍 Starting comprehensive health dashboard check...');

    // Check all services in parallel (Shopify-style efficiency)
    const healthChecks = await Promise.all(
      Object.entries(SERVICES).map(async ([key, config]) => {
        const health = await checkServiceHealth(key, config);
        return [key, health];
      })
    );

    const services: Record<string, ServiceHealth> = Object.fromEntries(healthChecks);

    // Calculate summary statistics
    const totalServices = Object.keys(services).length;
    const healthyServices = Object.values(services).filter(s => s.status === 'healthy').length;
    const degradedServices = Object.values(services).filter(s => s.status === 'degraded').length;
    const downServices = Object.values(services).filter(s => s.status === 'down').length;
    const criticalServicesDown = Object.values(services).filter(s => s.critical && s.status === 'down').length;

    // Determine overall system status
    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (criticalServicesDown > 0) {
      overallStatus = 'critical';
    } else if (downServices > 0 || degradedServices > totalServices / 2) {
      overallStatus = 'degraded';
    }

    // Calculate system metrics
    const avgResponseTime = Object.values(services)
      .reduce((sum, s) => sum + s.response_time_ms, 0) / totalServices;
    const uptimePercentage = (healthyServices / totalServices) * 100;
    const errorRate = ((downServices + degradedServices) / totalServices) * 100;

    const dashboard: HealthDashboard = {
      overall_status: overallStatus,
      services,
      summary: {
        total_services: totalServices,
        healthy_services: healthyServices,
        degraded_services: degradedServices,
        down_services: downServices,
        critical_services_down: criticalServicesDown
      },
      system_metrics: {
        uptime_percentage: Math.round(uptimePercentage * 100) / 100,
        avg_response_time_ms: Math.round(avgResponseTime),
        error_rate_percentage: Math.round(errorRate * 100) / 100
      },
      metadata: {
        timestamp: new Date().toISOString(),
        check_duration_ms: Date.now() - startTime,
        version: '1.0.0'
      }
    };

    console.log(`✅ Health dashboard complete: ${overallStatus} (${healthyServices}/${totalServices} healthy)`);

    // Return appropriate HTTP status based on overall health
    const httpStatus = overallStatus === 'critical' ? 503 :
                      overallStatus === 'degraded' ? 206 : 200;

    return NextResponse.json({
      success: true,
      data: dashboard
    }, { status: httpStatus });

  } catch (error) {
    console.error('❌ Health dashboard check failed:', error);

    return NextResponse.json({
      success: false,
      error: 'Health dashboard unavailable',
      metadata: {
        timestamp: new Date().toISOString(),
        check_duration_ms: Date.now() - startTime
      }
    }, { status: 500 });
  }
}

// Export config for Next.js
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
