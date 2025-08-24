#!/usr/bin/env node

// Debug a specific job payload
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

async function debugJobPayload() {
    console.log('🔍 Debugging job payload...\n');

    try {
        // Get a specific URL shortening job
        const { data: jobs, error: jobsError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'pending')
            .limit(1);

        if (jobsError) {
            console.error('Error fetching jobs:', jobsError);
            return;
        }

        if (!jobs || jobs.length === 0) {
            console.log('No pending URL shortening jobs found');
            return;
        }

        const job = jobs[0];
        console.log('Job details:', {
            id: job.id,
            status: job.status,
            attempts: job.attempts,
            created_at: job.created_at,
            payload: job.payload
        });

        // Parse and validate the payload
        if (job.payload) {
            console.log('\n📋 Payload analysis:');
            console.log('  dealer_id:', job.payload.dealer_id);
            console.log('  vin:', job.payload.vin);
            console.log('  dealerurl:', job.payload.dealerurl);
            console.log('  utm:', job.payload.utm);

            // Check if all required fields are present
            const requiredFields = ['dealer_id', 'vin', 'dealerurl', 'utm'];
            const missingFields = requiredFields.filter(field => !job.payload[field]);

            if (missingFields.length > 0) {
                console.log('  ❌ Missing required fields:', missingFields);
            } else {
                console.log('  ✅ All required fields present');
            }
        } else {
            console.log('  ❌ No payload found');
        }

    } catch (error) {
        console.error('Debug failed:', error);
    }
}

debugJobPayload();
