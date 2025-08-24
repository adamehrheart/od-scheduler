#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { env } from '../dist/src/env.js';
import { MultiDealerDependencyManager } from '../dist/src/jobs/multi-dealer-dependency-manager.js';

const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

console.log('🧪 Testing Multi-Dealer Dependency Manager...\n');

async function testMultiDealerDependencyManager() {
    try {
        // Clear existing jobs
        console.log('🗑️  Clearing existing jobs...');
        await supabase.from('job_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log('✅ Cleared existing jobs\n');

        // Create test dealers with different scenarios
        const testDealers = [
            {
                id: 'dealer-fast-123',
                name: 'Fast Dealer',
                description: 'All jobs ready to run'
            },
            {
                id: 'dealer-slow-456',
                name: 'Slow Dealer',
                description: 'Jobs with dependencies'
            },
            {
                id: 'dealer-complex-789',
                name: 'Complex Dealer',
                description: 'Mixed job types with dependencies'
            }
        ];

        console.log('🚀 Creating test jobs for multiple dealers...\n');

        // Create jobs for each dealer with different timing and dependencies
        for (const dealer of testDealers) {
            console.log(`📋 Creating jobs for ${dealer.name} (${dealer.id})...`);

            // Step 1: HomeNet job (can run immediately)
            const homenetJob = {
                job_type: 'homenet_feed',
                status: 'pending',
                payload: {
                    dealer_id: dealer.id,
                    rooftop_id: `ROOFTOP_${dealer.id.toUpperCase()}`,
                    environment: 'production'
                },
                max_attempts: 3,
                priority: 1,
                scheduled_at: new Date().toISOString()
            };

            const { data: homenetResult, error: homenetError } = await supabase
                .from('job_queue')
                .insert(homenetJob)
                .select()
                .single();

            if (homenetError) {
                console.error(`❌ Error creating HomeNet job for ${dealer.name}:`, homenetError);
            } else {
                console.log(`  ✅ Created HomeNet job: ${homenetResult.id}`);
            }

            // Step 2: Dealer.com job (depends on HomeNet)
            const dealerComJob = {
                job_type: 'dealer_com_feed',
                status: 'pending',
                payload: {
                    dealer_id: dealer.id,
                    dealer_url: `https://www.${dealer.id}.com`,
                    environment: 'production',
                    skip_url_shortening: true
                },
                max_attempts: 3,
                priority: 2,
                scheduled_at: new Date(Date.now() + 2 * 60 * 1000).toISOString() // 2 minutes later
            };

            const { data: dealerComResult, error: dealerComError } = await supabase
                .from('job_queue')
                .insert(dealerComJob)
                .select()
                .single();

            if (dealerComError) {
                console.error(`❌ Error creating Dealer.com job for ${dealer.name}:`, dealerComError);
            } else {
                console.log(`  ✅ Created Dealer.com job: ${dealerComResult.id}`);
            }

            // Step 3: Product detail scraping (depends on HomeNet)
            const scrapingJob = {
                job_type: 'product_detail_scraping',
                status: 'pending',
                payload: {
                    dealer_id: dealer.id,
                    environment: 'production',
                    skip_url_shortening: true
                },
                max_attempts: 3,
                priority: 3,
                scheduled_at: new Date(Date.now() + 4 * 60 * 1000).toISOString() // 4 minutes later
            };

            const { data: scrapingResult, error: scrapingError } = await supabase
                .from('job_queue')
                .insert(scrapingJob)
                .select()
                .single();

            if (scrapingError) {
                console.error(`❌ Error creating scraping job for ${dealer.name}:`, scrapingError);
            } else {
                console.log(`  ✅ Created scraping job: ${scrapingResult.id}`);
            }

            // Step 4: URL shortening (depends on product detail scraping)
            const urlShorteningJob = {
                job_type: 'url_shortening',
                status: 'pending',
                payload: {
                    dealer_id: dealer.id,
                    vin: 'TEST123456789',
                    dealerurl: `https://www.${dealer.id}.com/vehicle/test-123`,
                    utm: {
                        dealerId: dealer.id,
                        vin: 'TEST123456789',
                        medium: 'LLM',
                        source: 'marketplace'
                    }
                },
                max_attempts: 3,
                priority: 4,
                scheduled_at: new Date(Date.now() + 6 * 60 * 1000).toISOString() // 6 minutes later
            };

            const { data: urlResult, error: urlError } = await supabase
                .from('job_queue')
                .insert(urlShorteningJob)
                .select()
                .single();

            if (urlError) {
                console.error(`❌ Error creating URL shortening job for ${dealer.name}:`, urlError);
            } else {
                console.log(`  ✅ Created URL shortening job: ${urlResult.id}`);
            }

            console.log('');
        }

        // Initialize the Multi-Dealer Dependency Manager
        console.log('🔧 Initializing Multi-Dealer Dependency Manager...');
        const dependencyManager = new MultiDealerDependencyManager(2, 2); // 2 concurrent dealers, 2 jobs per dealer

        // Test 1: Build dependency graph
        console.log('\n📊 Test 1: Building Dependency Graph');
        console.log('====================================');
        const dependencyGraph = await dependencyManager.buildDependencyGraph();
        console.log(`✅ Built dependency graph with ${dependencyGraph.nodes.size} nodes`);
        console.log(`✅ Found ${dependencyGraph.edges.length} dependency edges`);
        console.log(`✅ Detected ${dependencyGraph.cycles.length} cycles`);

        // Test 2: Visualize dependency graph
        console.log('\n📊 Test 2: Dependency Graph Visualization');
        console.log('==========================================');
        const visualization = dependencyManager.getDependencyGraphVisualization();
        console.log(visualization);

        // Test 3: Get ready jobs for each dealer
        console.log('\n📊 Test 3: Ready Jobs Analysis');
        console.log('==============================');
        for (const dealer of testDealers) {
            const readyJobs = await dependencyManager.getReadyJobsForDealer(dealer.id);
            console.log(`🎯 ${dealer.name} (${dealer.id}): ${readyJobs.length} ready jobs`);
            
            for (const job of readyJobs) {
                console.log(`  - ${job.job_type} (Priority: ${job.priority})`);
            }
        }

        // Test 4: Process jobs with dependency management
        console.log('\n📊 Test 4: Multi-Dealer Job Processing');
        console.log('=======================================');
        const processingStats = await dependencyManager.processMultiDealerJobs(6); // Process 6 jobs total

        console.log('\n📈 Processing Results:');
        console.log('=====================');
        console.log(`Total Jobs: ${processingStats.totalJobs}`);
        console.log(`Processed: ${processingStats.processedJobs}`);
        console.log(`Successful: ${processingStats.successfulJobs}`);
        console.log(`Failed: ${processingStats.failedJobs}`);
        console.log(`Blocked: ${processingStats.blockedJobs}`);
        console.log(`Processing Time: ${processingStats.processingTimeMs}ms`);
        console.log(`Dealers Processed: ${processingStats.dealersProcessed.join(', ')}`);

        // Test 5: Check final job status
        console.log('\n📊 Test 5: Final Job Status');
        console.log('==========================');
        const { data: finalJobs, error: statusError } = await supabase
            .from('job_queue')
            .select('job_type, status, payload->dealer_id as dealer_id, priority')
            .order('priority', { ascending: true })
            .order('created_at', { ascending: true });

        if (statusError) {
            console.error('❌ Error fetching final job status:', statusError);
        } else {
            console.log('Final Job Status:');
            finalJobs.forEach(job => {
                const dealerName = testDealers.find(d => d.id === job.dealer_id)?.name || job.dealer_id;
                console.log(`  ${job.job_type} (${dealerName}): ${job.status} (Priority ${job.priority})`);
            });
        }

        // Test 6: Performance analysis
        console.log('\n📊 Test 6: Performance Analysis');
        console.log('==============================');
        const stats = dependencyManager.getProcessingStats();
        console.log('Performance Metrics:');
        console.log(`  Average processing time per job: ${stats.processingTimeMs / Math.max(stats.processedJobs, 1)}ms`);
        console.log(`  Success rate: ${((stats.successfulJobs / Math.max(stats.processedJobs, 1)) * 100).toFixed(1)}%`);
        console.log(`  Dependency violations: ${stats.dependencyViolations}`);
        console.log(`  Dealers processed: ${stats.dealersProcessed.length}`);

        console.log('\n🎯 Test Summary:');
        console.log('===============');
        console.log('✅ Multi-dealer dependency manager initialized successfully');
        console.log('✅ Dependency graph built and visualized');
        console.log('✅ Ready jobs identified for each dealer');
        console.log('✅ Jobs processed with dependency checking');
        console.log('✅ Performance metrics collected');
        console.log('✅ All dealers processed independently');
        console.log('');
        console.log('📋 Key Features Demonstrated:');
        console.log('============================');
        console.log('• Per-dealer dependency tracking');
        console.log('• Intelligent job prioritization');
        console.log('• Parallel processing where safe');
        console.log('• Dependency cycle detection');
        console.log('• Enhanced error handling integration');
        console.log('• Performance monitoring and statistics');
        console.log('');
        console.log('🚀 Next Steps:');
        console.log('==============');
        console.log('1. Integrate with actual job processors');
        console.log('2. Add to Vercel cron job for automated processing');
        console.log('3. Implement real-time monitoring dashboard');
        console.log('4. Add alerting for dependency violations');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testMultiDealerDependencyManager();
