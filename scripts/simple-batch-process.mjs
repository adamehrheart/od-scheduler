#!/usr/bin/env node

// Simple batch processing of URL shortening jobs
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

async function simpleBatchProcess() {
    console.log('🔄 Simple batch processing of URL shortening jobs...\n');

    try {
        // Get pending jobs
        const { data: jobs, error: fetchError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(5);

        if (fetchError) {
            throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
        }

        if (!jobs || jobs.length === 0) {
            console.log('No pending URL shortening jobs found');
            return;
        }

        console.log(`Found ${jobs.length} pending jobs`);

        let processed = 0;
        let success = 0;
        let failed = 0;

        for (const job of jobs) {
            try {
                console.log(`\n🔍 Processing job ${job.id} for VIN ${job.payload.vin}`);
                
                // Mark job as processing
                await supabase
                    .from('job_queue')
                    .update({
                        status: 'processing',
                        started_at: new Date().toISOString(),
                        attempts: (job.attempts || 0) + 1
                    })
                    .eq('id', job.id);

                // Check if vehicle already has a short URL
                const { data: vehicle } = await supabase
                    .from('vehicles')
                    .select('short_url, rebrandly_id, short_url_status')
                    .eq('dealer_id', job.payload.dealer_id)
                    .eq('vin', job.payload.vin)
                    .single();

                if (vehicle?.short_url || vehicle?.rebrandly_id) {
                    // Vehicle already has a short URL, mark job as completed
                    await supabase
                        .from('job_queue')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            result: { message: 'Vehicle already has short URL', existing: vehicle.short_url }
                        })
                        .eq('id', job.id);

                    processed++;
                    success++;
                    console.log(`✅ Job ${job.id}: Vehicle already has short URL`);
                    continue;
                }

                // Create short link using simple approach
                const rebrandlyApiKey = process.env.OD_REBRANDLY_API_KEY;
                if (!rebrandlyApiKey) {
                    throw new Error('Rebrandly API key not configured');
                }

                // Use more unique slashtag format to avoid conflicts
                const normalizedDealerId = job.payload.dealer_id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                const normalizedVin = job.payload.vin.toLowerCase().replace(/[^a-z0-9]/g, '');
                const slashtag = `v1/llm/${normalizedDealerId.substring(0, 6)}/${normalizedVin.substring(0, 12)}`;

                console.log(`Creating short link with slashtag: ${slashtag}`);

                const response = await fetch('https://api.rebrandly.com/v1/links', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': rebrandlyApiKey,
                    },
                    body: JSON.stringify({
                        destination: job.payload.dealerurl,
                        slashtag: slashtag,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Rebrandly API error: ${response.status} ${JSON.stringify(errorData)}`);
                }

                const linkData = await response.json();
                const fullShortUrl = linkData.shortUrl.startsWith('http') ? linkData.shortUrl : `https://${linkData.shortUrl}`;

                // Update vehicle with short URL
                await supabase
                    .from('vehicles')
                    .update({
                        short_url: fullShortUrl,
                        rebrandly_id: linkData.id,
                        short_url_status: 'completed',
                        short_url_last_attempt: new Date().toISOString()
                    })
                    .eq('dealer_id', job.payload.dealer_id)
                    .eq('vin', job.payload.vin);

                // Mark job as completed
                await supabase
                    .from('job_queue')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        result: {
                            shortUrl: fullShortUrl,
                            id: linkData.id
                        }
                    })
                    .eq('id', job.id);

                processed++;
                success++;
                console.log(`✅ Job ${job.id}: Short URL created successfully - ${fullShortUrl}`);

            } catch (error) {
                console.error(`❌ Job ${job.id}: Failed - ${error.message}`);
                
                // Mark job as failed
                await supabase
                    .from('job_queue')
                    .update({
                        status: 'failed',
                        completed_at: new Date().toISOString(),
                        error: error.message
                    })
                    .eq('id', job.id);

                processed++;
                failed++;
            }
        }

        console.log(`\n📊 Batch processing complete:`);
        console.log(`  📦 Processed: ${processed}`);
        console.log(`  ✅ Success: ${success}`);
        console.log(`  ❌ Failed: ${failed}`);

    } catch (error) {
        console.error('❌ Batch processing failed:', error);
    }
}

simpleBatchProcess();
