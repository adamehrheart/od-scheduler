#!/usr/bin/env node

/**
 * Clear vehicles table for fresh testing
 */

import { createClient } from '@supabase/supabase-js';

async function clearVehicles() {
  console.log('🧹 Clearing vehicles table...');

  const supabase = createClient(
    process.env.OD_SUPABASE_URL,
    process.env.OD_SUPABASE_SERVICE_ROLE
  );

  try {
    // Delete all vehicles
    const { count, error } = await supabase
      .from('vehicles')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.log('❌ Error clearing vehicles:', error.message);
      return;
    }

    console.log(`✅ Successfully deleted ${count} vehicles from the database`);
    console.log('📋 Vehicles table is now empty and ready for fresh testing');

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

clearVehicles().catch(console.error);
