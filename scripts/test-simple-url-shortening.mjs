#!/usr/bin/env node

// Simple test of URL shortening function
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

async function testSimpleUrlShortening() {
    console.log('🧪 Testing simple URL shortening...\n');

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

        // Test Rebrandly API with simple URL
        console.log('\n🔗 Testing Rebrandly API with simple URL...');

        const rebrandlyApiKey = process.env.OD_REBRANDLY_API_KEY;
        if (!rebrandlyApiKey) {
            console.error('❌ Rebrandly API key not configured');
            return;
        }

        // Use simple slashtag format
        const normalizedDealerId = vehicle.dealer_id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const normalizedVin = vehicle.vin.toLowerCase().replace(/[^a-z0-9]/g, '');
        const slashtag = `v1/llm/${normalizedDealerId.substring(0, 10)}/${normalizedVin.substring(0, 8)}`;

        console.log('Creating short link with:', {
            destination: url,
            slashtag: slashtag
        });

        const response = await fetch('https://api.rebrandly.com/v1/links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': rebrandlyApiKey,
            },
            body: JSON.stringify({
                destination: url,
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

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testSimpleUrlShortening();
