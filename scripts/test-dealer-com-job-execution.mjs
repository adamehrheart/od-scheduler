#!/usr/bin/env node

/**
 * Dealer.com Job Execution Test Utility
 * 
 * Tests the Dealer.com job execution functionality to ensure
 * proper vehicle data ingestion and database population.
 * Follows enterprise coding standards with comprehensive logging.
 * 
 * @author Open Dealer Team
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';

const supabaseConnectionUrl = process.env.OD_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.OD_SUPABASE_SERVICE_ROLE;
const dataApiBaseUrl = process.env.OD_DATA_API_URL || 'http://localhost:3002';
const schedulerApiUrl = process.env.OD_SCHEDULER_URL || 'http://localhost:3000';

if (!supabaseConnectionUrl || !supabaseServiceRoleKey) {
    console.error('❌ Missing required Supabase credentials');
    console.error('   Please set OD_SUPABASE_URL and OD_SUPABASE_SERVICE_ROLE environment variables');
    process.exit(1);
}

const databaseClient = createClient(supabaseConnectionUrl, supabaseServiceRoleKey);

/**
 * Retrieves current vehicle count from database
 * 
 * @returns {Promise<number>} Current number of vehicles in database
 * @throws {Error} When database query fails
 */
async function getCurrentVehicleCount() {
    const { count: vehicleCount, error: countError } = await databaseClient
        .from('vehicles')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        throw new Error(`Failed to get vehicle count: ${countError.message}`);
    }

    return vehicleCount || 0;
}

/**
 * Executes a Dealer.com job via the scheduler API
 * 
 * @param {boolean} forceExecution - Whether to force job execution regardless of schedule
 * @returns {Promise<object>} Job execution response
 * @throws {Error} When job execution fails
 */
async function executeDealerComJob(forceExecution = true) {
    const jobExecutionPayload = {
        force: forceExecution,
        platform: 'dealer.com'
    };

    const response = await fetch(`${schedulerApiUrl}/api/jobs/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobExecutionPayload)
    });

    if (!response.ok) {
        throw new Error(`Job execution failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Monitors job execution progress and database changes
 * 
 * @param {number} initialVehicleCount - Vehicle count before job execution
 * @param {number} monitoringTimeoutSeconds - How long to monitor for changes
 * @returns {Promise<object>} Monitoring results
 */
async function monitorJobExecution(initialVehicleCount, monitoringTimeoutSeconds = 60) {
    console.log(`⏱️  Monitoring database changes for ${monitoringTimeoutSeconds} seconds...`);
    
    const monitoringStartTime = Date.now();
    const monitoringEndTime = monitoringStartTime + (monitoringTimeoutSeconds * 1000);
    let maximumVehicleCount = initialVehicleCount;
    let checkCount = 0;

    while (Date.now() < monitoringEndTime) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between checks
        
        try {
            const currentVehicleCount = await getCurrentVehicleCount();
            checkCount++;
            
            if (currentVehicleCount > maximumVehicleCount) {
                maximumVehicleCount = currentVehicleCount;
                const newVehiclesAdded = currentVehicleCount - initialVehicleCount;
                console.log(`📈 Check ${checkCount}: ${currentVehicleCount} vehicles (+${newVehiclesAdded} new)`);
            } else {
                console.log(`📊 Check ${checkCount}: ${currentVehicleCount} vehicles (no change)`);
            }
        } catch (error) {
            console.warn(`⚠️  Monitoring check ${checkCount} failed: ${error.message}`);
        }
    }

    return {
        initialCount: initialVehicleCount,
        finalCount: maximumVehicleCount,
        vehiclesAdded: maximumVehicleCount - initialVehicleCount,
        checksPerformed: checkCount
    };
}

/**
 * Main test execution function
 * Orchestrates the complete Dealer.com job test workflow
 */
async function executeJobTest() {
    try {
        console.log('🧪 Dealer.com Job Execution Test');
        console.log('=' * 40);
        console.log('');

        // Step 1: Get baseline vehicle count
        console.log('📊 Step 1: Getting baseline vehicle count...');
        const initialVehicleCount = await getCurrentVehicleCount();
        console.log(`   Current vehicles in database: ${initialVehicleCount.toLocaleString()}`);

        // Step 2: Execute the Dealer.com job
        console.log('\n🚀 Step 2: Executing Dealer.com job...');
        const jobExecutionResponse = await executeDealerComJob(true);
        console.log(`   Job execution initiated: ${jobExecutionResponse.message || 'Success'}`);

        // Step 3: Monitor for changes
        console.log('\n👀 Step 3: Monitoring database for new vehicles...');
        const monitoringResults = await monitorJobExecution(initialVehicleCount, 120); // Monitor for 2 minutes

        // Step 4: Report results
        console.log('\n📋 Test Results Summary:');
        console.log('-'.repeat(30));
        console.log(`   Initial vehicle count: ${monitoringResults.initialCount.toLocaleString()}`);
        console.log(`   Final vehicle count: ${monitoringResults.finalCount.toLocaleString()}`);
        console.log(`   Vehicles added: ${monitoringResults.vehiclesAdded.toLocaleString()}`);
        console.log(`   Database checks performed: ${monitoringResults.checksPerformed}`);

        if (monitoringResults.vehiclesAdded > 0) {
            console.log('\n✅ SUCCESS: Dealer.com job executed successfully and populated database');
        } else {
            console.log('\n⚠️  WARNING: No new vehicles were added to database');
            console.log('   This may indicate job execution issues or no new inventory available');
        }

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('   Please check your services are running and environment configuration');
        process.exit(1);
    }
}

// Execute the job test
executeJobTest();
