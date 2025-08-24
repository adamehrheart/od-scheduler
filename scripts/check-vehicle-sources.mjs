#!/usr/bin/env node

// Check vehicle sources and status
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

async function checkVehicleSources() {
    console.log('🔍 Checking vehicle sources and status...\n');

    try {
        // Check vehicles without dealer URLs
        const { data: vehiclesWithoutUrls, error: noUrlError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, make, model, year')
            .is('dealerurl', null)
            .limit(10);

        if (noUrlError) {
            console.error('Error fetching vehicles without URLs:', noUrlError);
        } else {
            console.log(`📊 Vehicles without dealer URLs: ${vehiclesWithoutUrls?.length || 0}`);
            vehiclesWithoutUrls?.forEach(vehicle => {
                console.log(`  ${vehicle.vin}: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
            });
        }

        // Check vehicles with dealer URLs
        const { data: vehiclesWithUrls, error: withUrlError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, make, model, year, short_url_status')
            .not('dealerurl', 'is', null)
            .limit(10);

        if (withUrlError) {
            console.error('Error fetching vehicles with URLs:', withUrlError);
        } else {
            console.log(`\n📊 Vehicles with dealer URLs: ${vehiclesWithUrls?.length || 0}`);
            vehiclesWithUrls?.forEach(vehicle => {
                console.log(`  ${vehicle.vin}: ${vehicle.year} ${vehicle.make} ${vehicle.model} (status: ${vehicle.short_url_status})`);
            });
        }

        // Check total vehicles
        const { count: totalVehicles, error: totalError } = await supabase
            .from('vehicles')
            .select('*', { count: 'exact', head: true });

        if (totalError) {
            console.error('Error counting total vehicles:', totalError);
        } else {
            console.log(`\n📊 Total vehicles in database: ${totalVehicles || 0}`);
        }

    } catch (error) {
        console.error('Check failed:', error);
    }
}

checkVehicleSources();
