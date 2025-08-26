import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
  try {
    console.log('🔍 Checking database constraints...');
    
    // Query to check for unique constraints
    const { data, error } = await supabase
      .rpc('get_table_constraints', { table_name: 'vehicles' });
    
    if (error) {
      console.log('❌ Error checking constraints:', error.message);
      
      // Try a different approach - check if we can insert duplicates
      console.log('\n📋 Testing duplicate insertion...');
      const testVehicle = {
        dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847',
        vin: '1HGCY1F30PA007520',
        make: 'Test',
        model: 'Test',
        year: 2023,
        price: 1000
      };
      
      const { error: insertError } = await supabase
        .from('vehicles')
        .insert(testVehicle);
      
      if (insertError) {
        console.log('✅ Unique constraint exists (insert blocked):', insertError.message);
      } else {
        console.log('❌ No unique constraint - duplicate inserted!');
      }
    } else {
      console.log('📋 Constraints found:', data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkConstraints();
