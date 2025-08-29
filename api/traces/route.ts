import { NextRequest, NextResponse } from 'next/server'
import { TraceManager } from '../../src/utils/tracing.js'

/**
 * Trace Information API
 *
 * Provides access to distributed tracing information for monitoring
 * and debugging job execution across the scheduler.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const traceId = searchParams.get('trace_id')
    const correlationId = searchParams.get('correlation_id')
    const batchId = searchParams.get('batch_id')

    const traceManager = TraceManager.getInstance()

    // Clean up old spans periodically
    traceManager.cleanupOldSpans()

    if (traceId) {
      // Get specific trace information
      const traceSummary = traceManager.getTraceSummary(traceId)
      if (!traceSummary) {
        return NextResponse.json(
          { success: false, error: 'Trace not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          trace: traceSummary,
          timestamp: new Date().toISOString()
        }
      })
    }

    if (correlationId) {
      // Get all traces for a correlation ID
      const activeSpans = Array.from(traceManager['activeSpans'].values())
      const correlationSpans = activeSpans.filter(span =>
        span.tags.correlation_id === correlationId
      )

      return NextResponse.json({
        success: true,
        data: {
          correlation_id: correlationId,
          active_spans: correlationSpans.length,
          spans: correlationSpans.map(span => ({
            id: span.id,
            name: span.name,
            start_time: span.start_time,
            duration_ms: span.duration_ms,
            events_count: span.events.length,
            tags: span.tags
          })),
          timestamp: new Date().toISOString()
        }
      })
    }

    if (batchId) {
      // Get all traces for a batch
      const activeSpans = Array.from(traceManager['activeSpans'].values())
      const batchSpans = activeSpans.filter(span =>
        span.tags.batch_id === batchId
      )

      return NextResponse.json({
        success: true,
        data: {
          batch_id: batchId,
          active_spans: batchSpans.length,
          spans: batchSpans.map(span => ({
            id: span.id,
            name: span.name,
            start_time: span.start_time,
            duration_ms: span.duration_ms,
            events_count: span.events.length,
            tags: span.tags
          })),
          timestamp: new Date().toISOString()
        }
      })
    }

    // Get overview of all active traces
    const activeSpans = Array.from(traceManager['activeSpans'].values())
    const traceIds = [...new Set(activeSpans.map(span => span.tags.trace_id))]

    const traces = traceIds.map(traceId => {
      const traceSpans = activeSpans.filter(span => span.tags.trace_id === traceId)
      const totalDuration = traceSpans.reduce((sum, span) => sum + (span.duration_ms || 0), 0)

      return {
        trace_id: traceId,
        correlation_id: traceSpans[0]?.tags.correlation_id,
        batch_id: traceSpans[0]?.tags.batch_id,
        span_count: traceSpans.length,
        total_duration_ms: totalDuration,
        oldest_span: Math.min(...traceSpans.map(span => span.start_time.getTime())),
        newest_span: Math.max(...traceSpans.map(span => span.start_time.getTime()))
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        total_active_traces: traces.length,
        total_active_spans: activeSpans.length,
        traces: traces.sort((a, b) => b.newest_span - a.newest_span),
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Error getting trace information:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get trace information' },
      { status: 500 }
    )
  }
}

/**
 * Clean up old traces
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const maxAgeMs = parseInt(searchParams.get('max_age_ms') || '300000') // 5 minutes default

    const traceManager = TraceManager.getInstance()
    traceManager.cleanupOldSpans(maxAgeMs)

    return NextResponse.json({
      success: true,
      message: 'Old traces cleaned up',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error cleaning up traces:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to clean up traces' },
      { status: 500 }
    )
  }
}
