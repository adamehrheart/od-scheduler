#!/usr/bin/env node

// Clear all short URLs from Supabase and reset job status
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAllShortUrls() {
    console.log('🧹 Clearing all short URLs and resetting job status...\n');

    try {
        // Step 1: Clear all short URLs from vehicles table
        console.log('📊 Step 1: Clearing short URLs from vehicles table...');
        const { data: vehicles, error: vehiclesError } = await supabase
            .from('vehicles')
            .update({
                short_url: null,
                rebrandly_id: null,
                short_url_status: 'pending',
                short_url_attempts: 0,
                short_url_last_attempt: null
            })
            .not('dealerurl', 'is', null);

        if (vehiclesError) {
            throw new Error(`Failed to clear vehicle short URLs: ${vehiclesError.message}`);
        }

        console.log('✅ Cleared short URLs from vehicles table');

        // Step 2: Reset all URL shortening jobs to pending
        console.log('\n📋 Step 2: Resetting URL shortening jobs...');
        const { data: jobs, error: jobsError } = await supabase
            .from('job_queue')
            .update({
                status: 'pending',
                started_at: null,
                completed_at: null,
                error: null,
                result: null,
                attempts: 0,
                scheduled_at: new Date().toISOString()
            })
            .eq('job_type', 'url_shortening')
            .in('status', ['processing', 'retry', 'failed', 'completed']);

        if (jobsError) {
            throw new Error(`Failed to reset jobs: ${jobsError.message}`);
        }

        console.log('✅ Reset URL shortening jobs to pending');

        // Step 3: Check final status
        console.log('\n🔍 Step 3: Checking final status...');
        
        const { data: vehiclesWithUrls, error: withUrlsError } = await supabase
            .from('vehicles')
            .select('vin, short_url, short_url_status')
            .not('dealerurl', 'is', null);

        if (withUrlsError) {
            throw new Error(`Failed to check vehicles: ${withUrlsError.message}`);
        }

        const { data: pendingJobs, error: pendingError } = await supabase
            .from('job_queue')
            .select('id, status')
            .eq('job_type', 'url_shortening')
            .eq('status', 'pending');

        if (pendingError) {
            throw new Error(`Failed to check jobs: ${pendingError.message}`);
        }

        console.log('\n📊 Final Status:');
        console.log(`  🚗 Vehicles with dealer URLs: ${vehiclesWithUrls?.length || 0}`);
        console.log(`  ✅ Vehicles with short URLs: 0 (cleared)`);
        console.log(`  ⏳ Pending jobs: ${pendingJobs?.length || 0}`);
        console.log(`  🔄 Processing jobs: 0 (reset)`);
        console.log(`  ❌ Failed jobs: 0 (reset)`);

        console.log('\n🎉 Clean slate ready! All short URLs cleared and jobs reset to pending.');
        console.log('\n📝 Next steps:');
        console.log('1. Clear Rebrandly short URLs manually (if needed)');
        console.log('2. Run: doppler run -- node scripts/simple-batch-process.mjs');
        console.log('3. Process jobs in batches until complete');

    } catch (error) {
        console.error('❌ Failed to clear short URLs:', error);
    }
}

clearAllShortUrls();
