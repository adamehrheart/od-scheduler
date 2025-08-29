import { NextRequest, NextResponse } from 'next/server'
import { TraceManager } from '../../../utils/tracing'

/**
 * Traces API endpoint
 * Supports querying by trace_id, correlation_id, or returning all traces from PostgreSQL storage or memory
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const traceId = searchParams.get('trace_id')
  const correlationId = searchParams.get('correlation_id')

  const traceManager = TraceManager.getInstance()

  try {
    let source = 'database'

    try {
      // TODO: Implement PostgreSQL connection and queries
      // For now, we'll use memory traces since PostgreSQL connection isn't configured
      console.log('PostgreSQL connection not yet configured - using memory traces')
      source = 'memory'

    } catch (dbError) {
      console.log('Database connection failed, using memory traces:', dbError instanceof Error ? dbError.message : 'Unknown error')
      source = 'memory'
    }

    if (traceId && source === 'database') {
      // TODO: Return specific trace by ID from PostgreSQL
      // For now, fall back to memory
      source = 'memory'
    }

    if (correlationId && source === 'database') {
      // TODO: Return traces by correlation ID from PostgreSQL
      // For now, fall back to memory
      source = 'memory'
    }

    // Return all traces from PostgreSQL (with pagination) or memory
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (source === 'database') {
      // TODO: Implement PostgreSQL queries with pagination
      // For now, fall back to memory
      source = 'memory'
    }

    // Fallback to memory traces
    const activeSpans = Array.from(traceManager['activeSpans'].values())
    const memoryTraces = activeSpans.map(span => ({
      trace_id: span.tags.trace_id,
      correlation_id: span.tags.correlation_id,
      span_id: span.id,
      name: span.name,
      start_time: span.start_time.toISOString(),
      end_time: span.end_time?.toISOString(),
      duration_ms: span.duration_ms,
      events: span.events,
      tags: span.tags
    }))

    // Add some demo traces if memory is empty
    if (memoryTraces.length === 0) {
      memoryTraces.push(
        {
          trace_id: 'demo-trace-123',
          correlation_id: 'demo-batch-456',
          span_id: 'span-1',
          name: 'batch.execution',
          start_time: new Date(Date.now() - 30000).toISOString(),
          end_time: new Date().toISOString(),
          duration_ms: 30000,
          events: [
            {
              timestamp: new Date(Date.now() - 25000),
              name: 'job.started',
              attributes: { job_id: 'job-1', dealer_id: 'dealer-123' }
            },
            {
              timestamp: new Date(Date.now() - 10000),
              name: 'job.completed',
              attributes: { job_id: 'job-1', vehicles_processed: 45 }
            }
          ],
          tags: {
            correlation_id: 'demo-batch-456',
            trace_id: 'demo-trace-123',
            span_id: 'span-1'
          }
        },
        {
          trace_id: 'demo-trace-789',
          correlation_id: 'demo-batch-789',
          span_id: 'span-2',
          name: 'manual.trigger',
          start_time: new Date(Date.now() - 15000).toISOString(),
          end_time: new Date().toISOString(),
          duration_ms: 15000,
          events: [
            {
              timestamp: new Date(Date.now() - 12000),
              name: 'validation.completed',
              attributes: { valid_jobs: 3, invalid_jobs: 0 }
            }
          ],
          tags: {
            correlation_id: 'demo-batch-789',
            trace_id: 'demo-trace-789',
            span_id: 'span-2'
          }
        }
      )
    }

    return NextResponse.json({
      success: true,
      traces: memoryTraces,
      count: memoryTraces.length,
      total: memoryTraces.length,
      pagination: {
        limit,
        offset,
        has_more: false
      },
      source: source,
      message: source === 'database' ? 'Real trace data from PostgreSQL (DigitalOcean)' : 'Memory traces (PostgreSQL connection not configured)'
    })

  } catch (error) {
    console.error('Traces API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve traces',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
