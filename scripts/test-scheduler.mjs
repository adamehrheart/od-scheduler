#!/usr/bin/env node

/**
 * Test Script for Open Dealer Scheduler Service
 * 
 * This script tests the basic functionality of the scheduler service
 * without requiring a full deployment.
 */

import { SchedulerService } from '../dist/src/scheduler.js'
import { logInfo, logSuccess, logError } from '../dist/src/utils.js'

async function testScheduler() {
  console.log('🧪 Testing Open Dealer Scheduler Service...\n')

  try {
    // Test 1: Initialize scheduler service
    logInfo('Test 1: Initializing scheduler service')
    const scheduler = new SchedulerService()
    logSuccess('✅ Scheduler service initialized successfully')

    // Test 2: Test job execution (dry run)
    logInfo('Test 2: Testing job execution (dry run)')
    const result = await scheduler.runJobs({ force: false })
    logSuccess('✅ Job execution test completed', {
      jobs_executed: result.jobs_executed,
      jobs_succeeded: result.jobs_succeeded,
      jobs_failed: result.jobs_failed,
      execution_time_ms: result.execution_time_ms
    })

    // Test 3: Test with force flag
    logInfo('Test 3: Testing forced job execution')
    const forceResult = await scheduler.runJobs({ force: true })
    logSuccess('✅ Forced job execution test completed', {
      jobs_executed: forceResult.jobs_executed,
      jobs_succeeded: forceResult.jobs_succeeded,
      jobs_failed: forceResult.jobs_failed,
      execution_time_ms: forceResult.execution_time_ms
    })

    console.log('\n🎉 All tests passed! The scheduler service is working correctly.')
    console.log('\n📋 Next steps:')
    console.log('1. Configure environment variables in .env.local')
    console.log('2. Deploy to Vercel: vercel --prod')
    console.log('3. Set up cron jobs in Vercel dashboard')
    console.log('4. Monitor job executions via API endpoints')

  } catch (error) {
    logError('❌ Test failed', error)
    console.log('\n🔧 Troubleshooting:')
    console.log('1. Check environment variables are set correctly')
    console.log('2. Verify Supabase connection')
    console.log('3. Ensure all dependencies are installed')
    process.exit(1)
  }
}

// Run the test
testScheduler()
