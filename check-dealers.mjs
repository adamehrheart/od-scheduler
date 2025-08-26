import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDealers() {
  try {
    console.log('🔍 Checking available dealers...');

    // First, let's see what columns exist
    const { data: dealers, error } = await supabase
      .from('dealers')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error fetching dealers:', error.message);
      return;
    }

    if (dealers && dealers.length > 0) {
      console.log('📋 Dealer table columns:', Object.keys(dealers[0]));
      console.log('📋 Sample dealer data:', JSON.stringify(dealers[0], null, 2));
    }

    // Now get all dealers
    const { data: allDealers, error: allError } = await supabase
      .from('dealers')
      .select('*')
      .limit(10);

    if (allError) {
      console.error('❌ Error fetching all dealers:', allError.message);
      return;
    }

    console.log(`\n📋 Found ${allDealers.length} dealers:\n`);

    allDealers.forEach((dealer, index) => {
      console.log(`🏢 Dealer ${index + 1}:`);
      console.log(`   ID: ${dealer.id}`);
      console.log(`   Name: ${dealer.name}`);
      console.log(`   Domain: ${dealer.domain}`);
      console.log(`   Base URL: ${dealer.base_url}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDealers();
