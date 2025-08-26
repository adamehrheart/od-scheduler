import { createSupabaseClientFromEnv, logInfo, logSuccess, logError, createPerformanceTimer } from '@adamehrheart/utils'
import { DealerComJobRunner } from './jobs/dealer-com.js'
// Legacy imports removed - files moved to legacy folder
import type { ScheduledJob, JobExecution, JobResult, RunJobsRequest, RunJobsResponse } from './types.js'

/**
 * Check if a job should run based on its schedule
 */
function shouldRunJob(job: ScheduledJob, force: boolean = false): boolean {
  if (force) return true
  if (job.status !== 'active') return false
  
  const now = new Date()
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

      // 2. Filter jobs that should run
      const jobsToRun = jobs.filter(job => shouldRunJob(job, request.force))
      logInfo(`${jobsToRun.length} jobs need to be executed`)

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

      // 3. Execute jobs in parallel (with concurrency limit)
      const results = await this.executeJobs(jobsToRun)

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
      // Query Supabase for active dealers with platforms (synced from PayloadCMS)
      const { data: dealers, error } = await this.supabase
        .from('dealers')
        .select(`
          id,
          name,
          slug,
          domain,
          status,
          api_config
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
   * Execute jobs with concurrency control
   */
  private async executeJobs(jobs: ScheduledJob[]): Promise<JobResult[]> {
    const results: JobResult[] = []
    const concurrencyLimit = 5 // Execute max 5 jobs simultaneously

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
}



// Complex dependency management removed - using simple Dealer.com-first approach
