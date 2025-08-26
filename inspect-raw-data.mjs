import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectRawData() {
  try {
    console.log('🔍 Inspecting raw data structure...');
    
    // Get a few vehicles with their raw data
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('vin, make, model, year, price, msrp, raw')
      .limit(3);
    
    if (error) {
      console.error('❌ Error fetching vehicles:', error.message);
      return;
    }
    
    console.log(`📋 Found ${vehicles.length} vehicles to inspect\n`);
    
    vehicles.forEach((vehicle, index) => {
      console.log(`🚗 Vehicle ${index + 1}: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.vin})`);
      console.log(`   Price: ${vehicle.price}, MSRP: ${vehicle.msrp}`);
      console.log(`   Raw data keys:`, Object.keys(vehicle.raw || {}));
      
      if (vehicle.raw) {
        console.log(`   Raw pricing data:`, JSON.stringify(vehicle.raw.pricing, null, 2));
        console.log(`   Raw tracking attributes:`, JSON.stringify(vehicle.raw.trackingAttributes?.slice(0, 5), null, 2));
        console.log(`   Raw packages:`, JSON.stringify(vehicle.raw.packages, null, 2));
        console.log(`   Raw featured promotion:`, vehicle.raw.featuredPromotion);
        console.log(`   Raw callouts:`, JSON.stringify(vehicle.raw.callout, null, 2));
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

inspectRawData();
