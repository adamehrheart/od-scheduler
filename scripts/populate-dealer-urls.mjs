#!/usr/bin/env node

// Populate dealer URLs for all vehicles using Dealer.com feed
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateDealerUrls() {
    console.log('🔗 Populating dealer URLs for all vehicles...\n');

    try {
        // RSM Honda configuration
        const dealerConfig = {
            siteId: "ranchosan29961santamargaritaparkway",
            baseUrl: "https://www.rsmhondaonline.com",
            pageSize: 100
        };

        console.log('📡 Fetching Dealer.com inventory feed...');

        // Fetch inventory data from Dealer.com API
        const response = await fetch(`${dealerConfig.baseUrl}/api/widget/ws-inv-data/getInventory`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
            },
            body: JSON.stringify({
                siteId: dealerConfig.siteId,
                locale: "en_US",
                device: "DESKTOP",
                pageAlias: "INVENTORY_LISTING_DEFAULT_AUTO_NEW",
                pageId: `${dealerConfig.siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_NEW_V1_1`,
                windowId: "inventory-data-bus2",
                widgetName: "ws-inv-data",
                inventoryParameters: {},
                preferences: {
                    pageSize: dealerConfig.pageSize.toString(),
                    "listing.config.id": "auto-new",
                    "removeEmptyFacets": "true",
                    "removeEmptyConstraints": "true",
                    "required.display.attributes": "vin,make,model,year,trim,uuid"
                },
                includePricing: true
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Dealer.com feed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.inventory || !Array.isArray(data.inventory)) {
            throw new Error('Invalid response structure from Dealer.com feed');
        }

        console.log(`✅ Fetched ${data.inventory.length} vehicles from Dealer.com feed`);

        // Create a map of VIN to dealer URL
        const vinToUrlMap = new Map();
        data.inventory.forEach(vehicle => {
            if (vehicle.vin && vehicle.uuid) {
                const dealerUrl = `${dealerConfig.baseUrl}/new/${vehicle.make}/${vehicle.year}-${vehicle.make}-${vehicle.model}-${vehicle.uuid}.htm`;
                vinToUrlMap.set(vehicle.vin, dealerUrl);
            }
        });

        console.log(`📋 Created URL mapping for ${vinToUrlMap.size} vehicles`);

        // Get all vehicles without dealer URLs
        const { data: vehiclesWithoutUrls, error: fetchError } = await supabase
            .from('vehicles')
            .select('vin, make, model, year')
            .is('dealerurl', null);

        if (fetchError) {
            throw new Error(`Failed to fetch vehicles: ${fetchError.message}`);
        }

        console.log(`📊 Found ${vehiclesWithoutUrls?.length || 0} vehicles without dealer URLs`);

        // Update vehicles with dealer URLs
        let updatedCount = 0;
        let notFoundCount = 0;

        for (const vehicle of vehiclesWithoutUrls || []) {
            const dealerUrl = vinToUrlMap.get(vehicle.vin);
            
            if (dealerUrl) {
                const { error: updateError } = await supabase
                    .from('vehicles')
                    .update({ 
                        dealerurl: dealerUrl,
                        short_url_status: 'pending',
                        short_url_attempts: 0,
                        short_url_last_attempt: null
                    })
                    .eq('vin', vehicle.vin);

                if (updateError) {
                    console.error(`❌ Failed to update vehicle ${vehicle.vin}:`, updateError.message);
                } else {
                    updatedCount++;
                    console.log(`✅ Updated ${vehicle.vin}: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
                }
            } else {
                notFoundCount++;
                console.log(`⚠️  No URL found for ${vehicle.vin}: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
            }
        }

        console.log(`\n🎯 Summary:`);
        console.log(`  ✅ Updated: ${updatedCount} vehicles`);
        console.log(`  ⚠️  Not found: ${notFoundCount} vehicles`);
        console.log(`  📊 Total processed: ${vehiclesWithoutUrls?.length || 0} vehicles`);

        // Create URL shortening jobs for updated vehicles
        if (updatedCount > 0) {
            console.log(`\n🔗 Creating URL shortening jobs...`);
            
            const urlShorteningJobs = [];
            for (const vehicle of vehiclesWithoutUrls || []) {
                const dealerUrl = vinToUrlMap.get(vehicle.vin);
                if (dealerUrl) {
                    urlShorteningJobs.push({
                        job_type: 'url_shortening',
                        status: 'pending',
                        attempts: 0,
                        max_attempts: 3,
                        payload: {
                            dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847', // RSM Honda dealer ID
                            vin: vehicle.vin,
                            dealerurl: dealerUrl,
                            utm: {
                                dealerId: '5eb88852-0caa-5656-8a7b-aab53e5b1847',
                                vin: vehicle.vin,
                                make: vehicle.make,
                                model: vehicle.model,
                                year: vehicle.year,
                                medium: 'LLM',
                                source: 'dealer_com_feed'
                            }
                        },
                        created_at: new Date().toISOString(),
                        scheduled_at: new Date().toISOString()
                    });
                }
            }

            const { error: jobError } = await supabase
                .from('job_queue')
                .insert(urlShorteningJobs);

            if (jobError) {
                console.error('❌ Failed to create URL shortening jobs:', jobError.message);
            } else {
                console.log(`✅ Created ${urlShorteningJobs.length} URL shortening jobs`);
            }
        }

        console.log('\n🎉 Dealer URL population completed!');

    } catch (error) {
        console.error('❌ Failed to populate dealer URLs:', error);
    }
}

populateDealerUrls();
