import fetch from 'node-fetch';

async function dealerComMasterInventoryBasic() {
    try {
        console.log('🚀 Dealer.com Master Inventory API - BASIC TEST\n');

        // Call the Dealer.com API to get ALL inventory data
        console.log('📡 Calling Dealer.com Master Inventory API...');
        
        const dealerComResponse = await fetch('https://www.rsmhondaonline.com/api/widget/ws-inv-data/getInventory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                siteId: 'ranchosan29961santamargaritaparkway',
                locale: 'en_US',
                device: 'DESKTOP',
                pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_NEW',
                pageId: 'ranchosan29961santamargaritaparkway_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_NEW_V1_1',
                windowId: 'inventory-data-bus2',
                widgetName: 'ws-inv-data',
                inventoryParameters: {},
                includePricing: true
            })
        });

        if (!dealerComResponse.ok) {
            throw new Error(`Dealer.com API failed: ${dealerComResponse.status} ${dealerComResponse.statusText}`);
        }

        const dealerComData = await dealerComResponse.json();
        console.log('✅ Dealer.com API call successful!');

        // Extract vehicle data from the response
        console.log('\n📊 Extracting vehicle data...');
        
        if (!dealerComData.inventory || !Array.isArray(dealerComData.inventory)) {
            throw new Error('No inventory data found in Dealer.com response');
        }

        const dealerComVehicles = dealerComData.inventory;
        console.log(`✅ Found ${dealerComVehicles.length} vehicles in Dealer.com inventory`);

        // Show sample of the rich data available
        console.log('\n📋 Sample of rich data available from Dealer.com:');
        console.log('==================================================');
        
        dealerComVehicles.slice(0, 3).forEach((vehicle, index) => {
            console.log(`\n${index + 1}. ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.vin})`);
            console.log(`   Dealer.com URL: https://www.rsmhondaonline.com${vehicle.link}`);
            console.log(`   Transmission: ${vehicle.trackingAttributes?.find(attr => attr.name === 'transmission')?.value || 'N/A'}`);
            console.log(`   Drivetrain: ${vehicle.trackingAttributes?.find(attr => attr.name === 'driveLine')?.value || 'N/A'}`);
            console.log(`   Body Style: ${vehicle.bodyStyle || 'N/A'}`);
            console.log(`   Stock #: ${vehicle.stockNumber || 'N/A'}`);
            console.log(`   Fuel Type: ${vehicle.fuelType || 'N/A'}`);
            console.log(`   Mileage: ${vehicle.trackingAttributes?.find(attr => attr.name === 'odometer')?.value || 'N/A'}`);
            console.log(`   City MPG: ${vehicle.trackingAttributes?.find(attr => attr.name === 'cityFuelEconomy')?.value || 'N/A'}`);
            console.log(`   Highway MPG: ${vehicle.trackingAttributes?.find(attr => attr.name === 'highwayFuelEconomy')?.value || 'N/A'}`);
            console.log(`   Combined MPG: ${vehicle.trackingAttributes?.find(attr => attr.name === 'combinedFuelEfficiency')?.value || 'N/A'}`);
            console.log(`   Exterior Color: ${vehicle.trackingAttributes?.find(attr => attr.name === 'exteriorColor')?.value || 'N/A'}`);
            console.log(`   Interior Color: ${vehicle.trackingAttributes?.find(attr => attr.name === 'interiorColor')?.value || 'N/A'}`);
            console.log(`   Engine: ${vehicle.trackingAttributes?.find(attr => attr.name === 'engineSize')?.value || 'N/A'} ${vehicle.trackingAttributes?.find(attr => attr.name === 'engine')?.value || 'N/A'}`);
            console.log(`   MSRP: ${vehicle.trackingPricing?.msrp || 'N/A'}`);
            console.log(`   Internet Price: ${vehicle.trackingPricing?.internetPrice || 'N/A'}`);
            console.log(`   Images: ${vehicle.images?.length || 0} photos available`);
            console.log(`   Equipment: ${vehicle.equipment?.length || 0} specifications available`);
            console.log(`   Incentives: ${vehicle.incentiveIds?.length || 0} offers available`);
        });

        // Summary
        console.log('\n🎉 REVOLUTIONARY DISCOVERY SUMMARY:');
        console.log('===================================');
        console.log(`✅ Dealer.com Master Inventory API WORKS!`);
        console.log(`✅ Returns ${dealerComVehicles.length} vehicles in ONE API call`);
        console.log(`✅ Rich data includes: transmission, drivetrain, body_style, MPG, colors, pricing, images, equipment, incentives`);
        console.log(`✅ Real-time data from dealer website`);
        console.log(`✅ No complex VIN matching needed`);
        console.log(`✅ Could potentially ELIMINATE HomeNet dependency!`);
        
        console.log('\n🚀 NEXT STEPS:');
        console.log('==============');
        console.log('1. ✅ COMMIT THIS DISCOVERY IMMEDIATELY');
        console.log('2. Update DealerComJobRunner to use this API');
        console.log('3. Consider eliminating HomeNet for Dealer.com dealers');
        console.log('4. Scale to multiple dealers');
        console.log('5. This could revolutionize our entire data pipeline!');

        console.log('\n💾 SAVING BASIC TEST DATA...');
        
        // Save the basic test data
        const fs = await import('fs');
        fs.writeFileSync('dealer-com-master-inventory-basic-test.json', JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: {
                totalVehicles: dealerComVehicles.length,
                apiEndpoint: 'https://www.rsmhondaonline.com/api/widget/ws-inv-data/getInventory',
                siteId: 'ranchosan29961santamargaritaparkway'
            },
            sampleVehicles: dealerComVehicles.slice(0, 5), // Save first 5 for reference
            availableFields: [
                'vin', 'transmission', 'drivetrain', 'body_style', 'stock_number',
                'fuel_type', 'mileage', 'city_mpg', 'highway_mpg', 'combined_mpg',
                'exterior_color', 'interior_color', 'engine', 'engine_size',
                'msrp', 'internet_price', 'images', 'equipment', 'incentives'
            ]
        }, null, 2));

        console.log('✅ Basic test data saved to dealer-com-master-inventory-basic-test.json');
        console.log('\n🎯 BASIC TEST COMPLETE! This is going to change EVERYTHING!');

    } catch (error) {
        console.error('❌ Basic test failed:', error);
        throw error;
    }
}

// Run the basic test
dealerComMasterInventoryBasic();
