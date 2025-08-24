#!/usr/bin/env node

// Test a specific job manually
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;
const rebrandlyApiKey = process.env.OD_REBRANDLY_API_KEY;

if (!supabaseUrl || !supabaseKey || !rebrandlyApiKey) {
    console.error('Missing configuration');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSpecificJob() {
    console.log('🧪 Testing specific job manually...\n');

    try {
        // Get a specific job
        const { data: jobs, error: jobsError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'pending')
            .limit(1);

        if (jobsError || !jobs || jobs.length === 0) {
            console.log('No pending jobs found');
            return;
        }

        const job = jobs[0];
        const { payload } = job;

        console.log('Testing job:', {
            id: job.id,
            vin: payload.vin,
            dealerurl: payload.dealerurl
        });

        // Step 1: Verify URL
        console.log('\n🔍 Step 1: URL verification...');
        const url = payload.dealerurl;

        try {
            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
                },
            });

            console.log('URL verification result:', {
                status: response.status,
                ok: response.ok,
                finalUrl: response.url
            });

            if (!response.ok && response.status !== 403) {
                console.log('❌ URL verification failed');
                return;
            }
        } catch (error) {
            console.error('❌ URL verification failed:', error.message);
            return;
        }

        // Step 2: Create UTM parameters
        console.log('\n🔗 Step 2: Creating UTM parameters...');
        const utmParams = new URLSearchParams();
        if (payload.utm.dealerId) utmParams.set('utm_dealer', payload.utm.dealerId);
        if (payload.utm.vin) utmParams.set('utm_vin', payload.utm.vin);
        if (payload.utm.make) utmParams.set('utm_make', payload.utm.make);
        if (payload.utm.model) utmParams.set('utm_model', payload.utm.model);
        if (payload.utm.year) utmParams.set('utm_year', payload.utm.year);
        if (payload.utm.medium) utmParams.set('utm_medium', payload.utm.medium);
        if (payload.utm.source) utmParams.set('utm_source', payload.utm.source);

        const urlWithUtm = utmParams.toString() ? `${url}${url.includes('?') ? '&' : '?'}${utmParams.toString()}` : url;
        console.log('URL with UTM:', urlWithUtm);

        // Step 3: Generate slashtag
        console.log('\n🏷️ Step 3: Generating slashtag...');
        const normalizedDealerId = payload.utm.dealerId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const normalizedVin = payload.utm.vin.toLowerCase().replace(/[^a-z0-9]/g, '');
        const slashtag = `v1/llm/${normalizedDealerId.substring(0, 10)}/${normalizedVin.substring(0, 8)}`;
        console.log('Slashtag:', slashtag);

        // Step 4: Create Rebrandly link
        console.log('\n🔗 Step 4: Creating Rebrandly link...');
        const rebrandlyResponse = await fetch('https://api.rebrandly.com/v1/links', {
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

        if (!rebrandlyResponse.ok) {
            const errorData = await rebrandlyResponse.json().catch(() => ({}));
            console.error('❌ Rebrandly API error:', {
                status: rebrandlyResponse.status,
                error: errorData
            });
            return;
        }

        const linkData = await rebrandlyResponse.json();
        console.log('✅ Rebrandly API success:', {
            shortUrl: linkData.shortUrl,
            id: linkData.id,
            slashtag: linkData.slashtag
        });

        // Step 5: Update vehicle
        console.log('\n💾 Step 5: Updating vehicle...');
        const fullShortUrl = linkData.shortUrl.startsWith('http') ? linkData.shortUrl : `https://${linkData.shortUrl}`;

        const { error: updateError } = await supabase
            .from('vehicles')
            .update({
                short_url: fullShortUrl,
                rebrandly_id: linkData.id,
                short_url_status: 'completed',
                short_url_last_attempt: new Date().toISOString()
            })
            .eq('dealer_id', payload.dealer_id)
            .eq('vin', payload.vin);

        if (updateError) {
            console.error('❌ Vehicle update failed:', updateError);
        } else {
            console.log('✅ Vehicle updated successfully');
        }

        // Step 6: Mark job as completed
        console.log('\n✅ Step 6: Marking job as completed...');
        const { error: jobUpdateError } = await supabase
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

        if (jobUpdateError) {
            console.error('❌ Job update failed:', jobUpdateError);
        } else {
            console.log('✅ Job marked as completed');
        }

        console.log('\n🎉 Job processing completed successfully!');

    } catch (error) {
        console.error('❌ Job processing failed:', error);
    }
}

testSpecificJob();
