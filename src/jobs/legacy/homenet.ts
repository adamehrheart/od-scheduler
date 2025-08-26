import type { ScheduledJob, JobExecution } from '../types.js'
import { logInfo, logSuccess, logError, createPerformanceTimer } from '@adamehrheart/utils'
import { env } from '../env.js'

/**
 * HomeNet Job Runner
 *
 * Executes HomeNet SOAP API calls to fetch vehicle inventory
 * and posts the results to the Data API for ingestion.
 */
export class HomeNetJobRunner {
  private job: ScheduledJob
  private execution: JobExecution

  constructor(job: ScheduledJob) {
    this.job = job
    this.execution = this.createExecution()
  }

  /**
   * Execute the HomeNet job
   */
  async execute(): Promise<JobExecution> {
    const timer = createPerformanceTimer()

    try {
      logInfo(`Starting HomeNet job for dealer: ${this.job.dealer_name}`, {
        dealer_id: this.job.dealer_id,
        platform: this.job.platform,
        environment: this.job.environment
      })

      // Update execution status to running
      this.execution.status = 'running'
      this.execution.start_time = new Date()

      // 1. Fetch vehicles from HomeNet SOAP API
      const vehicles = await this.fetchVehiclesFromHomeNet()

      // 2. Post vehicles to Data API
      const result = await this.postVehiclesToDataApi(vehicles)

      // 3. Update execution with success
      this.execution.status = 'success'
      this.execution.end_time = new Date()
      this.execution.vehicles_found = vehicles.length
      this.execution.vehicles_processed = result.processed || vehicles.length
      this.execution.performance_metrics = {
        duration_ms: timer.getDurationMs(),
        api_calls: 1, // HomeNet SOAP call
        rate_limits_hit: 0
      }

      logSuccess(`HomeNet job completed successfully`, {
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

      logError(`HomeNet job failed for dealer: ${this.job.dealer_name}`, {
        dealer_id: this.job.dealer_id,
        error: this.formatError(error),
        duration_ms: this.execution.performance_metrics.duration_ms
      })

      return this.execution
    }
  }

  /**
   * Fetch vehicles from HomeNet SOAP API
   */
  private async fetchVehiclesFromHomeNet(): Promise<any[]> {
    const soapTransformerUrl = env.OD_SOAP_TRANSFORMER_URL
    const integrationToken = env.OD_HOMENET_INTEGRATION_TOKEN
    const rooftopCollection = env.OD_HOMENET_ROOFTOP_COLLECTION

    if (!integrationToken || !rooftopCollection) {
      throw new Error('Missing HomeNet configuration: OD_HOMENET_INTEGRATION_TOKEN or OD_HOMENET_ROOFTOP_COLLECTION')
    }

    // Build the SOAP transformer URL
    const url = new URL('/v1/transform/homenet', soapTransformerUrl)

    // Add date filter for incremental updates (optional)
    const updatedSince = env.OD_UPDATED_SINCE || '2025-01-01T00:00:00Z'
    url.searchParams.set('updatedSince', updatedSince)

    logInfo(`Fetching vehicles from HomeNet SOAP API`, {
      url: url.toString(),
      rooftop_collection: rooftopCollection
    })

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OD_BEARER_TOKEN || ''}`
      }
    })

    if (!response.ok) {
      throw new Error(`HomeNet SOAP API failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as any

    if (!data.vehicles || !Array.isArray(data.vehicles)) {
      throw new Error('Invalid response from HomeNet SOAP API: missing vehicles array')
    }

    return data.vehicles
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

    // Add dealer_id to each vehicle
    const vehiclesWithDealerId = vehicles.map(vehicle => ({
      ...vehicle,
      dealer_id: this.job.dealer_id
    }))

    logInfo(`Posting ${vehiclesWithDealerId.length} vehicles to Data API`)

    const response = await fetch(`${dataApiUrl}/v1/vehicles/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Dealer-ID': this.job.dealer_id,
        'x-vercel-protection-bypass': env.VERCEL_DEPLOYMENT_PROTECTION_BYPASS || ''
      },
      body: JSON.stringify({
        vehicles: vehiclesWithDealerId,
        source: 'homenet',
        dealer_id: this.job.dealer_id
      })
    })

    // Add detailed logging for debugging
    logInfo(`Data API response status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text()
      logError(`Data API failed with status ${response.status}: ${errorText}`)
      throw new Error(`Data API failed: ${response.status} ${response.statusText} - ${errorText}`)
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

/**
 * Test function for HomeNet integration
 * This is used for testing purposes only
 */
export default async function runHomeNetJob(params: {
  dealerId: string
  rooftopId: string
  integrationToken: string
}): Promise<any> {
  console.log('🧪 Testing HomeNet integration...');

  // Create a mock job for testing
  const mockJob: any = {
    id: 'test_job',
    dealer_id: params.dealerId,
    dealer_name: 'RSM Honda',
    platform: 'homenet',
    environment: 'test'
  };

  try {
    const runner = new HomeNetJobRunner(mockJob);
    const result = await runner.execute();

    return {
      success: true,
      execution: result,
      vehicles: [], // Would be populated in real execution
      errors: []
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      vehicles: [],
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}
