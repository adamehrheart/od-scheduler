import { v4 as uuidv4 } from 'uuid'
import { logInfo, logError } from '@adamehrheart/utils'

/**
 * Distributed Tracing and Correlation ID Management
 *
 * Provides utilities for generating and managing correlation IDs,
 * trace IDs, and span IDs across the job execution lifecycle.
 */
export interface TraceContext {
  correlation_id: string
  trace_id: string
  span_id: string
  parent_span_id?: string
  batch_id?: string
  user_id?: string
  request_id?: string
}

export interface Span {
  id: string
  name: string
  start_time: Date
  end_time?: Date
  duration_ms?: number
  tags: Record<string, string | number | boolean>
  events: SpanEvent[]
  parent_span_id?: string
}

export interface SpanEvent {
  timestamp: Date
  name: string
  attributes: Record<string, string | number | boolean>
}

/**
 * Trace Manager for distributed tracing
 */
export class TraceManager {
  private static instance: TraceManager
  private activeSpans: Map<string, Span> = new Map()

  static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager()
    }
    return TraceManager.instance
  }

  /**
   * Generate a new trace context for a job execution
   */
  generateTraceContext(batchId?: string, parentContext?: TraceContext): TraceContext {
    const correlationId = parentContext?.correlation_id || uuidv4()
    const traceId = parentContext?.trace_id || uuidv4()
    const spanId = uuidv4()

    return {
      correlation_id: correlationId,
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: parentContext?.span_id,
      batch_id: batchId,
      user_id: parentContext?.user_id,
      request_id: parentContext?.request_id
    }
  }

  /**
   * Start a new span for timing operations
   */
  startSpan(name: string, context: TraceContext, tags: Record<string, string | number | boolean> = {}): string {
    const span: Span = {
      id: context.span_id,
      name,
      start_time: new Date(),
      tags: {
        ...tags,
        correlation_id: context.correlation_id,
        trace_id: context.trace_id,
        span_id: context.span_id,
        parent_span_id: context.parent_span_id || '',
        batch_id: context.batch_id || '',
      },
      events: [],
      parent_span_id: context.parent_span_id
    }

    this.activeSpans.set(context.span_id, span)

    logInfo(`🔍 Started span: ${name}`, {
      span_id: context.span_id,
      correlation_id: context.correlation_id,
      trace_id: context.trace_id,
      tags
    })

    return context.span_id
  }

  /**
   * End a span and record its duration
   */
  endSpan(spanId: string, additionalTags: Record<string, string | number | boolean> = {}): Span | null {
    const span = this.activeSpans.get(spanId)
    if (!span) {
      logError(`Span not found: ${spanId}`)
      return null
    }

    span.end_time = new Date()
    span.duration_ms = span.end_time.getTime() - span.start_time.getTime()
    span.tags = { ...span.tags, ...additionalTags }

    this.activeSpans.delete(spanId)

    logInfo(`🔍 Ended span: ${span.name}`, {
      span_id: spanId,
      duration_ms: span.duration_ms,
      tags: span.tags
    })

    return span
  }

  /**
   * Add an event to a span
   */
  addSpanEvent(spanId: string, eventName: string, attributes: Record<string, string | number | boolean> = {}): void {
    const span = this.activeSpans.get(spanId)
    if (!span) {
      logError(`Span not found for event: ${spanId}`)
      return
    }

    const event: SpanEvent = {
      timestamp: new Date(),
      name: eventName,
      attributes
    }

    span.events.push(event)

    logInfo(`🔍 Span event: ${eventName}`, {
      span_id: spanId,
      span_name: span.name,
      attributes
    })
  }

  /**
   * Get all active spans for a trace
   */
  getActiveSpansForTrace(traceId: string): Span[] {
    return Array.from(this.activeSpans.values()).filter(span =>
      span.tags.trace_id === traceId
    )
  }

  /**
   * Get trace summary for monitoring
   */
  getTraceSummary(traceId: string): {
    trace_id: string
    correlation_id: string
    total_spans: number
    active_spans: number
    total_duration_ms: number
    spans: Array<{
      name: string
      duration_ms: number
      events_count: number
    }>
  } | null {
    const spans = this.getActiveSpansForTrace(traceId)
    if (spans.length === 0) return null

    const totalDuration = spans.reduce((sum, span) => sum + (span.duration_ms || 0), 0)
    const activeSpans = spans.filter(span => !span.end_time).length

    return {
      trace_id: traceId,
      correlation_id: spans[0]?.tags.correlation_id as string || '',
      total_spans: spans.length,
      active_spans: activeSpans,
      total_duration_ms: totalDuration,
      spans: spans.map(span => ({
        name: span.name,
        duration_ms: span.duration_ms || 0,
        events_count: span.events.length
      }))
    }
  }

  /**
   * Clean up old spans (memory management)
   */
  cleanupOldSpans(maxAgeMs: number = 300000): void { // 5 minutes default
    const now = new Date()
    const cutoff = new Date(now.getTime() - maxAgeMs)

    for (const [spanId, span] of this.activeSpans.entries()) {
      if (span.start_time < cutoff) {
        this.activeSpans.delete(spanId)
        logInfo(`🧹 Cleaned up old span: ${span.name}`, { span_id: spanId })
      }
    }
  }
}

/**
 * Decorator for automatic span creation around functions
 */
export function withSpan(spanName: string, tags: Record<string, string | number | boolean> = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const traceManager = TraceManager.getInstance()

      // Try to extract context from first argument or create new one
      let context: TraceContext
      if (args[0] && typeof args[0] === 'object' && args[0].correlation_id) {
        context = args[0]
      } else {
        context = traceManager.generateTraceContext()
      }

      const spanId = traceManager.startSpan(spanName, context, {
        ...tags,
        method: propertyName,
        class: target.constructor.name
      })

      try {
        const result = await method.apply(this, args)

        traceManager.addSpanEvent(spanId, 'method.completed', {
          success: true,
          result_type: typeof result
        })

        return result
             } catch (error) {
         const errorMessage = error instanceof Error ? error.message : String(error)
         const errorType = error instanceof Error ? error.constructor.name : 'UnknownError'

         traceManager.addSpanEvent(spanId, 'method.error', {
           error_message: errorMessage,
           error_type: errorType
         })
         throw error
      } finally {
        traceManager.endSpan(spanId)
      }
    }
  }
}

/**
 * Utility function to create a child span
 */
export function createChildSpan(parentContext: TraceContext, name: string, tags: Record<string, string | number | boolean> = {}): TraceContext {
  const traceManager = TraceManager.getInstance()

  const childContext: TraceContext = {
    ...parentContext,
    span_id: uuidv4(),
    parent_span_id: parentContext.span_id
  }

  traceManager.startSpan(name, childContext, tags)
  return childContext
}

/**
 * Utility function to extract trace context from headers
 */
export function extractTraceContextFromHeaders(headers: Record<string, string>): TraceContext | null {
  const correlationId = headers['x-correlation-id'] || headers['x-request-id']
  const traceId = headers['x-trace-id']
  const spanId = headers['x-span-id']

  if (!correlationId) return null

  return {
    correlation_id: correlationId,
    trace_id: traceId || correlationId,
    span_id: spanId || uuidv4(),
    parent_span_id: headers['x-parent-span-id'],
    batch_id: headers['x-batch-id'],
    user_id: headers['x-user-id'],
    request_id: headers['x-request-id']
  }
}

/**
 * Utility function to inject trace context into headers
 */
export function injectTraceContextIntoHeaders(context: TraceContext): Record<string, string> {
  return {
    'x-correlation-id': context.correlation_id,
    'x-trace-id': context.trace_id,
    'x-span-id': context.span_id,
    ...(context.parent_span_id && { 'x-parent-span-id': context.parent_span_id }),
    ...(context.batch_id && { 'x-batch-id': context.batch_id }),
    ...(context.user_id && { 'x-user-id': context.user_id }),
    ...(context.request_id && { 'x-request-id': context.request_id })
  }
}
