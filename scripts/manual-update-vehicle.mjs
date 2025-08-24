#!/usr/bin/env node

// Manually update a vehicle with a short URL
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function manualUpdateVehicle() {
    console.log('🔧 Manually updating vehicle with short URL...\n');

    try {
        const vin = '1HGCY2F68SA050897';
        const shortUrl = 'https://rebrand.ly/v1/llm/5eb88852-0/1hgcY2f6';
        const rebrandlyId = '3461e8d1ba59433189eb9b6e5c4ae9c9';

        // Update the vehicle
        const { data, error } = await supabase
            .from('vehicles')
            .update({
                short_url: shortUrl,
                rebrandly_id: rebrandlyId,
                short_url_status: 'completed',
                short_url_last_attempt: new Date().toISOString()
            })
            .eq('vin', vin)
            .select('vin, dealerurl, short_url, short_url_status, rebrandly_id');

        if (error) {
            console.error('Error updating vehicle:', error);
        } else {
            console.log('✅ Vehicle updated successfully:');
            console.log('  VIN:', data[0].vin);
            console.log('  Dealer URL:', data[0].dealerurl);
            console.log('  Short URL:', data[0].short_url);
            console.log('  Status:', data[0].short_url_status);
            console.log('  Rebrandly ID:', data[0].rebrandly_id);
        }

    } catch (error) {
        console.error('Update failed:', error);
    }
}

manualUpdateVehicle();
