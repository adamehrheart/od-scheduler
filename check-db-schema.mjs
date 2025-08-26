#!/usr/bin/env node

/**
 * Check the actual database schema to see what columns exist
 */

import { createClient } from '@supabase/supabase-js';

async function checkDBSchema() {
  console.log('🔍 Checking database schema...\n');
  
  const supabase = createClient(
    process.env.OD_SUPABASE_URL,
    process.env.OD_SUPABASE_SERVICE_ROLE
  );

  try {
    // Get one vehicle to see all available columns
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ Error fetching vehicles:', error.message);
      return;
    }

    if (vehicles.length === 0) {
      console.log('❌ No vehicles found in database');
      return;
    }

    const vehicle = vehicles[0];
    console.log('📋 Available columns in vehicles table:');
    console.log('=' .repeat(50));
    
    Object.keys(vehicle).forEach(column => {
      const value = vehicle[column];
      const hasValue = value !== null && value !== undefined && value !== '';
      const status = hasValue ? '✅' : '❌';
      console.log(`${status} ${column}: ${value}`);
    });

    console.log('\n📊 Column Analysis:');
    console.log('=' .repeat(50));
    
    const columns = Object.keys(vehicle);
    const populatedColumns = columns.filter(col => {
      const value = vehicle[col];
      return value !== null && value !== undefined && value !== '';
    });

    console.log(`Total columns: ${columns.length}`);
    console.log(`Populated columns: ${populatedColumns.length}`);
    console.log(`Empty columns: ${columns.length - populatedColumns.length}`);
    console.log(`Data completeness: ${Math.round((populatedColumns.length / columns.length) * 100)}%`);

    console.log('\n❌ Empty columns:');
    columns.forEach(col => {
      const value = vehicle[col];
      const hasValue = value !== null && value !== undefined && value !== '';
      if (!hasValue) {
        console.log(`  - ${col}`);
      }
    });

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

checkDBSchema().catch(console.error);
