/**
 * Debug Specific Job
 * 
 * Debug a specific job by ID to understand why it's failing
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugJob(jobId) {
    console.log(`🔍 Debugging job: ${jobId}`);

    try {
        // Get job details
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError) {
            console.error('Failed to fetch job:', jobError);
            return;
        }

        console.log('📋 Job details:', {
            id: job.id,
            job_type: job.job_type,
            status: job.status,
            attempts: job.attempts,
            created_at: job.created_at,
            started_at: job.started_at,
            completed_at: job.completed_at,
            error: job.error,
            payload: job.payload
        });

        if (job.job_type === 'url_shortening') {
            const { payload } = job;
            console.log('🔗 URL shortening job payload:', {
                dealer_id: payload.dealer_id,
                vin: payload.vin,
                dealerurl: payload.dealerurl,
                utm: payload.utm
            });

            // Test URL verification
            console.log('🔍 Testing URL verification...');
            const url = payload.dealerurl;

            try {
                const response = await fetch(url, {
                    method: 'HEAD',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
                    },
                });

                console.log('✅ URL verification result:', {
                    status: response.status,
                    ok: response.ok,
                    finalUrl: response.url
                });
            } catch (urlError) {
                console.error('❌ URL verification failed:', urlError.message);
            }

            // Test Rebrandly API
            console.log('🔗 Testing Rebrandly API...');
            const rebrandlyApiKey = process.env.OD_REBRANDLY_API_KEY;

            if (!rebrandlyApiKey) {
                console.error('❌ Rebrandly API key not configured');
                return;
            }

            try {
                const utmParams = new URLSearchParams();
                if (payload.utm.dealerId) utmParams.set('utm_dealer', payload.utm.dealerId);
                if (payload.utm.vin) utmParams.set('utm_vin', payload.utm.vin);
                if (payload.utm.medium) utmParams.set('utm_medium', payload.utm.medium);
                if (payload.utm.source) utmParams.set('utm_source', payload.utm.source);

                const urlWithUtm = utmParams.toString() ? `${url}${url.includes('?') ? '&' : '?'}${utmParams.toString()}` : url;

                // Use the same format as the working manual job
                const normalizedDealerId = payload.utm.dealerId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                const normalizedVin = payload.utm.vin.toLowerCase().replace(/[^a-z0-9]/g, '');
                const slashtag = `v1/llm/${normalizedDealerId.substring(0, 10)}/${normalizedVin.substring(0, 8)}`;

                console.log('Creating short link with:', {
                    destination: urlWithUtm,
                    slashtag: slashtag
                });

                const response = await fetch('https://api.rebrandly.com/v1/links', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': rebrandlyApiKey,
                    },
                    body: JSON.stringify({
                        destination: urlWithUtm,
                        slashtag: slashtag,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('❌ Rebrandly API error:', {
                        status: response.status,
                        error: errorData
                    });
                } else {
                    const linkData = await response.json();
                    console.log('✅ Rebrandly API success:', {
                        shortUrl: linkData.shortUrl,
                        id: linkData.id,
                        slashtag: linkData.slashtag
                    });
                }
            } catch (rebrandlyError) {
                console.error('❌ Rebrandly API request failed:', rebrandlyError.message);
            }
        }

    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

// Get job ID from command line argument
const jobId = process.argv[2];

if (!jobId) {
    console.log('Usage: node debug-specific-job.mjs <job-id>');
    console.log('Example: node debug-specific-job.mjs 37907aa2-baef-48d8-81aa-43d6307f5c82');
    process.exit(1);
}

debugJob(jobId);
