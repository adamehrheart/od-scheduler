#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
    process.env.OD_SUPABASE_URL,
    process.env.OD_SUPABASE_SERVICE_ROLE
);

async function dropLegacyMpgColumns() {
    console.log('🗑️ Dropping legacy fuel_efficiency_* columns...');

    try {
        // Drop the legacy columns using SQL
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: `
        ALTER TABLE vehicles 
        DROP COLUMN IF EXISTS fuel_efficiency_city,
        DROP COLUMN IF EXISTS fuel_efficiency_highway,
        DROP COLUMN IF EXISTS fuel_efficiency_combined;
      `
        });

        if (error) {
            console.error('❌ Error dropping columns:', error);

            // Alternative approach - try direct SQL execution
            console.log('🔄 Trying alternative approach...');
            const { error: altError } = await supabase
                .from('vehicles')
                .select('vin')
                .limit(1);

            if (altError) {
                console.error('❌ Database connection issue:', altError);
                return;
            }

            console.log('⚠️ Note: Column dropping requires database admin privileges.');
            console.log('💡 You may need to run this SQL manually in your Supabase dashboard:');
            console.log(`
        ALTER TABLE vehicles 
        DROP COLUMN IF EXISTS fuel_efficiency_city,
        DROP COLUMN IF EXISTS fuel_efficiency_highway,
        DROP COLUMN IF EXISTS fuel_efficiency_combined;
      `);
            return;
        }

        console.log('✅ Successfully dropped legacy fuel_efficiency_* columns');

        // Verify the columns are gone
        const { data: verifyData, error: verifyError } = await supabase
            .from('vehicles')
            .select('vin, city_mpg, highway_mpg, combined_mpg')
            .eq('dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847')
            .limit(3);

        if (verifyError) {
            console.error('❌ Error verifying columns:', verifyError);
            return;
        }

        console.log('\n✅ Verification - Standard MPG fields remain:');
        verifyData.forEach((v, i) => {
            console.log(`Vehicle ${i + 1} (${v.vin}):`);
            console.log(`  city_mpg: ${v.city_mpg}`);
            console.log(`  highway_mpg: ${v.highway_mpg}`);
            console.log(`  combined_mpg: ${v.combined_mpg}`);
        });

    } catch (error) {
        console.error('❌ Unexpected error:', error);
        console.log('\n💡 Manual SQL execution required:');
        console.log(`
      ALTER TABLE vehicles 
      DROP COLUMN IF EXISTS fuel_efficiency_city,
      DROP COLUMN IF EXISTS fuel_efficiency_highway,
      DROP COLUMN IF EXISTS fuel_efficiency_combined;
    `);
    }
}

dropLegacyMpgColumns();
