#!/usr/bin/env node

// Debug failed jobs
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

async function debugFailedJobs() {
    console.log('🔍 Debugging failed jobs...\n');

    try {
        // Get failed jobs
        const { data: jobs, error: jobsError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(5);

        if (jobsError || !jobs || jobs.length === 0) {
            console.log('No failed jobs found');
            return;
        }

        jobs.forEach((job, index) => {
            console.log(`Failed Job ${index + 1}:`);
            console.log('  ID:', job.id);
            console.log('  Status:', job.status);
            console.log('  Attempts:', job.attempts);
            console.log('  Error:', job.error);
            console.log('  VIN:', job.payload?.vin);
            console.log('  URL:', job.payload?.dealerurl);
            console.log('  Created:', job.created_at);
            console.log('  Started:', job.started_at);
            console.log('  Completed:', job.completed_at);
            console.log('');
        });

    } catch (error) {
        console.error('Debug failed:', error);
    }
}

debugFailedJobs();
