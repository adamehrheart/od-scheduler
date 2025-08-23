#!/usr/bin/env node
// Test script for Dealer.com job
// Usage: node scripts/test-dealer-com.mjs

import { DealerComJobRunner } from '../dist/src/jobs/dealer-com.js';

// Test configuration
const testJob = {
  id: 'test_dealer_com_job',
  dealer_id: 'rsm-honda',
  dealer_name: 'RSM Honda',
  platform: 'dealer.com',
  environment: 'test',
  config: {
    api_endpoint: 'https://www.rsmhonda.com/api/inventory',
    scraping_enabled: true
  }
};

async function testDealerComJob() {
  console.log('🧪 Testing Dealer.com integration...');
  
  try {
    const runner = new DealerComJobRunner(testJob);
    const result = await runner.execute();
    
    console.log(JSON.stringify(result, null, 2));
    
    if (result.status === 'success') {
      console.log('✅ Dealer.com job completed successfully');
      process.exit(0);
    } else {
      console.log('❌ Dealer.com job failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error running Dealer.com job:', error.message);
    process.exit(1);
  }
}

testDealerComJob();
