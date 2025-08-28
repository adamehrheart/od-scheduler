import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logInfo, logError, logSuccess } from '@adamehrheart/utils';

/**
 * Event types for scheduler integration with Open Dealer event system
 */
export interface BaseEvent {
  type: string;
  id: string;
  timestamp: string;
  source: string;
  version: string;
  correlationId?: string;
  retryCount?: number;
}

export interface SchedulerJobStartedEvent extends BaseEvent {
  type: 'scheduler.job.started';
  data: {
    jobId: string;
    dealerId: string;
    dealerName: string;
    platform: string;
    schedule: {
      timezone: string;
      localTime: string;
      utcTime: string;
      priority: 'premium' | 'standard' | 'economy';
    };
    trigger: 'scheduled' | 'manual' | 'retry';
  };
}

export interface SchedulerJobCompletedEvent extends BaseEvent {
  type: 'scheduler.job.completed';
  data: {
    jobId: string;
    dealerId: string;
    dealerName: string;
    platform: string;
    execution: {
      startTime: string;
      endTime: string;
      durationMs: number;
      vehiclesFound: number;
      vehiclesProcessed: number;
      success: boolean;
    };
    performance: {
      apiCalls: number;
      rateLimitsHit: number;
      avgResponseTime: number;
    };
  };
}

export interface SchedulerJobFailedEvent extends BaseEvent {
  type: 'scheduler.job.failed';
  data: {
    jobId: string;
    dealerId: string;
    dealerName: string;
    platform: string;
    error: {
      message: string;
      code?: string;
      retryable: boolean;
    };
    execution: {
      startTime: string;
      endTime: string;
      durationMs: number;
      retryCount: number;
      nextRetryAt?: string;
    };
  };
}

export interface SchedulerBatchStartedEvent extends BaseEvent {
  type: 'scheduler.batch.started';
  data: {
    batchId: string;
    trigger: 'cron' | 'manual' | 'api';
    summary: {
      totalJobs: number;
      priorityDistribution: {
        premium: number;
        standard: number;
        economy: number;
      };
      timezoneDistribution: Record<string, number>;
    };
  };
}

export interface SchedulerBatchCompletedEvent extends BaseEvent {
  type: 'scheduler.batch.completed';
  data: {
    batchId: string;
    execution: {
      startTime: string;
      endTime: string;
      durationMs: number;
    };
    results: {
      totalJobs: number;
      successfulJobs: number;
      failedJobs: number;
      totalVehiclesProcessed: number;
    };
    performance: {
      averageJobDuration: number;
      concurrencyUtilization: number;
      throughputPerHour: number;
    };
  };
}

export type SchedulerEvent =
  | SchedulerJobStartedEvent
  | SchedulerJobCompletedEvent
  | SchedulerJobFailedEvent
  | SchedulerBatchStartedEvent
  | SchedulerBatchCompletedEvent;

/**
 * Event Publishing Configuration
 */
export interface EventClientConfig {
  redisUrl: string;
  eventChannel: string;
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Scheduler Event Client
 *
 * Publishes scheduler events to the Open Dealer event system via Redis.
 * Integrates with the CMS event monitoring and dead letter queue system.
 */
export class SchedulerEventClient {
  private redis: Redis | null = null;
  private config: EventClientConfig;
  private isConnected = false;

  constructor(config?: Partial<EventClientConfig>) {
    this.config = {
      redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
      eventChannel: process.env.EVENT_BUS_CHANNEL || 'opendealer_events',
      enabled: process.env.SCHEDULER_EVENTS_ENABLED !== 'false',
      maxRetries: parseInt(process.env.EVENT_BUS_MAX_RETRIES || '3'),
      retryDelayMs: parseInt(process.env.EVENT_BUS_RETRY_DELAY_MS || '2000'),
      ...config
    };

    if (this.config.enabled) {
      this.initializeRedis();
    } else {
      logInfo('Scheduler event publishing disabled via configuration');
    }
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis(this.config.redisUrl, {
        enableReadyCheck: false,
        maxRetriesPerRequest: this.config.maxRetries,
        lazyConnect: true
      });

      this.redis.on('error', (err: Error) => {
        logError('Scheduler Event Client - Redis connection error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        logInfo('Scheduler Event Client - Connected to Redis event bus');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        logSuccess('Scheduler Event Client - Redis connection ready');
        this.isConnected = true;
      });

      await this.redis.connect();

    } catch (error) {
      logError('Failed to initialize Redis for scheduler events:', error);
      this.isConnected = false;
    }
  }

  /**
   * Publish a scheduler event to the event bus
   */
  async publishEvent<T extends SchedulerEvent>(
    event: Omit<T, 'id' | 'timestamp' | 'source' | 'version' | 'retryCount'>
  ): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    if (!this.redis || !this.isConnected) {
      logError('Cannot publish event - Redis not connected');
      return null;
    }

    const fullEvent: T = {
      ...event,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      source: 'od-scheduler',
      version: '1.0',
      retryCount: 0
    } as T;

    try {
      const eventData = {
        event: fullEvent,
        options: {
          ttl: 86400, // 24 hours
          maxRetries: this.config.maxRetries,
          priority: 0
        }
      };

      // Publish to the main event channel
      await this.redis.lpush(this.config.eventChannel, JSON.stringify(eventData));

      logInfo(`📡 Published scheduler event: ${fullEvent.type} [${fullEvent.id}]`, {
        eventType: fullEvent.type,
        eventId: fullEvent.id,
        channel: this.config.eventChannel
      });

      return fullEvent.id;

    } catch (error) {
      logError('Failed to publish scheduler event:', error);
      return null;
    }
  }

  /**
   * Publish job started event
   */
  async publishJobStarted(data: {
    jobId: string;
    dealerId: string;
    dealerName: string;
    platform: string;
    schedule: {
      timezone: string;
      localTime: string;
      utcTime: string;
      priority: 'premium' | 'standard' | 'economy';
    };
    trigger: 'scheduled' | 'manual' | 'retry';
  }): Promise<string | null> {
    return this.publishEvent<SchedulerJobStartedEvent>({
      type: 'scheduler.job.started',
      data
    });
  }

  /**
   * Publish job completed event
   */
  async publishJobCompleted(data: {
    jobId: string;
    dealerId: string;
    dealerName: string;
    platform: string;
    execution: {
      startTime: string;
      endTime: string;
      durationMs: number;
      vehiclesFound: number;
      vehiclesProcessed: number;
      success: boolean;
    };
    performance: {
      apiCalls: number;
      rateLimitsHit: number;
      avgResponseTime: number;
    };
  }): Promise<string | null> {
    return this.publishEvent<SchedulerJobCompletedEvent>({
      type: 'scheduler.job.completed',
      data
    });
  }

  /**
   * Publish job failed event
   */
  async publishJobFailed(data: {
    jobId: string;
    dealerId: string;
    dealerName: string;
    platform: string;
    error: {
      message: string;
      code?: string;
      retryable: boolean;
    };
    execution: {
      startTime: string;
      endTime: string;
      durationMs: number;
      retryCount: number;
      nextRetryAt?: string;
    };
  }): Promise<string | null> {
    return this.publishEvent<SchedulerJobFailedEvent>({
      type: 'scheduler.job.failed',
      data
    });
  }

  /**
   * Publish batch started event
   */
  async publishBatchStarted(data: {
    batchId: string;
    trigger: 'cron' | 'manual' | 'api';
    summary: {
      totalJobs: number;
      priorityDistribution: {
        premium: number;
        standard: number;
        economy: number;
      };
      timezoneDistribution: Record<string, number>;
    };
  }): Promise<string | null> {
    return this.publishEvent<SchedulerBatchStartedEvent>({
      type: 'scheduler.batch.started',
      data
    });
  }

  /**
   * Publish batch completed event
   */
  async publishBatchCompleted(data: {
    batchId: string;
    execution: {
      startTime: string;
      endTime: string;
      durationMs: number;
    };
    results: {
      totalJobs: number;
      successfulJobs: number;
      failedJobs: number;
      totalVehiclesProcessed: number;
    };
    performance: {
      averageJobDuration: number;
      concurrencyUtilization: number;
      throughputPerHour: number;
    };
  }): Promise<string | null> {
    return this.publishEvent<SchedulerBatchCompletedEvent>({
      type: 'scheduler.batch.completed',
      data
    });
  }

  /**
   * Check connection status
   */
  isEventClientConnected(): boolean {
    return this.isConnected && this.config.enabled;
  }

  /**
   * Get configuration status
   */
  getConfig(): EventClientConfig {
    return { ...this.config };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        logInfo('Scheduler Event Client - Redis connection closed');
      } catch (error) {
        logError('Error closing Redis connection:', error);
      }
    }
  }
}
