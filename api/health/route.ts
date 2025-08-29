import { NextRequest, NextResponse } from 'next/server'

/**
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'healthy',
    service: 'od-scheduler',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      tracing: true,
      timezone_scheduling: true,
      event_driven: true
    }
  })
}
