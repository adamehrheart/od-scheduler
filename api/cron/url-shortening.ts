/**
 * URL Shortening Job Processor - Cron Endpoint
 * 
 * This endpoint is called by Vercel cron to process URL shortening jobs
 * from the job_queue table. It runs every 5 minutes to handle the
 * asynchronous URL shortening workflow.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SchedulerService } from '../../src/scheduler.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const startTime = Date.now()

    try {
        console.log('🚀 Starting URL shortening job processing...')

        // Initialize scheduler service
        const scheduler = new SchedulerService()

        // Process URL shortening jobs (max 20 jobs per run)
        const result = await scheduler.processUrlShorteningJobs(20)

        const duration = Date.now() - startTime

        console.log(`✅ URL shortening job processing completed in ${duration}ms`, {
            processed: result.processed,
            success: result.success,
            failed: result.failed,
            errors: result.errors.length
        })

        res.status(200).json({
            success: true,
            processed: result.processed,
            success_count: result.success,
            failed_count: result.failed,
            errors: result.errors,
            duration_ms: duration,
            timestamp: new Date().toISOString()
        })

    } catch (error) {
        const duration = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)

        console.error(`❌ URL shortening job processing failed after ${duration}ms:`, errorMessage)

        res.status(500).json({
            success: false,
            error: errorMessage,
            duration_ms: duration,
            timestamp: new Date().toISOString()
        })
    }
}

// Vercel cron configuration
export const config = {
    runtime: 'nodejs18.x',
}
