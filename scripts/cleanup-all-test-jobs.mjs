#!/usr/bin/env node

// Clean up all test jobs and create fresh jobs for real vehicles
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

async function cleanupAllTestJobs() {
    console.log('🧹 Cleaning up all test jobs...\n');

    try {
        // Delete all existing URL shortening jobs
        const { error: deleteError } = await supabase
            .from('job_queue')
            .delete()
            .eq('job_type', 'url_shortening');

        if (deleteError) {
            console.error('Error deleting all jobs:', deleteError);
        } else {
            console.log('✅ Deleted all existing URL shortening jobs');
        }

        // Get vehicles with dealer URLs that need short URLs
        const { data: vehiclesWithUrls, error: vehiclesError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, dealer_id')
            .not('dealerurl', 'is', null)
            .is('short_url', null);

        if (vehiclesError) {
            console.error('Error fetching vehicles with URLs:', vehiclesError);
            return;
        }

        console.log(`Found ${vehiclesWithUrls?.length || 0} vehicles with dealer URLs that need short URLs`);

        // Create new jobs for these vehicles
        if (vehiclesWithUrls && vehiclesWithUrls.length > 0) {
            const jobs = vehiclesWithUrls.map(vehicle => ({
                job_type: 'url_shortening',
                status: 'pending',
                attempts: 0,
                max_attempts: 3,
                payload: {
                    dealer_id: vehicle.dealer_id,
                    vin: vehicle.vin,
                    dealerurl: vehicle.dealerurl,
                    utm: {
                        dealerId: vehicle.dealer_id,
                        vin: vehicle.vin,
                        medium: 'LLM',
                        source: 'scrape'
                    }
                },
                created_at: new Date().toISOString(),
                scheduled_at: new Date().toISOString()
            }));

            const { error: insertError } = await supabase
                .from('job_queue')
                .insert(jobs);

            if (insertError) {
                console.error('Error creating new jobs:', insertError);
            } else {
                console.log(`✅ Created ${jobs.length} new URL shortening jobs`);
            }
        }

        // Reset vehicle statuses
        const { error: resetError } = await supabase
            .from('vehicles')
            .update({
                short_url_status: 'pending',
                short_url_attempts: 0,
                short_url_last_attempt: null
            })
            .not('dealerurl', 'is', null)
            .is('short_url', null);

        if (resetError) {
            console.error('Error resetting vehicle statuses:', resetError);
        } else {
            console.log('✅ Reset vehicle statuses to pending');
        }

        console.log('\n🎯 Ready to process real vehicle URLs!');

    } catch (error) {
        console.error('Cleanup failed:', error);
    }
}

cleanupAllTestJobs();
