#!/usr/bin/env node

// Debug script to check job queue status
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

async function debugJobQueue() {
    console.log('🔍 Debugging job queue...\n');

    try {
        // Check all jobs
        const { data: allJobs, error: allJobsError } = await supabase
            .from('job_queue')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (allJobsError) {
            console.error('Error fetching all jobs:', allJobsError);
            return;
        }

        console.log(`📊 Total jobs in queue: ${allJobs?.length || 0}\n`);

        // Group by status
        const statusCounts = {};
        allJobs?.forEach(job => {
            statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
        });

        console.log('📈 Job status breakdown:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
        });

        console.log('\n🔍 Jobs by type:');
        const typeCounts = {};
        allJobs?.forEach(job => {
            typeCounts[job.job_type] = (typeCounts[job.job_type] || 0) + 1;
        });

        Object.entries(typeCounts).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });

        // Show recent URL shortening jobs
        console.log('\n🔗 Recent URL shortening jobs:');
        const urlShorteningJobs = allJobs?.filter(job => job.job_type === 'url_shortening').slice(0, 5);

        if (urlShorteningJobs?.length > 0) {
            urlShorteningJobs.forEach(job => {
                console.log(`  ID: ${job.id}`);
                console.log(`  Status: ${job.status}`);
                console.log(`  Attempts: ${job.attempts || 0}`);
                console.log(`  Created: ${job.created_at}`);
                console.log(`  Started: ${job.started_at || 'N/A'}`);
                console.log(`  Completed: ${job.completed_at || 'N/A'}`);
                if (job.error) {
                    console.log(`  Error: ${job.error}`);
                }
                console.log('');
            });
        } else {
            console.log('  No URL shortening jobs found');
        }

        // Check vehicles with processing status
        console.log('🚗 Vehicles with processing status:');
        const { data: processingVehicles, error: vehiclesError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status, short_url_attempts, short_url_last_attempt')
            .eq('short_url_status', 'processing');

        if (vehiclesError) {
            console.error('Error fetching processing vehicles:', vehiclesError);
        } else {
            console.log(`  Found ${processingVehicles?.length || 0} vehicles in processing status`);
            processingVehicles?.forEach(vehicle => {
                console.log(`    VIN: ${vehicle.vin}`);
                console.log(`    URL: ${vehicle.dealerurl}`);
                console.log(`    Attempts: ${vehicle.short_url_attempts || 0}`);
                console.log(`    Last attempt: ${vehicle.short_url_last_attempt || 'N/A'}`);
                console.log('');
            });
        }

    } catch (error) {
        console.error('Debug failed:', error);
    }
}

debugJobQueue();
