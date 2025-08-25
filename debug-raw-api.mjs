#!/usr/bin/env node

/**
 * Debug script to see raw Dealer.com API response
 */

async function debugRawAPI() {
  console.log('🔍 Debugging raw Dealer.com API response...\n');
  
  const requestBody = {
    siteId: 'ranchosan29961santamargaritaparkway',
    locale: 'en_US',
    device: 'DESKTOP',
    pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_ALL',
    pageId: 'v9_INVENTORY_SEARCH_RESULTS_AUTO_ALL_V1_1',
    windowId: 'inventory-data-bus2',
    widgetName: 'ws-inv-data',
    inventoryParameters: {},
    preferences: {
      pageSize: '10',
      pageStart: '0'
    },
    includePricing: true
  };

  console.log('📋 Request body:', JSON.stringify(requestBody, null, 2));
  console.log('');

  try {
    const response = await fetch('https://www.rsmhondaonline.com/api/widget/ws-inv-data/getInventory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log('📊 API Response Summary:');
    console.log('- Status:', response.status);
    console.log('- Total count:', data.pageInfo?.totalCount);
    console.log('- Page size:', data.pageInfo?.pageSize);
    console.log('- Vehicles in response:', data.inventory?.length || 0);
    console.log('');

    if (data.inventory && data.inventory.length > 0) {
      console.log('🚗 Sample Vehicle (Raw):');
      const sample = data.inventory[0];
      console.log(JSON.stringify(sample, null, 2));
      console.log('');
      
      console.log('🔍 Key Fields Check:');
      console.log('- VIN:', sample.vin);
      console.log('- Make:', sample.make);
      console.log('- Model:', sample.model);
      console.log('- Year:', sample.year);
      console.log('- Link:', sample.link);
      console.log('- Tracking Attributes:', sample.trackingAttributes?.length || 0);
      console.log('- Images:', sample.images?.length || 0);
      console.log('');
      
      if (sample.trackingAttributes) {
        console.log('📋 Tracking Attributes:');
        sample.trackingAttributes.forEach((attr) => {
          console.log(`  ${attr.name}: ${attr.value}`);
        });
      }
    }

  } catch (error) {
    console.log('❌ API call failed:', error.message);
  }
}

debugRawAPI().catch(console.error);
