#!/usr/bin/env node

/**
 * Test URL Shortening Job Processing
 * 
 * This script tests the URL shortening job processing directly
 * without going through the Vercel cron infrastructure.
 */

import { processUrlShorteningJobs } from './dist/jobs/url-shortening.js';

async function main() {
    console.log('🚀 Starting URL shortening job processing test...');
    
    try {
        // Process up to 5 URL shortening jobs
        const result = await processUrlShorteningJobs(5);
        
        console.log('✅ URL shortening job processing completed:', {
            processed: result.processed,
            success: result.success,
            failed: result.failed,
            errors: result.errors
        });
        
    } catch (error) {
        console.error('❌ URL shortening job processing failed:', error.message);
        process.exit(1);
    }
}

main();
