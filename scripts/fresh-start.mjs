#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { env } from '../dist/src/env.js';

const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

console.log('🧹 Starting Fresh Database Population...\n');

async function clearDatabase() {
    console.log('🗑️  Clearing existing data...');

    try {
        // Clear all tables in order (respecting foreign key constraints)
        const tables = [
            'vehicle_links',
            'job_queue',
            'vehicles'
        ];

        for (const table of tables) {
            console.log(`  Clearing ${table}...`);

            // For job_queue, clear all jobs regardless of status
            if (table === 'job_queue') {
                const { error } = await supabase
                    .from(table)
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000');

                if (error) {
                    console.error(`  ❌ Error clearing ${table}:`, error.message);
                } else {
                    console.log(`  ✅ Cleared all jobs from ${table} (pending, processing, failed, retry, completed)`);
                }
            } else {
                const { error } = await supabase
                    .from(table)
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all but keep structure

                if (error) {
                    console.error(`  ❌ Error clearing ${table}:`, error.message);
                } else {
                    console.log(`  ✅ Cleared ${table}`);
                }
            }
        }

        console.log('\n✅ Database cleared successfully!\n');

    } catch (error) {
        console.error('❌ Error clearing database:', error);
        process.exit(1);
    }
}

async function createFreshJobs() {
    console.log('🚀 Creating fresh jobs with enhanced system...\n');

    try {
        // Step 1: Create HomeNet SOAP job for RSM Honda (highest priority)
        const homenetJob = {
            job_type: 'homenet_feed',
            payload: {
                dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847', // RSM Honda
                rooftop_id: 'RSM_HONDA',
                environment: 'production'
            },
            max_attempts: 3,
            priority: 1, // Highest priority - runs first
            scheduled_at: new Date().toISOString() // Run immediately
        };

        const { data: homenetResult, error: homenetError } = await supabase
            .from('job_queue')
            .insert(homenetJob)
            .select()
            .single();

        if (homenetError) {
            console.error('❌ Error creating HomeNet job:', homenetError);
        } else {
            console.log('✅ Created HomeNet SOAP job for RSM Honda (Priority 1 - runs first)');
        }

        // Step 2: Create Dealer.com feed job (medium priority, runs after HomeNet)
        const dealerComJob = {
            job_type: 'dealer_com_feed',
            payload: {
                dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847', // RSM Honda
                dealer_url: 'https://www.rsmhonda.com',
                environment: 'production',
                skip_url_shortening: true // Disable URL shortening
            },
            max_attempts: 3,
            priority: 2, // Medium priority - runs after HomeNet
            scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Run 5 minutes after HomeNet
        };

        const { data: dealerComResult, error: dealerComError } = await supabase
            .from('job_queue')
            .insert(dealerComJob)
            .select()
            .single();

        if (dealerComError) {
            console.error('❌ Error creating Dealer.com job:', dealerComError);
        } else {
            console.log('✅ Created Dealer.com feed job (Priority 2 - runs 5 minutes after HomeNet)');
        }

        // Step 3: Create product detail scraping job (lower priority, runs after both feeds)
        const scrapingJob = {
            job_type: 'product_detail_scraping',
            payload: {
                dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847', // RSM Honda
                environment: 'production',
                skip_url_shortening: true // Disable URL shortening
            },
            max_attempts: 3,
            priority: 3, // Lower priority - runs after both feeds
            scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // Run 10 minutes after HomeNet
        };

        const { data: scrapingResult, error: scrapingError } = await supabase
            .from('job_queue')
            .insert(scrapingJob)
            .select()
            .single();

        if (scrapingError) {
            console.error('❌ Error creating scraping job:', scrapingError);
        } else {
            console.log('✅ Created product detail scraping job (Priority 3 - runs 10 minutes after HomeNet)');
        }

        console.log('\n🎯 Fresh jobs created with proper sequencing!\n');

    } catch (error) {
        console.error('❌ Error creating fresh jobs:', error);
        process.exit(1);
    }
}

async function showNextSteps() {
    console.log('📋 Next Steps:');
    console.log('==============');
    console.log('🎯 Jobs are now properly sequenced:');
    console.log('');
    console.log('1. HomeNet SOAP (Priority 1) - Runs immediately');
    console.log('   • Populates base vehicle data from SOAP API');
    console.log('   • Must complete before other jobs can run');
    console.log('');
    console.log('2. Dealer.com Feed (Priority 2) - Runs 5 minutes after HomeNet');
    console.log('   • Enhances data with additional dealer information');
    console.log('   • Depends on HomeNet completion');
    console.log('');
    console.log('3. Product Detail Scraping (Priority 3) - Runs 10 minutes after HomeNet');
    console.log('   • Extracts dealer URLs and enriches vehicle data');
    console.log('   • Depends on HomeNet completion');
    console.log('');
    console.log('📊 Monitor the process:');
    console.log('   npm run queue:status');
    console.log('   npm run queue:health:detailed');
    console.log('');
    console.log('🔗 URL shortening is DISABLED to stay within Rebrandly limits');
    console.log('📈 This will give us a clear picture of data quality and completeness');
}

async function main() {
    try {
        await clearDatabase();
        await createFreshJobs();
        await showNextSteps();

        console.log('\n🎉 Fresh start complete! Ready to test enhanced system.');

    } catch (error) {
        console.error('❌ Fresh start failed:', error);
        process.exit(1);
    }
}

main();
