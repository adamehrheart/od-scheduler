import type { ScheduledJob, JobExecution } from '../types.js'
import { logInfo, logSuccess, logError, createPerformanceTimer } from '../utils.js'
import { env } from '../env.js';

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
   * Try scraping fallback to get vehicle URLs
   */
  private async tryScrapingFallback(): Promise<any[]> {
    const dealerUrl = this.job.config.api_endpoint?.replace('/api/inventory', '') || 'https://www.rsmhonda.com'
    
    logInfo(`Attempting scraping fallback`, {
      dealer_url: dealerUrl
    })

    try {
      // Simple scraping to get vehicle detail URLs
      const response = await fetch(dealerUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch dealer website: ${response.status}`)
      }

      const html = await response.text()
      
      // Extract vehicle detail URLs from the HTML
      // This is a simplified approach - in production you'd use a proper HTML parser
      const vehicleUrls = this.extractVehicleUrls(html, dealerUrl)
      
      logInfo(`Found ${vehicleUrls.length} vehicle URLs from scraping`)
      
      // Convert URLs to vehicle objects with dealerurl field
      const vehicles = vehicleUrls.map((url, index) => ({
        vin: `SCRAPED_${index + 1}`, // Placeholder VIN
        make: 'Honda', // Default make for RSM Honda
        model: 'Vehicle',
        year: 2024,
        dealerurl: url,
        source: 'scrape'
      }))

      return vehicles

    } catch (error) {
      logWarning('Scraping fallback failed', {
        error: this.formatError(error)
      })
      return []
    }
  }

  /**
   * Extract vehicle detail URLs from HTML
   */
  private extractVehicleUrls(html: string, baseUrl: string): string[] {
    const urls: string[] = []
    
    // Look for common patterns in dealer websites
    const patterns = [
      /href=["']([^"']*\/inventory\/[^"']*\.html?)["']/gi,
      /href=["']([^"']*\/vehicles\/[^"']*)["']/gi,
      /href=["']([^"']*\/cars\/[^"']*)["']/gi,
      /href=["']([^"']*\/detail\/[^"']*)["']/gi
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        let url = match[1]
        
        // Convert relative URLs to absolute
        if (url.startsWith('/')) {
          url = `${baseUrl}${url}`
        } else if (!url.startsWith('http')) {
          url = `${baseUrl}/${url}`
        }
        
        // Only include URLs from the same domain
        if (url.includes(baseUrl.replace('https://', '').replace('http://', ''))) {
          urls.push(url)
        }
      }
    }

    // Remove duplicates and limit to reasonable number
    return [...new Set(urls)].slice(0, 50)
  }

  /**
   * Post vehicles to Data API for ingestion
   */
  private async postVehiclesToDataApi(vehicles: any[]): Promise<any> {
    if (vehicles.length === 0) {
      logInfo('No vehicles to post to Data API')
      return { processed: 0 }
    }

    const dataApiUrl = env.OD_DATA_API_URL
    const apiKey = env.OD_API_KEY_SECRET

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
