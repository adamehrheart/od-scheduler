#!/usr/bin/env node

// Debug jobs with "Unknown error"
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

async function debugUnknownError() {
    console.log('🔍 Debugging jobs with "Unknown error"...\n');

    try {
        // Get jobs with "Unknown error"
        const { data: jobs, error: jobsError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'retry')
            .ilike('error', '%Unknown error%')
            .limit(3);

        if (jobsError || !jobs || jobs.length === 0) {
            console.log('No jobs with "Unknown error" found');
            return;
        }

        jobs.forEach((job, index) => {
            console.log(`Job ${index + 1}:`);
            console.log('  ID:', job.id);
            console.log('  Status:', job.status);
            console.log('  Attempts:', job.attempts);
            console.log('  Error:', job.error);
            console.log('  VIN:', job.payload?.vin);
            console.log('  URL:', job.payload?.dealerurl);
            console.log('');
        });

    } catch (error) {
        console.error('Debug failed:', error);
    }
}

debugUnknownError();
