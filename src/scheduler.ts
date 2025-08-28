import { createSupabaseClientFromEnv, logInfo, logSuccess, logError, createPerformanceTimer } from '@adamehrheart/utils'
import { DealerComJobRunner } from './jobs/dealer-com.js'
// Legacy imports removed - files moved to legacy folder
import type { ScheduledJob, JobExecution, JobResult, RunJobsRequest, RunJobsResponse } from './types.js'
import { TimezoneAwareScheduler, type DealerTimezoneConfig, type SmartScheduleResult } from './timezone-scheduler.js'

/**
 * Check if a job should run based on its schedule and timezone
 */
function shouldRunJob(job: ScheduledJob, force: boolean = false, optimalRunTime?: Date): boolean {
  if (force) return true
  if (job.status !== 'active') return false

  const now = new Date()

  // If we have a timezone-calculated optimal run time, use that
  if (optimalRunTime) {
    // Allow 10-minute window around optimal time
    const windowStart = new Date(optimalRunTime.getTime() - (10 * 60 * 1000))
    const windowEnd = new Date(optimalRunTime.getTime() + (10 * 60 * 1000))

    return now >= windowStart && now <= windowEnd
  }

  // Fallback to legacy logic
  const lastRun = job.last_run ? new Date(job.last_run) : null
  if (!lastRun) return true

  const nextRun = calculateNextRun(lastRun, job.schedule)
  return now >= nextRun
}

/**
 * Calculate next run time based on schedule
 */
function calculateNextRun(lastRun: Date, schedule: string): Date {
  const nextRun = new Date(lastRun)

  switch (schedule) {
    case 'hourly':
      nextRun.setHours(nextRun.getHours() + 1)
      break
    case 'daily':
      nextRun.setDate(nextRun.getDate() + 1)
      break
    case 'weekly':
      nextRun.setDate(nextRun.getDate() + 7)
      break
    default:
      // Default to hourly if unknown schedule
      nextRun.setHours(nextRun.getHours() + 1)
      break
  }

  return nextRun
}

/**
 * Main Scheduler Service
 *
 * Orchestrates the execution of scheduled jobs for all dealers and platforms.
 * Manages job scheduling, execution, monitoring, and result tracking.
 */
export class SchedulerService {
  private supabase = createSupabaseClientFromEnv()

  /**
   * Run all scheduled jobs
   */
  async runJobs(request: RunJobsRequest = {}): Promise<RunJobsResponse> {
    const timer = createPerformanceTimer()

    try {
      logInfo('Starting scheduled job execution', request)

      // 1. Get all active jobs from PayloadCMS
      const jobs = await this.getActiveJobs(request)
      logInfo(`Found ${jobs.length} active jobs`)

      // 2. Generate timezone-aware schedule and filter jobs that should run
      const smartSchedules = await this.generateTimezoneAwareSchedule(jobs)
      const jobsToRun = this.filterJobsByOptimalTiming(jobs, smartSchedules, request.force)
      logInfo(`${jobsToRun.length} jobs need to be executed (timezone-aware filtering)`)

      if (jobsToRun.length === 0) {
        return {
          success: true,
          jobs_executed: 0,
          jobs_succeeded: 0,
          jobs_failed: 0,
          results: [],
          execution_time_ms: timer.getDurationMs()
        }
      }

      // 3. Execute jobs with priority-based scheduling and concurrency control
      const results = await this.executeJobsWithPriorityScheduling(jobsToRun, smartSchedules)

      // 4. Update job statuses in database
      await this.updateJobStatuses(results)

      // 5. Calculate summary
      const jobsSucceeded = results.filter(r => r.success).length
      const jobsFailed = results.filter(r => !r.success).length

      const response: RunJobsResponse = {
        success: true,
        jobs_executed: jobsToRun.length,
        jobs_succeeded: jobsSucceeded,
        jobs_failed: jobsFailed,
        results,
        execution_time_ms: timer.getDurationMs()
      }

      logSuccess('Scheduled job execution completed', {
        jobs_executed: jobsToRun.length,
        jobs_succeeded: jobsSucceeded,
        jobs_failed: jobsFailed,
        execution_time_ms: response.execution_time_ms
      })

      return response

    } catch (error) {
      logError('Scheduled job execution failed', error)

      return {
        success: false,
        jobs_executed: 0,
        jobs_succeeded: 0,
        jobs_failed: 0,
        results: [],
        execution_time_ms: timer.getDurationMs()
      }
    }
  }

  /**
   * Get active jobs from Supabase (synced from PayloadCMS)
   */
  private async getActiveJobs(request: RunJobsRequest): Promise<ScheduledJob[]> {
    try {
      // Query Supabase for active dealers with timezone and contact info (synced from PayloadCMS)
      const { data: dealers, error } = await this.supabase
        .from('dealers')
        .select(`
          id,
          name,
          slug,
          domain,
          status,
          api_config,
          contact_address,
          sftp_config_schedule_timezone,
          sftp_config_schedule_preferred_time,
          sftp_config_schedule_frequency
        `)
        .eq('status', 'active')

      if (error) {
        throw new Error(`Failed to fetch dealers: ${error.message}`)
      }

      logInfo(`Fetched ${dealers.length} active dealers from Supabase`)

      // Convert dealers to scheduled jobs
      const jobs: ScheduledJob[] = []

      for (const dealer of dealers) {
        // Filter by dealer_id if specified
        if (request.dealer_id && dealer.id !== request.dealer_id) {
          continue
        }

        // Get platforms for this dealer from api_config
        const platforms = dealer.api_config?.platforms || []

        for (const platform of platforms) {
          // Filter by platform if specified
          if (request.platform && platform !== request.platform) {
            continue
          }

          // Create job for this dealer-platform combination
          const job = this.createJobFromDealer(dealer, platform)
          if (job) {
            jobs.push(job)
          }
        }
      }

      return jobs

    } catch (error) {
      logError('Failed to get active jobs', error)
      return []
    }
  }

  /**
   * Create a scheduled job from dealer data
   */
  private createJobFromDealer(dealer: any, platform: string): ScheduledJob | null {
    const now = new Date()

    // Determine schedule based on platform
    let schedule: ScheduledJob['schedule'] = 'daily'
    switch (platform) {
      case 'homenet':
        schedule = 'daily'
        break
      case 'dealer.com':
        schedule = 'hourly'
        break
      case 'web_scraping':
        schedule = 'daily'
        break
      default:
        schedule = 'daily'
    }

    // Get platform-specific configuration from dealer
    let config = {}
    switch (platform) {
      case 'homenet':
        config = dealer.api_config?.homenet_config || {}
        break
      case 'dealer.com':
        config = dealer.api_config?.dealer_com_config || {}
        break
      case 'web_scraping':
        config = dealer.api_config?.web_scraping_config || {}
        break
    }

    return {
      id: `${dealer.id}_${platform}`,
      dealer_id: dealer.id,
      dealer_name: dealer.name,
      platform: platform as any,
      schedule,
      status: 'active',
      environment: 'production', // Default to production
      config, // This contains the connection details from dealer
      created_at: now,
      updated_at: now
    }
  }

  /**
   * Execute jobs with configurable concurrency control
   */
  private async executeJobs(jobs: ScheduledJob[]): Promise<JobResult[]> {
    const results: JobResult[] = []

    // Make concurrency configurable via Doppler environment variables
    const concurrencyLimit = parseInt(process.env.SCHEDULER_CONCURRENCY_LIMIT || '5')
    const maxConcurrentPremium = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_PREMIUM || '20')
    const maxConcurrentStandard = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_STANDARD || '12')
    const maxConcurrentEconomy = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_ECONOMY || '8')

    logInfo(`Using concurrency limits:`, {
      default: concurrencyLimit,
      premium: maxConcurrentPremium,
      standard: maxConcurrentStandard,
      economy: maxConcurrentEconomy
    })

    // Process jobs in batches
    for (let i = 0; i < jobs.length; i += concurrencyLimit) {
      const batch = jobs.slice(i, i + concurrencyLimit)

      const batchResults = await Promise.allSettled(
        batch.map(job => this.executeJob(job))
      )

      // Convert Promise.allSettled results to JobResult[]
      for (let j = 0; j < batch.length; j++) {
        const result = batchResults[j]
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          // Handle rejected promise
          const job = batch[j]
          results.push({
            job,
            execution: {
              id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              job_id: job.id,
              dealer_id: job.dealer_id,
              platform: job.platform,
              status: 'failed',
              start_time: new Date(),
              end_time: new Date(),
              vehicles_found: 0,
              vehicles_processed: 0,
              errors: [result.reason?.message || 'Unknown error'],
              performance_metrics: {
                duration_ms: 0,
                api_calls: 0,
                rate_limits_hit: 0
              },
              created_at: new Date()
            },
            success: false,
            error: result.reason?.message || 'Unknown error'
          })
        }
      }
    }

    return results
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: ScheduledJob): Promise<JobResult> {
    try {
      let execution: JobExecution

      // Route to appropriate job runner based on platform
      switch (job.platform) {
        case 'homenet':
          throw new Error('HomeNet platform archived - use dealer.com approach')

        case 'dealer.com':
          const dealerComRunner = new DealerComJobRunner(job)
          execution = await dealerComRunner.execute()
          break

        default:
          throw new Error(`Unsupported platform: ${job.platform}`)
      }

      return {
        job,
        execution,
        success: execution.status === 'success',
        error: execution.errors?.[0]
      }

    } catch (error) {
      logError(`Job execution failed for ${job.dealer_name} (${job.platform})`, error)

      return {
        job,
        execution: {
          id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          job_id: job.id,
          dealer_id: job.dealer_id,
          platform: job.platform,
          status: 'failed',
          start_time: new Date(),
          end_time: new Date(),
          vehicles_found: 0,
          vehicles_processed: 0,
          errors: [error instanceof Error ? error.message : String(error)],
          performance_metrics: {
            duration_ms: 0,
            api_calls: 0,
            rate_limits_hit: 0
          },
          created_at: new Date()
        },
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Update job statuses in database
   */
  private async updateJobStatuses(results: JobResult[]): Promise<void> {
    try {
      // Store job executions in database
      const executions = results.map(r => r.execution)

      const { error } = await this.supabase
        .from('job_executions')
        .insert(executions)

      if (error) {
        logError('Failed to store job executions', error)
      } else {
        logInfo(`Stored ${executions.length} job executions`)
      }

    } catch (error) {
      logError('Failed to update job statuses', error)
    }
  }

  /**
   * Process URL shortening jobs from the queue
   */
  async processUrlShorteningJobs(maxJobs: number = 10): Promise<{
    processed: number;
    success: number;
    failed: number;
    errors: string[];
  }> {
    const timer = createPerformanceTimer()

    try {
      logInfo('Starting URL shortening job processing', { maxJobs })

      const result = await this.processUrlShorteningJobs(maxJobs)

      logSuccess('URL shortening job processing completed', {
        processed: result.processed,
        success: result.success,
        failed: result.failed,
        execution_time_ms: timer.getDurationMs()
      })

      return result

    } catch (error) {
      logError('URL shortening job processing failed', error)

      return {
        processed: 0,
        success: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : String(error)]
      }
    }
  }

  /**
   * Process sitemap jobs from the queue
   */
  async processSitemapJobs(maxJobs: number = 10): Promise<{
    processed: number;
    success: number;
    failed: number;
    errors: string[];
  }> {
    const timer = createPerformanceTimer()

    try {
      logInfo('Starting sitemap job processing', { maxJobs })

      const result = await this.processSitemapJobs(maxJobs)

      logSuccess('Sitemap job processing completed', {
        processed: result.processed,
        success: result.success,
        failed: result.failed,
        execution_time_ms: timer.getDurationMs()
      })

      return result

    } catch (error) {
      logError('Sitemap job processing failed', error)

      return {
        processed: 0,
        success: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : String(error)]
      }
    }
  }

  /**
   * Process product detail scraping jobs from the queue
   */
  async processProductDetailScrapingJobs(maxJobs: number = 10): Promise<{
    processed: number;
    success: number;
    failed: number;
    errors: string[];
  }> {
    const timer = createPerformanceTimer()

    try {
      logInfo('Starting product detail scraping job processing', { maxJobs })

      const result = await this.processProductDetailScrapingJobs(maxJobs)

      logSuccess('Product detail scraping job processing completed', {
        processed: result.processed,
        success: result.success,
        failed: result.failed,
        execution_time_ms: timer.getDurationMs()
      })

      return result

    } catch (error) {
      logError('Product detail scraping job processing failed', error)

      return {
        processed: 0,
        success: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : String(error)]
      }
    }
  }

  /**
   * Generate timezone-aware schedule for all dealers
   */
  private async generateTimezoneAwareSchedule(jobs: ScheduledJob[]): Promise<Map<string, SmartScheduleResult>> {
    try {
      // Convert jobs to dealer timezone configs
      const dealerConfigs: DealerTimezoneConfig[] = []

      // Group jobs by dealer to avoid duplicates
      const dealerMap = new Map<string, ScheduledJob>()
      for (const job of jobs) {
        if (!dealerMap.has(job.dealer_id)) {
          dealerMap.set(job.dealer_id, job)
        }
      }

      for (const job of dealerMap.values()) {
        // We need to fetch full dealer data to get timezone and address
        const dealerData = await this.getDealerTimezoneInfo(job.dealer_id)
        if (dealerData) {
          dealerConfigs.push(dealerData)
        }
      }

      logInfo(`Generating timezone-aware schedule for ${dealerConfigs.length} unique dealers`)

      // Generate optimal schedules
      const schedules = TimezoneAwareScheduler.generateOptimalSchedule(dealerConfigs)

      // Convert to Map for easy lookup
      const scheduleMap = new Map<string, SmartScheduleResult>()
      for (const schedule of schedules) {
        scheduleMap.set(schedule.dealerId, schedule)
      }

      // Log timezone distribution
      const distribution = TimezoneAwareScheduler.calculateTimezoneDistribution(dealerConfigs)
      logInfo('Timezone distribution calculated:', distribution)

      return scheduleMap

    } catch (error) {
      logError('Failed to generate timezone-aware schedule, falling back to legacy scheduling', error)
      return new Map()
    }
  }

  /**
   * Get timezone information for a dealer
   */
  private async getDealerTimezoneInfo(dealerId: string): Promise<DealerTimezoneConfig | null> {
    try {
      const { data: dealer, error } = await this.supabase
        .from('dealers')
        .select(`
          id,
          name,
          contact_address,
          sftp_config_schedule_timezone,
          sftp_config_schedule_preferred_time,
          sftp_config_schedule_frequency
        `)
        .eq('id', dealerId)
        .single()

      if (error || !dealer) {
        logError(`Failed to fetch dealer timezone info for dealer ${dealerId}:`, error)
        return null
      }

      // Detect timezone if not explicitly set
      let timezone = dealer.sftp_config_schedule_timezone
      if (!timezone && dealer.contact_address) {
        timezone = TimezoneAwareScheduler.detectTimezoneFromAddress(dealer.contact_address)
      }
      if (!timezone) {
        timezone = 'America/New_York' // Default fallback
      }

      // Determine priority (for now, all are standard - we can enhance this later)
      const priority: 'premium' | 'standard' | 'economy' = 'standard'

      // Get frequency
      const frequency = dealer.sftp_config_schedule_frequency || 'daily'

      return {
        dealerId: dealer.id,
        dealerName: dealer.name,
        timezone,
        preferredTime: dealer.sftp_config_schedule_preferred_time || '01:00',
        address: dealer.contact_address,
        priority,
        frequency: frequency as any
      }

    } catch (error) {
      logError(`Exception getting dealer timezone info for ${dealerId}:`, error)
      return null
    }
  }

  /**
   * Filter jobs based on optimal timing from timezone-aware scheduling
   */
  private filterJobsByOptimalTiming(
    jobs: ScheduledJob[],
    smartSchedules: Map<string, SmartScheduleResult>,
    force: boolean = false
  ): ScheduledJob[] {
    const jobsToRun: ScheduledJob[] = []

    for (const job of jobs) {
      const schedule = smartSchedules.get(job.dealer_id)
      const optimalRunTime = schedule?.optimalRunTime

      // Use timezone-aware logic if available, fallback to legacy logic
      if (shouldRunJob(job, force, optimalRunTime)) {
        jobsToRun.push(job)

        if (schedule) {
          logInfo(`Job scheduled for dealer ${job.dealer_name}`, {
            dealerId: job.dealer_id,
            platform: job.platform,
            localTime: schedule.localRunTime,
            utcTime: schedule.optimalRunTime.toISOString(),
            timezone: schedule.timezone,
            priority: schedule.priority
          })
        }
      } else if (schedule) {
        logInfo(`Job NOT ready for dealer ${job.dealer_name} - outside optimal window`, {
          dealerId: job.dealer_id,
          currentTime: new Date().toISOString(),
          optimalTime: schedule.optimalRunTime.toISOString(),
          localTime: schedule.localRunTime
        })
      }
    }

    return jobsToRun
  }

  /**
   * Execute jobs with priority-based scheduling and intelligent concurrency control
   */
  private async executeJobsWithPriorityScheduling(
    jobs: ScheduledJob[],
    smartSchedules: Map<string, SmartScheduleResult>
  ): Promise<JobResult[]> {
    const results: JobResult[] = []

    // Get configurable concurrency limits from Doppler
    const maxConcurrentPremium = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_PREMIUM || '20')
    const maxConcurrentStandard = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_STANDARD || '12')
    const maxConcurrentEconomy = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_ECONOMY || '8')

    // Separate jobs by priority based on their smart schedule
    const premiumJobs: ScheduledJob[] = []
    const standardJobs: ScheduledJob[] = []
    const economyJobs: ScheduledJob[] = []

    for (const job of jobs) {
      const schedule = smartSchedules.get(job.dealer_id)
      const priority = schedule?.priority || 'standard'

      switch (priority) {
        case 'premium':
          premiumJobs.push(job)
          break
        case 'economy':
          economyJobs.push(job)
          break
        default:
          standardJobs.push(job)
      }
    }

    logInfo(`Executing jobs by priority:`, {
      premium: premiumJobs.length,
      standard: standardJobs.length,
      economy: economyJobs.length
    })

    // Execute premium jobs first with highest concurrency
    if (premiumJobs.length > 0) {
      logInfo(`Processing ${premiumJobs.length} premium jobs with max concurrency ${maxConcurrentPremium}`)
      const premiumResults = await this.executeBatchWithConcurrency(premiumJobs, maxConcurrentPremium)
      results.push(...premiumResults)
    }

    // Execute standard jobs next
    if (standardJobs.length > 0) {
      logInfo(`Processing ${standardJobs.length} standard jobs with max concurrency ${maxConcurrentStandard}`)
      const standardResults = await this.executeBatchWithConcurrency(standardJobs, maxConcurrentStandard)
      results.push(...standardResults)
    }

    // Execute economy jobs last with lower concurrency
    if (economyJobs.length > 0) {
      logInfo(`Processing ${economyJobs.length} economy jobs with max concurrency ${maxConcurrentEconomy}`)
      const economyResults = await this.executeBatchWithConcurrency(economyJobs, maxConcurrentEconomy)
      results.push(...economyResults)
    }

    return results
  }

  /**
   * Execute a batch of jobs with specific concurrency limit
   */
  private async executeBatchWithConcurrency(jobs: ScheduledJob[], concurrencyLimit: number): Promise<JobResult[]> {
    const results: JobResult[] = []

    // Process jobs in batches based on concurrency limit
    for (let i = 0; i < jobs.length; i += concurrencyLimit) {
      const batch = jobs.slice(i, i + concurrencyLimit)

      logInfo(`Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(jobs.length / concurrencyLimit)} with ${batch.length} jobs`)

      const batchResults = await Promise.allSettled(
        batch.map(job => this.executeJob(job))
      )

      // Convert Promise.allSettled results to JobResult[]
      for (let j = 0; j < batch.length; j++) {
        const result = batchResults[j]
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          // Handle rejected promise
          const job = batch[j]
          results.push({
            job,
            execution: {
              id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              job_id: job.id,
              dealer_id: job.dealer_id,
              platform: job.platform,
              status: 'failed',
              start_time: new Date(),
              end_time: new Date(),
              vehicles_found: 0,
              vehicles_processed: 0,
              errors: [result.reason?.message || 'Unknown error'],
              performance_metrics: {
                duration_ms: 0,
                api_calls: 0,
                rate_limits_hit: 0
              },
              created_at: new Date()
            },
            success: false,
            error: result.reason?.message || 'Unknown error'
          })
        }
      }

      // Small delay between batches to prevent overwhelming external services
      if (i + concurrencyLimit < jobs.length) {
        const delayMs = parseInt(process.env.SCHEDULER_BATCH_DELAY_MS || '1000')
        logInfo(`Waiting ${delayMs}ms before next batch`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    return results
  }
}



// Complex dependency management removed - using simple Dealer.com-first approach
