#!/usr/bin/env node

// Test Rebrandly API integration
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

async function testRebrandly() {
    console.log('🧪 Testing Rebrandly API integration...\n');

    try {
        // Get a vehicle with a dealer URL
        const { data: vehicles, error: vehiclesError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, dealer_id')
            .not('dealerurl', 'is', null)
            .limit(1);

        if (vehiclesError) {
            console.error('Error fetching vehicles:', vehiclesError);
            return;
        }

        if (!vehicles || vehicles.length === 0) {
            console.log('No vehicles with dealer URLs found');
            return;
        }

        const vehicle = vehicles[0];
        console.log('Testing with vehicle:', {
            vin: vehicle.vin,
            dealerurl: vehicle.dealerurl,
            dealer_id: vehicle.dealer_id
        });

        // Test URL verification
        console.log('\n🔍 Testing URL verification...');
        const url = vehicle.dealerurl;

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
        } catch (error) {
            console.error('URL verification failed:', error.message);
        }

        // Test Rebrandly API
        console.log('\n🔗 Testing Rebrandly API...');

        const utmParams = new URLSearchParams();
        utmParams.set('utm_dealer', vehicle.dealer_id);
        utmParams.set('utm_vin', vehicle.vin);
        utmParams.set('utm_medium', 'LLM');
        utmParams.set('utm_source', 'scrape');

        const urlWithUtm = `${url}?${utmParams.toString()}`;
        const slashtag = `v1/llm/test/${vehicle.vin.substring(0, 8)}`;

        console.log('Creating short link with:', {
            destination: urlWithUtm,
            slashtag: slashtag
        });

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
            console.error('Rebrandly API error:', {
                status: rebrandlyResponse.status,
                error: errorData
            });
        } else {
            const linkData = await rebrandlyResponse.json();
            console.log('✅ Rebrandly API success:', {
                shortUrl: linkData.shortUrl,
                id: linkData.id,
                slashtag: linkData.slashtag
            });
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testRebrandly();
