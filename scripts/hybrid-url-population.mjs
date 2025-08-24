#!/usr/bin/env node

// Hybrid URL population using both sitemap and Dealer.com feed
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
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

async function hybridUrlPopulation() {
    console.log('🔗 Hybrid URL population using sitemap + Dealer.com feed...\n');

    try {
        const dealerConfig = {
            siteId: "ranchosan29961santamargaritaparkway",
            baseUrl: "https://www.rsmhondaonline.com",
            pageSize: 100
        };

        // Step 1: Get actual URLs from sitemap
        console.log('📋 Step 1: Fetching sitemap.xml...');
        const sitemapResponse = await fetch(`${dealerConfig.baseUrl}/sitemap.xml`);
        if (!sitemapResponse.ok) {
            throw new Error(`Failed to fetch sitemap: ${sitemapResponse.status}`);
        }

        const sitemapXml = await sitemapResponse.text();
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
        });
        const parsed = parser.parse(sitemapXml);

        // Extract vehicle detail URLs from sitemap
        const sitemapUrls = parsed.urlset?.url?.filter(url => 
            url.loc.includes('/new/Honda/') && url.loc.endsWith('.htm')
        ) || [];

        console.log(`✅ Found ${sitemapUrls.length} vehicle URLs in sitemap`);

        // Step 2: Get VIN mapping from Dealer.com feed
        console.log('\n📡 Step 2: Fetching Dealer.com inventory feed...');
        const feedResponse = await fetch(`${dealerConfig.baseUrl}/api/widget/ws-inv-data/getInventory`, {
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

        if (!feedResponse.ok) {
            throw new Error(`Failed to fetch Dealer.com feed: ${feedResponse.status}`);
        }

        const feedData = await feedResponse.json();
        const feedVehicles = feedData.inventory || [];

        console.log(`✅ Found ${feedVehicles.length} vehicles in Dealer.com feed`);

        // Step 3: Create mapping from sitemap URLs to VINs
        console.log('\n🔗 Step 3: Creating URL to VIN mapping...');
        
        const urlToVinMap = new Map();
        const vinToUrlMap = new Map();

        // For each sitemap URL, try to find matching vehicle in feed
        for (const sitemapUrl of sitemapUrls) {
            const url = sitemapUrl.loc;
            
            // Extract UUID from URL (last part before .htm)
            const urlParts = url.split('/');
            const filename = urlParts[urlParts.length - 1];
            const uuid = filename.replace('.htm', '');
            
            // Find matching vehicle in feed by UUID
            const matchingVehicle = feedVehicles.find(vehicle => 
                vehicle.uuid && vehicle.uuid === uuid
            );

            if (matchingVehicle && matchingVehicle.vin) {
                urlToVinMap.set(url, matchingVehicle.vin);
                vinToUrlMap.set(matchingVehicle.vin, url);
                console.log(`✅ Mapped: ${matchingVehicle.vin} -> ${url}`);
            }
        }

        console.log(`📋 Created ${vinToUrlMap.size} VIN to URL mappings`);

        // Step 4: Update vehicles in database
        console.log('\n💾 Step 4: Updating vehicles in database...');
        
        const { data: vehiclesWithoutUrls, error: fetchError } = await supabase
            .from('vehicles')
            .select('vin, make, model, year')
            .is('dealerurl', null);

        if (fetchError) {
            throw new Error(`Failed to fetch vehicles: ${fetchError.message}`);
        }

        console.log(`📊 Found ${vehiclesWithoutUrls?.length || 0} vehicles without dealer URLs`);

        let updatedCount = 0;
        let notFoundCount = 0;
        const urlShorteningJobs = [];

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

                    // Create URL shortening job
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
                                source: 'hybrid_sitemap_feed'
                            }
                        },
                        created_at: new Date().toISOString(),
                        scheduled_at: new Date().toISOString()
                    });
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

        // Step 5: Create URL shortening jobs
        if (urlShorteningJobs.length > 0) {
            console.log(`\n🔗 Creating ${urlShorteningJobs.length} URL shortening jobs...`);
            
            const { error: jobError } = await supabase
                .from('job_queue')
                .insert(urlShorteningJobs);

            if (jobError) {
                console.error('❌ Failed to create URL shortening jobs:', jobError.message);
            } else {
                console.log(`✅ Created ${urlShorteningJobs.length} URL shortening jobs`);
            }
        }

        console.log('\n🎉 Hybrid URL population completed!');

    } catch (error) {
        console.error('❌ Failed to populate URLs:', error);
    }
}

hybridUrlPopulation();
