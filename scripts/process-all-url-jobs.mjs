#!/usr/bin/env node

// Process all pending URL shortening jobs in batches
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function processAllUrlJobs() {
    console.log('🔄 Processing all pending URL shortening jobs...\n');

    try {
        let totalProcessed = 0;
        let totalSuccess = 0;
        let totalFailed = 0;
        let batchSize = 10;
        let batchNumber = 1;

        while (true) {
            console.log(`📦 Processing batch ${batchNumber} (${batchSize} jobs)...`);
            
            // Call the scheduler API to process jobs
            const response = await fetch(`http://localhost:3003/api/jobs/url-shortening?limit=${batchSize}`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            totalProcessed += result.processed;
            totalSuccess += result.success;
            totalFailed += result.failed;
            
            console.log(`  ✅ Processed: ${result.processed}`);
            console.log(`  ✅ Success: ${result.success}`);
            console.log(`  ❌ Failed: ${result.failed}`);
            
            if (result.errors && result.errors.length > 0) {
                console.log(`  ⚠️ Errors: ${result.errors.length}`);
                result.errors.forEach(error => console.log(`    - ${error}`));
            }
            
            // If no jobs were processed, we're done
            if (result.processed === 0) {
                console.log('\n🎉 No more jobs to process!');
                break;
            }
            
            // Wait a bit between batches to be respectful
            await new Promise(resolve => setTimeout(resolve, 2000));
            batchNumber++;
        }
        
        console.log('\n📊 Final Summary:');
        console.log(`  📦 Total batches: ${batchNumber - 1}`);
        console.log(`  🔄 Total processed: ${totalProcessed}`);
        console.log(`  ✅ Total success: ${totalSuccess}`);
        console.log(`  ❌ Total failed: ${totalFailed}`);
        
        // Check final status
        console.log('\n🔍 Checking final vehicle status...');
        await checkFinalStatus();
        
    } catch (error) {
        console.error('❌ Error processing jobs:', error);
    }
}

async function checkFinalStatus() {
    try {
        // Get vehicles with short URLs
        const { data: vehiclesWithShortUrls, error: withShortUrlsError } = await supabase
            .from('vehicles')
            .select('vin, short_url, short_url_status')
            .not('short_url', 'is', null);

        if (withShortUrlsError) {
            throw new Error(`Failed to get vehicles with short URLs: ${withShortUrlsError.message}`);
        }

        // Get vehicles with completed status
        const { data: vehiclesCompleted, error: completedError } = await supabase
            .from('vehicles')
            .select('vin, short_url_status')
            .eq('short_url_status', 'completed');

        if (completedError) {
            throw new Error(`Failed to get completed vehicles: ${completedError.message}`);
        }

        // Get vehicles with pending status
        const { data: vehiclesPending, error: pendingError } = await supabase
            .from('vehicles')
            .select('vin, short_url_status')
            .eq('short_url_status', 'pending');

        if (pendingError) {
            throw new Error(`Failed to get pending vehicles: ${pendingError.message}`);
        }

        // Get vehicles with processing status
        const { data: vehiclesProcessing, error: processingError } = await supabase
            .from('vehicles')
            .select('vin, short_url_status')
            .eq('short_url_status', 'processing');

        if (processingError) {
            throw new Error(`Failed to get processing vehicles: ${processingError.message}`);
        }

        console.log(`\n📊 Final Vehicle Status:`);
        console.log(`  ✅ Vehicles with short URLs: ${vehiclesWithShortUrls?.length || 0}`);
        console.log(`  ✅ Completed status: ${vehiclesCompleted?.length || 0}`);
        console.log(`  ⏳ Pending status: ${vehiclesPending?.length || 0}`);
        console.log(`  🔄 Processing status: ${vehiclesProcessing?.length || 0}`);

        if (vehiclesWithShortUrls && vehiclesWithShortUrls.length > 0) {
            console.log('\n✅ Sample vehicles with short URLs:');
            vehiclesWithShortUrls.slice(0, 5).forEach(vehicle => {
                console.log(`  ${vehicle.vin}: ${vehicle.short_url}`);
            });
        }

    } catch (error) {
        console.error('❌ Error checking final status:', error);
    }
}

processAllUrlJobs();
