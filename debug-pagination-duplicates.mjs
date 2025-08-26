#!/usr/bin/env node

/**
 * Debug pagination duplicates by checking for duplicate VINs
 */

import { createClient } from '@supabase/supabase-js';

async function debugPaginationDuplicates() {
  console.log('🔍 Debugging pagination duplicates...\n');
  
  const supabase = createClient(
    process.env.OD_SUPABASE_URL,
    process.env.OD_SUPABASE_SERVICE_ROLE
  );

  try {
    // Get all vehicles with VINs
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('vin, make, model, year, updated_at')
      .order('updated_at', { ascending: true });

    if (error) {
      console.log('❌ Error fetching vehicles:', error.message);
      return;
    }

    console.log(`📋 Analyzing ${vehicles.length} vehicles for duplicates...\n`);

    // Check for duplicate VINs
    const vinCounts = {};
    const duplicates = [];

    vehicles.forEach(vehicle => {
      const vin = vehicle.vin;
      if (!vinCounts[vin]) {
        vinCounts[vin] = [];
      }
      vinCounts[vin].push(vehicle);
    });

    // Find duplicates
    Object.entries(vinCounts).forEach(([vin, instances]) => {
      if (instances.length > 1) {
        duplicates.push({ vin, instances });
      }
    });

    if (duplicates.length === 0) {
      console.log('✅ No duplicate VINs found!');
      console.log(`📊 Total unique vehicles: ${Object.keys(vinCounts).length}`);
      console.log(`📊 Total stored vehicles: ${vehicles.length}`);
    } else {
      console.log(`❌ Found ${duplicates.length} duplicate VINs:`);
      duplicates.forEach(({ vin, instances }) => {
        console.log(`\n🚗 VIN: ${vin}`);
                 instances.forEach((instance, index) => {
           console.log(`  ${index + 1}. ${instance.year} ${instance.make} ${instance.model} (${instance.updated_at})`);
         });
      });
    }

    // Show first 10 and last 10 vehicles to see if they're the same
    console.log('\n📋 First 10 vehicles:');
    vehicles.slice(0, 10).forEach((vehicle, index) => {
      console.log(`  ${index + 1}. ${vehicle.vin} - ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
    });

    console.log('\n📋 Last 10 vehicles:');
    vehicles.slice(-10).forEach((vehicle, index) => {
      console.log(`  ${index + 1}. ${vehicle.vin} - ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
    });

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

debugPaginationDuplicates().catch(console.error);
