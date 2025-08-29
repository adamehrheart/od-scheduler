import { NextRequest, NextResponse } from 'next/server'
import { TraceManager } from '../../../utils/tracing'

/**
 * Simple API endpoint to demonstrate tracing functionality
 */
export async function GET(request: NextRequest) {
  const traceManager = TraceManager.getInstance()

  // Create a test trace
  const testContext = traceManager.generateTraceContext('demo-batch-456')
  const spanId = traceManager.startSpan('demo.api.request', testContext, {
    endpoint: '/api/simple',
    method: 'GET',
    timestamp: new Date().toISOString()
  })

  try {
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 200))

    // Add some events
    traceManager.addSpanEvent(spanId, 'demo.processing.started', {
      step: 'data_processing',
      items: 5
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    traceManager.addSpanEvent(spanId, 'demo.processing.completed', {
      step: 'data_processing',
      processed_items: 5,
      success: true
    })

    // End the span
    const span = traceManager.endSpan(spanId, {
      demo_completed: true,
      total_processing_time: 300
    })

    return NextResponse.json({
      success: true,
      message: 'Simple API with tracing demo',
      data: {
        correlation_id: testContext.correlation_id,
        trace_id: testContext.trace_id,
        span_id: spanId,
        span_duration_ms: span?.duration_ms,
        span_events_count: span?.events.length,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    traceManager.addSpanEvent(spanId, 'demo.error', {
      error_message: error instanceof Error ? error.message : String(error)
    })

    traceManager.endSpan(spanId, {
      demo_failed: true
    })

    return NextResponse.json(
      { success: false, error: 'Demo failed' },
      { status: 500 }
    )
  }
}
