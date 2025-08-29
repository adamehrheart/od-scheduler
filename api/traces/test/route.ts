import { NextRequest, NextResponse } from 'next/server'
import { TraceManager } from '../../../src/utils/tracing.js'

/**
 * Test endpoint to verify tracing functionality
 */
export async function GET(request: NextRequest) {
  try {
    const traceManager = TraceManager.getInstance()

    // Create a test trace
    const testContext = traceManager.generateTraceContext('test-batch-123')
    const spanId = traceManager.startSpan('test.operation', testContext, {
      test: true,
      operation: 'tracing_test'
    })

    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100))

    // Add an event
    traceManager.addSpanEvent(spanId, 'test.event', {
      message: 'Test event added',
      timestamp: new Date().toISOString()
    })

    // End the span
    const span = traceManager.endSpan(spanId, {
      test_completed: true
    })

    return NextResponse.json({
      success: true,
      message: 'Tracing test completed',
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
    console.error('Tracing test failed:', error)
    return NextResponse.json(
      { success: false, error: 'Tracing test failed' },
      { status: 500 }
    )
  }
}
