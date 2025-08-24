#!/usr/bin/env node

// Debug a retry job to see the error
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

async function debugRetryJob() {
    console.log('🔍 Debugging retry job...\n');

    try {
        // Get a retry job
        const { data: jobs, error: jobsError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'retry')
            .limit(1);

        if (jobsError || !jobs || jobs.length === 0) {
            console.log('No retry jobs found');
            return;
        }

        const job = jobs[0];
        console.log('Retry job details:', {
            id: job.id,
            status: job.status,
            attempts: job.attempts,
            created_at: job.created_at,
            started_at: job.started_at,
            error: job.error,
            payload: job.payload
        });

        if (job.error) {
            console.log('\n❌ Job error:', job.error);
        }

    } catch (error) {
        console.error('Debug failed:', error);
    }
}

debugRetryJob();
