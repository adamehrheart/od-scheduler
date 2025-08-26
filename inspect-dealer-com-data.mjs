import { DealerComJobRunner } from './dist/src/jobs/dealer-com.js';

async function inspectData() {
    try {
        console.log('Creating DealerComJobRunner...');
        const jobRunner = new DealerComJobRunner();

        // Get the dealer config
        const dealer = {
            id: '550e8400-e29b-41d4-a716-446655440000', // RSM Honda UUID
            name: 'RSM Honda',
            site_id: 'rsmhonda',
            base_url: 'https://www.rsmhondaonline.com'
        };

        console.log('Fetching Dealer.com data...');

        // Use the existing pagination function
        const { fetchAllDealerComInventory } = await import('./dist/src/lib/dealer-com-pagination.js');

        const config = {
            siteId: dealer.site_id,
            baseUrl: dealer.base_url,
            pageSize: 1, // Just get 1 vehicle for inspection
            maxPages: 1
        };

        const result = await fetchAllDealerComInventory(config, console.log);
        const vehicle = result.vehicles[0];

        if (!vehicle) {
            console.log('No vehicles found');
            return;
        }

        console.log('\n=== VEHICLE OVERVIEW ===');
        console.log('VIN:', vehicle.vin);
        console.log('Year:', vehicle.year);
        console.log('Make:', vehicle.make);
        console.log('Model:', vehicle.model);
        console.log('Trim:', vehicle.trim);

        console.log('\n=== PRICING DATA ===');
        console.log('Raw pricing object:', JSON.stringify(vehicle.pricing, null, 2));
        console.log('Internet price:', vehicle.pricing?.internetPrice);
        console.log('Sale price:', vehicle.pricing?.salePrice);
        console.log('MSRP:', vehicle.pricing?.msrp);
        console.log('Retail price:', vehicle.pricing?.retailPrice);

        console.log('\n=== INCENTIVE/OFFER DATA ===');
        console.log('Featured promotion:', vehicle.featuredPromotion);
        console.log('Packages:', vehicle.packages);
        console.log('Callouts:', vehicle.callout);
        console.log('Highlighted attributes:', vehicle.highlightedAttributes);
        console.log('Incentives array:', vehicle.incentives);

        console.log('\n=== TRACKING ATTRIBUTES ===');
        console.log('All tracking attributes:', JSON.stringify(vehicle.trackingAttributes, null, 2));

        console.log('\n=== ADDITIONAL FIELDS ===');
        console.log('Fuel efficiency:', vehicle.fuelEfficiency);
        console.log('Engine:', vehicle.engine);
        console.log('Equipment:', vehicle.equipment?.slice(0, 3)); // First 3 items

    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

inspectData();
