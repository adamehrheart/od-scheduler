#!/usr/bin/env node

import { MultiDealerDependencyManager } from '../dist/src/jobs/multi-dealer-dependency-manager.js';

console.log('🚀 Processing Multi-Dealer Jobs with Dependency Management...\n');

async function processMultiDealerJobs() {
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const limit = parseInt(args[0]) || 10;
        const maxConcurrentDealers = parseInt(args[1]) || 3;
        const maxConcurrentJobsPerDealer = parseInt(args[2]) || 2;

        console.log(`📊 Configuration:`);
        console.log(`  Job Limit: ${limit}`);
        console.log(`  Max Concurrent Dealers: ${maxConcurrentDealers}`);
        console.log(`  Max Jobs Per Dealer: ${maxConcurrentJobsPerDealer}`);
        console.log('');

        // Initialize the Multi-Dealer Dependency Manager
        const dependencyManager = new MultiDealerDependencyManager(
            maxConcurrentDealers,
            maxConcurrentJobsPerDealer
        );

        // Process jobs with dependency management
        console.log('🔄 Starting job processing...');
        const startTime = Date.now();
        
        const stats = await dependencyManager.processMultiDealerJobs(limit);
        
        const totalTime = Date.now() - startTime;

        // Display results
        console.log('\n📈 Processing Results:');
        console.log('=====================');
        console.log(`Total Jobs Requested: ${limit}`);
        console.log(`Jobs Processed: ${stats.processedJobs}`);
        console.log(`Successful Jobs: ${stats.successfulJobs}`);
        console.log(`Failed Jobs: ${stats.failedJobs}`);
        console.log(`Blocked Jobs: ${stats.blockedJobs}`);
        console.log(`Total Processing Time: ${totalTime}ms`);
        console.log(`Average Time Per Job: ${stats.processedJobs > 0 ? Math.round(totalTime / stats.processedJobs) : 0}ms`);
        console.log(`Dealers Processed: ${stats.dealersProcessed.length}`);
        console.log(`Dependency Violations: ${stats.dependencyViolations}`);

        if (stats.dealersProcessed.length > 0) {
            console.log('\n🏢 Dealers Processed:');
            console.log('===================');
            stats.dealersProcessed.forEach((dealerId, index) => {
                console.log(`  ${index + 1}. ${dealerId}`);
            });
        }

        // Performance analysis
        console.log('\n📊 Performance Analysis:');
        console.log('=======================');
        const successRate = stats.processedJobs > 0 ? (stats.successfulJobs / stats.processedJobs) * 100 : 0;
        const throughput = stats.processedJobs > 0 ? (stats.processedJobs / (totalTime / 1000)) : 0;
        
        console.log(`Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`Throughput: ${throughput.toFixed(2)} jobs/second`);
        console.log(`Concurrency Efficiency: ${((stats.processedJobs / limit) * 100).toFixed(1)}%`);

        // Dependency graph summary
        console.log('\n🔗 Dependency Analysis:');
        console.log('=====================');
        const dependencyGraph = await dependencyManager.buildDependencyGraph();
        console.log(`Dependency Nodes: ${dependencyGraph.nodes.size}`);
        console.log(`Dependency Edges: ${dependencyGraph.edges.length}`);
        console.log(`Dependency Cycles: ${dependencyGraph.cycles.length}`);

        if (dependencyGraph.cycles.length > 0) {
            console.log('\n⚠️  Warning: Dependency cycles detected!');
            console.log('This may indicate configuration issues.');
        }

        // Summary
        console.log('\n✅ Processing Summary:');
        console.log('====================');
        if (stats.successfulJobs === stats.processedJobs && stats.processedJobs > 0) {
            console.log('🎉 All processed jobs completed successfully!');
        } else if (stats.successfulJobs > 0) {
            console.log('✅ Some jobs completed successfully');
        } else {
            console.log('❌ No jobs completed successfully');
        }

        if (stats.blockedJobs > 0) {
            console.log(`⏳ ${stats.blockedJobs} jobs are blocked by dependencies`);
        }

        if (stats.dependencyViolations > 0) {
            console.log(`⚠️  ${stats.dependencyViolations} dependency violations detected`);
        }

        console.log('\n🚀 Next Steps:');
        console.log('==============');
        console.log('1. Monitor job queue for new pending jobs');
        console.log('2. Check for any failed jobs that need attention');
        console.log('3. Review dependency graph for optimization opportunities');
        console.log('4. Consider adjusting concurrency settings if needed');

        // Exit with appropriate code
        if (stats.failedJobs > 0) {
            console.log('\n⚠️  Some jobs failed - check logs for details');
            process.exit(1);
        } else {
            console.log('\n✅ All jobs processed successfully');
            process.exit(0);
        }

    } catch (error) {
        console.error('❌ Multi-dealer job processing failed:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT - shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM - shutting down gracefully...');
    process.exit(0);
});

processMultiDealerJobs();
