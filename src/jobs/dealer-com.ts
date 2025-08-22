import type { ScheduledJob, JobExecution } from '../types.js'
import { logInfo, logSuccess, logError, createPerformanceTimer } from '../utils.js'

/**
 * Dealer.com Job Runner
 * 
 * Executes Dealer.com API calls and scraping to fetch vehicle inventory
 * and posts the results to the Data API for ingestion.
 */
export class DealerComJobRunner {
  private job: ScheduledJob
  private execution: JobExecution

  constructor(job: ScheduledJob) {
    this.job = job
    this.execution = this.createExecution()
  }

  /**
   * Execute the Dealer.com job
   */
  async execute(): Promise<JobExecution> {
    const timer = createPerformanceTimer()
    
    try {
      logInfo(`Starting Dealer.com job for dealer: ${this.job.dealer_name}`, {
        dealer_id: this.job.dealer_id,
        platform: this.job.platform,
        environment: this.job.environment
      })

      // Update execution status to running
      this.execution.status = 'running'
      this.execution.start_time = new Date()

      // 1. Try Dealer.com API first
      let vehicles = await this.tryDealerComApi()
      
      // 2. Fallback to scraping if API returns no vehicles
      if (vehicles.length === 0) {
        logInfo('Dealer.com API returned no vehicles, trying scraping fallback')
        vehicles = await this.tryScrapingFallback()
      }
      
      // 3. Post vehicles to Data API
      const result = await this.postVehiclesToDataApi(vehicles)
      
      // 4. Update execution with success
      this.execution.status = 'success'
      this.execution.end_time = new Date()
      this.execution.vehicles_found = vehicles.length
      this.execution.vehicles_processed = result.processed || vehicles.length
      this.execution.performance_metrics = {
        duration_ms: timer.getDurationMs(),
        api_calls: 2, // Dealer.com API + Data API
        rate_limits_hit: 0
      }

      logSuccess(`Dealer.com job completed successfully`, {
        dealer_id: this.job.dealer_id,
        vehicles_found: vehicles.length,
        vehicles_processed: this.execution.vehicles_processed,
        duration_ms: this.execution.performance_metrics.duration_ms
      })

      return this.execution

    } catch (error) {
      // Update execution with failure
      this.execution.status = 'failed'
      this.execution.end_time = new Date()
      this.execution.errors = [this.formatError(error)]
      this.execution.performance_metrics = {
        duration_ms: timer.getDurationMs(),
        api_calls: 0,
        rate_limits_hit: 0
      }

      logError(`Dealer.com job failed for dealer: ${this.job.dealer_name}`, {
        dealer_id: this.job.dealer_id,
        error: this.formatError(error),
        duration_ms: this.execution.performance_metrics.duration_ms
      })

      return this.execution
    }
  }

  /**
   * Try to fetch vehicles using Dealer.com API
   */
  private async tryDealerComApi(): Promise<any[]> {
    const dealerUrl = this.job.config.api_endpoint
    if (!dealerUrl) {
      logInfo('No Dealer.com API endpoint configured, skipping API attempt')
      return []
    }

    logInfo(`Attempting Dealer.com API call`, {
      dealer_url: dealerUrl
    })

    try {
      const response = await fetch(dealerUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OpenDealer/1.0'
        }
      })

      if (!response.ok) {
        throw new Error(`Dealer.com API failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as any
      
      if (!data.vehicles || !Array.isArray(data.vehicles)) {
        logWarning('Dealer.com API returned invalid response format')
        return []
      }

      logSuccess(`Dealer.com API returned ${data.vehicles.length} vehicles`)
      return data.vehicles

    } catch (error) {
      logWarning('Dealer.com API call failed, will try scraping fallback', {
        error: this.formatError(error)
      })
      return []
    }
  }

  /**
   * Try to fetch vehicles using scraping fallback
   */
  private async tryScrapingFallback(): Promise<any[]> {
    const dealerUrl = this.job.config.api_endpoint
    if (!dealerUrl) {
      logInfo('No dealer URL configured for scraping fallback')
      return []
    }

    logInfo(`Attempting scraping fallback`, {
      dealer_url: dealerUrl
    })

    try {
      // This would integrate with your existing Apify scraper
      // For now, we'll simulate the scraping process
      const apifyApiUrl = process.env.APIFY_API_URL
      const apifyToken = process.env.APIFY_TOKEN

      if (!apifyApiUrl || !apifyToken) {
        logWarning('Apify configuration missing, cannot perform scraping')
        return []
      }

      // Trigger Apify actor for scraping
      const response = await fetch(`${apifyApiUrl}/acts/your-dealer-com-scraper/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apifyToken}`
        },
        body: JSON.stringify({
          input: {
            dealerUrl,
            dealerId: this.job.dealer_id,
            platform: 'dealer.com'
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Apify scraping failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json() as any
      
      // Wait for the scraping to complete and get results
      // This is a simplified version - you'd need to implement proper polling
      logInfo('Apify scraping job triggered', {
        run_id: result.data?.id
      })

      // For now, return empty array as placeholder
      return []

    } catch (error) {
      logWarning('Scraping fallback failed', {
        error: this.formatError(error)
      })
      return []
    }
  }

  /**
   * Post vehicles to Data API for ingestion
   */
  private async postVehiclesToDataApi(vehicles: any[]): Promise<any> {
    if (vehicles.length === 0) {
      logInfo('No vehicles to post to Data API')
      return { processed: 0 }
    }

    const dataApiUrl = process.env.OD_DATA_API_URL || 'https://od-data-api.vercel.app'
    const apiKey = process.env.OD_API_KEY_SECRET || ''

    logInfo(`Posting ${vehicles.length} vehicles to Data API`)

    const response = await fetch(`${dataApiUrl}/v1/vehicles/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Dealer-ID': this.job.dealer_id
      },
      body: JSON.stringify({
        vehicles,
        source: 'dealer.com',
        dealer_id: this.job.dealer_id
      })
    })

    if (!response.ok) {
      throw new Error(`Data API failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    
    logSuccess(`Successfully posted vehicles to Data API`, {
      vehicles_posted: vehicles.length,
      result: result
    })

    return result
  }

  /**
   * Create a new job execution record
   */
  private createExecution(): JobExecution {
    return {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      job_id: this.job.id,
      dealer_id: this.job.dealer_id,
      platform: this.job.platform,
      status: 'running',
      start_time: new Date(),
      vehicles_found: 0,
      vehicles_processed: 0,
      performance_metrics: {
        duration_ms: 0,
        api_calls: 0,
        rate_limits_hit: 0
      },
      created_at: new Date()
    }
  }

  /**
   * Format error for logging
   */
  private formatError(error: any): string {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    return JSON.stringify(error)
  }
}

// Helper function for warning logs
function logWarning(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  console.warn(`[${timestamp}] ⚠️ WARNING: ${message}`, data ? JSON.stringify(data, null, 2) : '')
}
