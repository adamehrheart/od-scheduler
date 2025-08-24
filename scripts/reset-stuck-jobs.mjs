#!/usr/bin/env node

// Reset stuck jobs in the queue
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

async function resetStuckJobs() {
    console.log('🔄 Resetting stuck jobs...\n');

    try {
        // Reset jobs stuck in retry status
        const { data: retryJobs, error: retryError } = await supabase
            .from('job_queue')
            .update({
                status: 'pending',
                started_at: null,
                completed_at: null,
                error: null,
                scheduled_at: new Date().toISOString()
            })
            .eq('status', 'retry')
            .select('id, job_type, attempts');

        if (retryError) {
            console.error('Error resetting retry jobs:', retryError);
        } else {
            console.log(`✅ Reset ${retryJobs?.length || 0} jobs from retry to pending status`);
        }

        // Reset jobs stuck in processing status
        const { data: processingJobs, error: processingError } = await supabase
            .from('job_queue')
            .update({
                status: 'pending',
                started_at: null,
                completed_at: null,
                error: null,
                scheduled_at: new Date().toISOString()
            })
            .eq('status', 'processing')
            .select('id, job_type, attempts');

        if (processingError) {
            console.error('Error resetting processing jobs:', processingError);
        } else {
            console.log(`✅ Reset ${processingJobs?.length || 0} jobs from processing to pending status`);
        }

        // Reset vehicles stuck in processing status
        const { data: processingVehicles, error: vehiclesError } = await supabase
            .from('vehicles')
            .update({
                short_url_status: 'pending',
                short_url_last_attempt: null,
                short_url_attempts: 0
            })
            .eq('short_url_status', 'processing')
            .select('vin, dealerurl');

        if (vehiclesError) {
            console.error('Error resetting processing vehicles:', vehiclesError);
        } else {
            console.log(`✅ Reset ${processingVehicles?.length || 0} vehicles from processing to pending status`);
        }

        console.log('\n🎯 Ready to process jobs again!');

    } catch (error) {
        console.error('Reset failed:', error);
    }
}

resetStuckJobs();
