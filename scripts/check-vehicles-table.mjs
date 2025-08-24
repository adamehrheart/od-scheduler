#!/usr/bin/env node

// Check vehicles table for short URLs
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

async function checkVehiclesTable() {
    console.log('🔍 Checking vehicles table for short URLs...\n');

    try {
        // Check all vehicles with short URLs
        const { data: vehiclesWithShortUrls, error: shortUrlError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url, short_url_status, rebrandly_id')
            .not('short_url', 'is', null)
            .order('vin');

        if (shortUrlError) {
            console.error('Error fetching vehicles with short URLs:', shortUrlError);
        } else {
            console.log(`📊 Vehicles with short URLs: ${vehiclesWithShortUrls?.length || 0}`);
            vehiclesWithShortUrls?.forEach(vehicle => {
                console.log(`  ${vehicle.vin}:`);
                console.log(`    Dealer URL: ${vehicle.dealerurl || 'N/A'}`);
                console.log(`    Short URL: ${vehicle.short_url}`);
                console.log(`    Status: ${vehicle.short_url_status}`);
                console.log(`    Rebrandly ID: ${vehicle.rebrandly_id || 'N/A'}`);
                console.log('');
            });
        }

        // Check vehicles with dealer URLs but no short URLs
        const { data: vehiclesWithDealerUrls, error: dealerUrlError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status, short_url_attempts')
            .not('dealerurl', 'is', null)
            .is('short_url', null)
            .order('vin')
            .limit(10);

        if (dealerUrlError) {
            console.error('Error fetching vehicles with dealer URLs:', dealerUrlError);
        } else {
            console.log(`📊 Vehicles with dealer URLs but no short URLs: ${vehiclesWithDealerUrls?.length || 0}`);
            vehiclesWithDealerUrls?.forEach(vehicle => {
                console.log(`  ${vehicle.vin}:`);
                console.log(`    Dealer URL: ${vehicle.dealerurl}`);
                console.log(`    Status: ${vehicle.short_url_status}`);
                console.log(`    Attempts: ${vehicle.short_url_attempts || 0}`);
                console.log('');
            });
        }

        // Check total vehicles
        const { count: totalVehicles, error: totalError } = await supabase
            .from('vehicles')
            .select('*', { count: 'exact', head: true });

        if (totalError) {
            console.error('Error counting total vehicles:', totalError);
        } else {
            console.log(`📊 Total vehicles in database: ${totalVehicles || 0}`);
        }

    } catch (error) {
        console.error('Check failed:', error);
    }
}

checkVehiclesTable();
