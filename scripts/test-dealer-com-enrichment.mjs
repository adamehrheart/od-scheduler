import { DealerComJobRunner } from '../dist/src/jobs/dealer-com.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.OD_SUPABASE_URL,
  process.env.OD_SUPABASE_SERVICE_ROLE
);

async function testDealerComEnrichment() {
  try {
    console.log('🧪 Testing Dealer.com enrichment for transmission, drivetrain, and body_style fields...\n');

    // Get RSM Honda dealer ID
    const { data: dealers, error: dealerError } = await supabase
      .from('dealers')
      .select('id, name, domain')
      .eq('name', 'RSM Honda')
      .limit(1);

    if (dealerError || !dealers || dealers.length === 0) {
      console.error('❌ Could not find RSM Honda dealer:', dealerError);
      return;
    }

    const dealer = dealers[0];
    console.log(`📍 Found dealer: ${dealer.name} (${dealer.id})`);

    // Get a few vehicles to test with
    const { data: vehicles, error: vehicleError } = await supabase
      .from('vehicles')
      .select('vin, make, model, transmission, drivetrain, body_style')
      .eq('dealer_id', dealer.id)
      .limit(3);

    if (vehicleError || !vehicles || vehicles.length === 0) {
      console.error('❌ Could not find vehicles:', vehicleError);
      return;
    }

    console.log(`📊 Found ${vehicles.length} vehicles to test with:`);
    vehicles.forEach(v => {
      console.log(`  - ${v.vin}: ${v.make} ${v.model}`);
      console.log(`    Current: transmission=${v.transmission}, drivetrain=${v.drivetrain}, body_style=${v.body_style}`);
    });

    // Create a mock job
    const mockJob = {
      id: 'test-job-' + Date.now(),
      dealer_id: dealer.id,
      type: 'dealer-com',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Run the Dealer.com job
    console.log('\n🚀 Running Dealer.com enrichment job...');
    const runner = new DealerComJobRunner(mockJob);
    const result = await runner.execute();

    console.log('\n✅ Job completed:', result);

    // Check the results
    console.log('\n🔍 Checking updated vehicles...');
    const { data: updatedVehicles, error: updateError } = await supabase
      .from('vehicles')
      .select('vin, make, model, transmission, drivetrain, body_style')
      .eq('dealer_id', dealer.id)
      .in('vin', vehicles.map(v => v.vin));

    if (updateError) {
      console.error('❌ Error checking updated vehicles:', updateError);
      return;
    }

    console.log('\n📊 Updated vehicle data:');
    updatedVehicles.forEach(v => {
      console.log(`  - ${v.vin}: ${v.make} ${v.model}`);
      console.log(`    Updated: transmission=${v.transmission}, drivetrain=${v.drivetrain}, body_style=${v.body_style}`);
    });

    // Summary
    const populatedFields = updatedVehicles.filter(v => 
      v.transmission || v.drivetrain || v.body_style
    ).length;

    console.log(`\n📈 Summary: ${populatedFields}/${updatedVehicles.length} vehicles have populated fields`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDealerComEnrichment();
