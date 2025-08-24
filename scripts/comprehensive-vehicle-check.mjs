#!/usr/bin/env node

// Comprehensive vehicle status check
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

async function comprehensiveVehicleCheck() {
    console.log('🔍 Comprehensive vehicle status check...\n');

    try {
        // Get total count
        const { count: totalCount, error: totalError } = await supabase
            .from('vehicles')
            .select('*', { count: 'exact', head: true });

        if (totalError) {
            throw new Error(`Failed to get total count: ${totalError.message}`);
        }

        console.log(`📊 Total vehicles in database: ${totalCount}`);

        // Get vehicles with dealer URLs
        const { data: vehiclesWithUrls, error: withUrlsError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url, short_url_status, short_url_attempts')
            .not('dealerurl', 'is', null);

        if (withUrlsError) {
            throw new Error(`Failed to get vehicles with URLs: ${withUrlsError.message}`);
        }

        console.log(`🔗 Vehicles with dealer URLs: ${vehiclesWithUrls?.length || 0}`);

        // Get vehicles without dealer URLs
        const { data: vehiclesWithoutUrls, error: withoutUrlsError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url, short_url_status')
            .is('dealerurl', null);

        if (withoutUrlsError) {
            throw new Error(`Failed to get vehicles without URLs: ${withoutUrlsError.message}`);
        }

        console.log(`❌ Vehicles without dealer URLs: ${vehiclesWithoutUrls?.length || 0}`);

        // Get vehicles with short URLs
        const { data: vehiclesWithShortUrls, error: withShortUrlsError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url, short_url_status')
            .not('short_url', 'is', null);

        if (withShortUrlsError) {
            throw new Error(`Failed to get vehicles with short URLs: ${withShortUrlsError.message}`);
        }

        console.log(`✅ Vehicles with short URLs: ${vehiclesWithShortUrls?.length || 0}`);

        // Get vehicles with pending short URL status
        const { data: vehiclesPending, error: pendingError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status, short_url_attempts')
            .eq('short_url_status', 'pending');

        if (pendingError) {
            throw new Error(`Failed to get pending vehicles: ${pendingError.message}`);
        }

        console.log(`⏳ Vehicles with pending short URL status: ${vehiclesPending?.length || 0}`);

        // Get vehicles with processing short URL status
        const { data: vehiclesProcessing, error: processingError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status, short_url_attempts')
            .eq('short_url_status', 'processing');

        if (processingError) {
            throw new Error(`Failed to get processing vehicles: ${processingError.message}`);
        }

        console.log(`🔄 Vehicles with processing short URL status: ${vehiclesProcessing?.length || 0}`);

        // Get vehicles with completed short URL status
        const { data: vehiclesCompleted, error: completedError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url, short_url_status')
            .eq('short_url_status', 'completed');

        if (completedError) {
            throw new Error(`Failed to get completed vehicles: ${completedError.message}`);
        }

        console.log(`✅ Vehicles with completed short URL status: ${vehiclesCompleted?.length || 0}`);

        // Get vehicles with failed short URL status
        const { data: vehiclesFailed, error: failedError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status, short_url_attempts')
            .eq('short_url_status', 'failed');

        if (failedError) {
            throw new Error(`Failed to get failed vehicles: ${failedError.message}`);
        }

        console.log(`❌ Vehicles with failed short URL status: ${vehiclesFailed?.length || 0}`);

        // Show some examples of each category
        console.log('\n📋 Examples:');
        
        if (vehiclesWithUrls && vehiclesWithUrls.length > 0) {
            console.log('\n🔗 Sample vehicles with dealer URLs:');
            vehiclesWithUrls.slice(0, 5).forEach(vehicle => {
                console.log(`  ${vehicle.vin}: ${vehicle.short_url_status || 'no status'} (attempts: ${vehicle.short_url_attempts || 0})`);
            });
        }

        if (vehiclesWithShortUrls && vehiclesWithShortUrls.length > 0) {
            console.log('\n✅ Sample vehicles with short URLs:');
            vehiclesWithShortUrls.slice(0, 5).forEach(vehicle => {
                console.log(`  ${vehicle.vin}: ${vehicle.short_url}`);
            });
        }

        if (vehiclesPending && vehiclesPending.length > 0) {
            console.log('\n⏳ Sample vehicles pending:');
            vehiclesPending.slice(0, 5).forEach(vehicle => {
                console.log(`  ${vehicle.vin}: attempts ${vehicle.short_url_attempts || 0}`);
            });
        }

        if (vehiclesProcessing && vehiclesProcessing.length > 0) {
            console.log('\n🔄 Sample vehicles processing:');
            vehiclesProcessing.slice(0, 5).forEach(vehicle => {
                console.log(`  ${vehicle.vin}: attempts ${vehicle.short_url_attempts || 0}`);
            });
        }

        // Summary
        console.log('\n📊 Summary:');
        console.log(`  Total vehicles: ${totalCount}`);
        console.log(`  With dealer URLs: ${vehiclesWithUrls?.length || 0}`);
        console.log(`  Without dealer URLs: ${vehiclesWithoutUrls?.length || 0}`);
        console.log(`  With short URLs: ${vehiclesWithShortUrls?.length || 0}`);
        console.log(`  Pending: ${vehiclesPending?.length || 0}`);
        console.log(`  Processing: ${vehiclesProcessing?.length || 0}`);
        console.log(`  Completed: ${vehiclesCompleted?.length || 0}`);
        console.log(`  Failed: ${vehiclesFailed?.length || 0}`);

    } catch (error) {
        console.error('❌ Error checking vehicles:', error);
    }
}

comprehensiveVehicleCheck();
