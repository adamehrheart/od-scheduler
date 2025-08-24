#!/usr/bin/env node

// Clean up test data and keep only real vehicles
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

async function cleanupTestData() {
    console.log('🧹 Cleaning up test data...\n');

    try {
        // Find test vehicles (VINs that start with TEST, VH, WORKING, REAL, etc.)
        const { data: testVehicles, error: testError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status')
            .or('vin.like.TEST%,vin.like.VH%,vin.like.WORKING%,vin.like.REAL%');

        if (testError) {
            console.error('Error finding test vehicles:', testError);
            return;
        }

        console.log(`Found ${testVehicles?.length || 0} test vehicles to clean up:`);
        testVehicles?.forEach(vehicle => {
            console.log(`  ${vehicle.vin} - ${vehicle.dealerurl || 'no URL'} - ${vehicle.short_url_status}`);
        });

        if (testVehicles && testVehicles.length > 0) {
            // Delete test vehicles
            const testVins = testVehicles.map(v => v.vin);
            const { error: deleteError } = await supabase
                .from('vehicles')
                .delete()
                .in('vin', testVins);

            if (deleteError) {
                console.error('Error deleting test vehicles:', deleteError);
            } else {
                console.log(`✅ Deleted ${testVehicles.length} test vehicles`);
            }

            // Delete associated jobs
            const { error: jobDeleteError } = await supabase
                .from('job_queue')
                .delete()
                .in('payload->vin', testVins);

            if (jobDeleteError) {
                console.error('Error deleting test jobs:', jobDeleteError);
            } else {
                console.log('✅ Deleted associated test jobs');
            }
        }

        // Show remaining real vehicles
        const { data: realVehicles, error: realError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status')
            .not('vin', 'like', 'TEST%')
            .not('vin', 'like', 'VH%')
            .not('vin', 'like', 'WORKING%')
            .not('vin', 'like', 'REAL%')
            .order('vin');

        if (realError) {
            console.error('Error finding real vehicles:', realError);
        } else {
            console.log(`\n📊 Remaining real vehicles: ${realVehicles?.length || 0}`);
            realVehicles?.forEach(vehicle => {
                console.log(`  ${vehicle.vin} - ${vehicle.dealerurl || 'no URL'} - ${vehicle.short_url_status}`);
            });
        }

        console.log('\n🎯 Test data cleanup completed!');

    } catch (error) {
        console.error('Cleanup failed:', error);
    }
}

cleanupTestData();
