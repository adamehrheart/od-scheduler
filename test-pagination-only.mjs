#!/usr/bin/env node

/**
 * Simple test to verify Dealer.com pagination is working
 */

import { fetchAllDealerComInventory } from './dist/src/lib/dealer-com-pagination.js';

async function testPagination() {
  console.log('🧪 Testing Dealer.com pagination...\n');
  
  const config = {
    siteId: 'ranchosan29961santamargaritaparkway',
    baseUrl: 'https://www.rsmhondaonline.com',
    pageSize: 100,
    maxPages: 10
  };

  console.log('📋 Config:', config);
  console.log('');

  try {
    console.log('📡 Fetching inventory with pagination...');
    const vehicles = await fetchAllDealerComInventory(config, (level, message, data) => {
      console.log(`[${level.toUpperCase()}] ${message}`, data);
    });

    console.log('');
    console.log('🎉 Pagination test completed!');
    console.log(`Total vehicles fetched: ${vehicles.length}`);
    
    if (vehicles.length > 0) {
      console.log('Sample vehicle:', {
        vin: vehicles[0].vin,
        make: vehicles[0].make,
        model: vehicles[0].model,
        year: vehicles[0].year
      });
    }

  } catch (error) {
    console.log('❌ Pagination test failed:');
    console.log('Error:', error.message);
  }
}

// Run with timeout
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Test timeout')), 30000);
});

Promise.race([
  testPagination(),
  timeoutPromise
]).catch(error => {
  console.log('❌ Test failed:', error.message);
});
