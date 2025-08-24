import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDbUpdate() {
    console.log('🧪 Testing database update logic...\n');

    try {
        // Find a vehicle that's in processing status
        const { data: vehicles, error: fetchError } = await supabase
            .from('vehicles')
            .select('dealer_id, vin, short_url_status, short_url')
            .eq('short_url_status', 'processing')
            .limit(1);

        if (fetchError) {
            throw new Error(`Failed to fetch vehicles: ${fetchError.message}`);
        }

        if (!vehicles || vehicles.length === 0) {
            console.log('❌ No vehicles in processing status found');
            return;
        }

        const vehicle = vehicles[0];
        console.log(`📋 Testing with vehicle: ${vehicle.vin}`);
        console.log(`   Dealer ID: ${vehicle.dealer_id}`);
        console.log(`   Current status: ${vehicle.short_url_status}`);
        console.log(`   Current short URL: ${vehicle.short_url || 'none'}`);

        // Test the database update logic
        const testShortUrl = 'https://rebrand.ly/test/123';
        const testRebrandlyId = 'test-id-123';

        console.log(`\n🔄 Testing database update...`);
        
        const { error: updateError } = await supabase
            .from('vehicles')
            .update({
                short_url: testShortUrl,
                rebrandly_id: testRebrandlyId,
                short_url_status: 'completed',
                short_url_last_attempt: new Date().toISOString()
            })
            .eq('dealer_id', vehicle.dealer_id)
            .eq('vin', vehicle.vin);

        if (updateError) {
            console.error('❌ Database update failed:', updateError);
            return;
        }

        console.log('✅ Database update successful!');

        // Verify the update
        const { data: updatedVehicle, error: verifyError } = await supabase
            .from('vehicles')
            .select('dealer_id, vin, short_url_status, short_url, rebrandly_id')
            .eq('dealer_id', vehicle.dealer_id)
            .eq('vin', vehicle.vin)
            .single();

        if (verifyError) {
            console.error('❌ Failed to verify update:', verifyError);
            return;
        }

        console.log(`\n✅ Verification successful:`);
        console.log(`   New status: ${updatedVehicle.short_url_status}`);
        console.log(`   New short URL: ${updatedVehicle.short_url}`);
        console.log(`   New Rebrandly ID: ${updatedVehicle.rebrandly_id}`);

        // Revert the test update
        console.log(`\n🔄 Reverting test update...`);
        
        const { error: revertError } = await supabase
            .from('vehicles')
            .update({
                short_url: vehicle.short_url,
                rebrandly_id: null,
                short_url_status: 'processing',
                short_url_last_attempt: new Date().toISOString()
            })
            .eq('dealer_id', vehicle.dealer_id)
            .eq('vin', vehicle.vin);

        if (revertError) {
            console.error('❌ Failed to revert update:', revertError);
        } else {
            console.log('✅ Test reverted successfully');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testDbUpdate();
