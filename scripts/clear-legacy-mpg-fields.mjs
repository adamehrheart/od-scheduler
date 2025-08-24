#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.OD_SUPABASE_URL,
  process.env.OD_SUPABASE_SERVICE_ROLE
);

async function clearLegacyMpgFields() {
  console.log('🧹 Clearing legacy fuel_efficiency_* fields...');
  
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .update({
        fuel_efficiency_city: null,
        fuel_efficiency_highway: null,
        fuel_efficiency_combined: null
      })
      .eq('dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847');

    if (error) {
      console.error('❌ Error clearing legacy fields:', error);
      return;
    }

    console.log('✅ Successfully cleared legacy fuel_efficiency_* fields');
    
    // Verify the fields are cleared
    const { data: verifyData, error: verifyError } = await supabase
      .from('vehicles')
      .select('vin, fuel_efficiency_city, fuel_efficiency_highway, fuel_efficiency_combined')
      .eq('dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847')
      .limit(3);

    if (verifyError) {
      console.error('❌ Error verifying fields:', verifyError);
      return;
    }

    console.log('\n✅ Verification - Legacy fields should be null:');
    verifyData.forEach((v, i) => {
      console.log(`Vehicle ${i+1} (${v.vin}):`);
      console.log(`  fuel_efficiency_city: ${v.fuel_efficiency_city}`);
      console.log(`  fuel_efficiency_highway: ${v.fuel_efficiency_highway}`);
      console.log(`  fuel_efficiency_combined: ${v.fuel_efficiency_combined}`);
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

clearLegacyMpgFields();
