import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createMissingJobs() {
    console.log('🔍 Creating missing URL shortening jobs...\n');

    try {
        // Find all vehicles that have dealer URLs but no short URLs
        const { data: vehicles, error: fetchError } = await supabase
            .from('vehicles')
            .select('dealer_id, vin, dealerurl, short_url, short_url_status')
            .not('dealerurl', 'is', null)
            .or('short_url.is.null,short_url.eq.')
            .order('created_at', { ascending: true });

        if (fetchError) {
            throw new Error(`Failed to fetch vehicles: ${fetchError.message}`);
        }

        if (!vehicles || vehicles.length === 0) {
            console.log('✅ No vehicles need URL shortening jobs');
            return;
        }

        console.log(`📊 Found ${vehicles.length} vehicles that need URL shortening jobs`);

        // Check which vehicles already have jobs
        const { data: existingJobs, error: jobsError } = await supabase
            .from('job_queue')
            .select('payload')
            .eq('type', 'url_shortening')
            .in('status', ['pending', 'processing', 'retry']);

        if (jobsError) {
            throw new Error(`Failed to fetch existing jobs: ${jobsError.message}`);
        }

        // Create a set of VINs that already have jobs
        const existingJobVins = new Set();
        if (existingJobs) {
            existingJobs.forEach(job => {
                if (job.payload && job.payload.vin) {
                    existingJobVins.add(job.payload.vin);
                }
            });
        }

        console.log(`📋 Found ${existingJobVins.size} existing jobs`);

        // Filter vehicles that don't have jobs yet
        const vehiclesNeedingJobs = vehicles.filter(vehicle => !existingJobVins.has(vehicle.vin));

        console.log(`🎯 Creating jobs for ${vehiclesNeedingJobs.length} vehicles`);

        if (vehiclesNeedingJobs.length === 0) {
            console.log('✅ All vehicles already have jobs');
            return;
        }

        // Create jobs in batches
        const batchSize = 10;
        let createdCount = 0;

        for (let i = 0; i < vehiclesNeedingJobs.length; i += batchSize) {
            const batch = vehiclesNeedingJobs.slice(i, i + batchSize);
            
            const jobsToCreate = batch.map(vehicle => ({
                type: 'url_shortening',
                status: 'pending',
                payload: {
                    dealer_id: vehicle.dealer_id,
                    vin: vehicle.vin,
                    dealerurl: vehicle.dealerurl,
                    utm: {
                        source: 'opendealer',
                        medium: 'llm',
                        campaign: 'vehicle-detail'
                    }
                },
                max_attempts: 3,
                created_at: new Date().toISOString(),
                scheduled_at: new Date().toISOString()
            }));

            const { error: insertError } = await supabase
                .from('job_queue')
                .insert(jobsToCreate);

            if (insertError) {
                console.error(`❌ Failed to create jobs for batch ${i / batchSize + 1}:`, insertError);
                continue;
            }

            createdCount += batch.length;
            console.log(`✅ Created ${batch.length} jobs (${createdCount}/${vehiclesNeedingJobs.length})`);
        }

        console.log(`\n🎉 Successfully created ${createdCount} URL shortening jobs!`);

        // Update vehicle status for newly created jobs
        const vinsToUpdate = vehiclesNeedingJobs.map(v => v.vin);
        const { error: updateError } = await supabase
            .from('vehicles')
            .update({
                short_url_status: 'pending',
                short_url_last_attempt: new Date().toISOString()
            })
            .in('vin', vinsToUpdate);

        if (updateError) {
            console.error('⚠️ Failed to update vehicle status:', updateError);
        } else {
            console.log(`✅ Updated short_url_status to 'pending' for ${vinsToUpdate.length} vehicles`);
        }

    } catch (error) {
        console.error('❌ Error creating missing jobs:', error);
        process.exit(1);
    }
}

createMissingJobs();
