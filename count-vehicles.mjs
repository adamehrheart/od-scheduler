import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function countVehicles() {
  try {
    console.log('🔍 Counting vehicles in database...');

    // Get total count
    const { count, error } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Error counting vehicles:', error.message);
      return;
    }

    console.log(`📊 Total vehicles in database: ${count}`);

    // Get a sample of vehicles to show variety
    const { data: sampleVehicles, error: sampleError } = await supabase
      .from('vehicles')
      .select('vin, make, model, year, price, dealer_id')
      .limit(5);

    if (sampleError) {
      console.error('❌ Error fetching sample vehicles:', sampleError.message);
      return;
    }

    console.log('\n📋 Sample vehicles:');
    sampleVehicles.forEach((vehicle, index) => {
      console.log(`  ${index + 1}. ${vehicle.year} ${vehicle.make} ${vehicle.model} - $${vehicle.price} (${vehicle.vin})`);
    });

    // Check for any duplicate VINs within the same dealer
    const { data: duplicates, error: dupError } = await supabase
      .from('vehicles')
      .select('vin, dealer_id, count')
      .group('vin, dealer_id')
      .having('count(*)', 'gt', 1);

    if (dupError) {
      console.error('❌ Error checking for duplicates:', dupError.message);
    } else if (duplicates && duplicates.length > 0) {
      console.log(`\n⚠️  Found ${duplicates.length} potential duplicate VINs within dealers`);
    } else {
      console.log('\n✅ No duplicate VINs found within dealers');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

countVehicles();
