import { DealerComJobRunner } from '../dist/src/jobs/dealer-com.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.OD_SUPABASE_URL,
  process.env.OD_SUPABASE_SERVICE_ROLE
);

async function testRevolutionaryDealerCom() {
  try {
    console.log('🚀 Testing REVOLUTIONARY DealerComJobRunner with Master Inventory API!\n');

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

    // Create a mock job
    const mockJob = {
      id: 'test-revolutionary-' + Date.now(),
      dealer_id: dealer.id,
      type: 'dealer-com',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Run the REVOLUTIONARY Dealer.com job
    console.log('\n🚀 Running REVOLUTIONARY Dealer.com Master Inventory API job...');
    const runner = new DealerComJobRunner(mockJob);
    const result = await runner.execute();

    console.log('\n🎉 REVOLUTIONARY Job Results:');
    console.log('=============================');
    console.log(JSON.stringify(result, null, 2));

    // Check the results in the database
    console.log('\n🔍 Checking updated vehicles in database...');
    const { data: updatedVehicles, error: updateError } = await supabase
      .from('vehicles')
      .select('vin, make, model, transmission, drivetrain, body_style, dealer_page_url')
      .eq('dealer_id', dealer.id)
      .limit(5);

    if (updateError) {
      console.error('❌ Error checking updated vehicles:', updateError);
      return;
    }

    console.log('\n📊 Sample Updated Vehicle Data:');
    console.log('================================');
    updatedVehicles.forEach((v, index) => {
      console.log(`${index + 1}. ${v.vin}: ${v.make} ${v.model}`);
      console.log(`   Transmission: ${v.transmission || 'NULL'}`);
      console.log(`   Drivetrain: ${v.drivetrain || 'NULL'}`);
      console.log(`   Body Style: ${v.body_style || 'NULL'}`);
      console.log(`   Dealer URL: ${v.dealer_page_url || 'NULL'}`);
      console.log('');
    });

    // Summary
    const populatedFields = updatedVehicles.filter(v => 
      v.transmission || v.drivetrain || v.body_style
    ).length;

    console.log(`📈 REVOLUTIONARY Summary: ${populatedFields}/${updatedVehicles.length} vehicles have populated fields`);

  } catch (error) {
    console.error('❌ REVOLUTIONARY test failed:', error);
  }
}

testRevolutionaryDealerCom();
