#!/usr/bin/env node

// Test scraping individual vehicle pages to find VINs
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

async function testVehiclePageScraping() {
    console.log('🔍 Testing vehicle page scraping to find VINs...\n');

    try {
        // Get a few sample vehicles from our database
        const { data: sampleVehicles, error: fetchError } = await supabase
            .from('vehicles')
            .select('vin, make, model, year')
            .limit(3);

        if (fetchError) {
            throw new Error(`Failed to fetch vehicles: ${fetchError.message}`);
        }

        console.log(`📋 Testing with ${sampleVehicles?.length || 0} sample vehicles:\n`);

        for (const vehicle of sampleVehicles || []) {
            console.log(`🔍 Testing: ${vehicle.vin} - ${vehicle.year} ${vehicle.make} ${vehicle.model}`);

            // Try to find this vehicle on the RSM Honda site
            // We'll search for pages that might contain this VIN
            const searchUrl = `https://www.rsmhondaonline.com/new-inventory/index.htm?search=${vehicle.vin}`;

            try {
                const response = await fetch(searchUrl);
                if (response.ok) {
                    const html = await response.text();

                    // Look for VIN in the page content
                    const vinFound = html.includes(vehicle.vin);
                    console.log(`   VIN found in search page: ${vinFound ? '✅' : '❌'}`);

                    if (vinFound) {
                        // Extract any URLs that might be related to this vehicle
                        const urlMatches = html.match(/\/new\/Honda\/[^"'\s]*\.htm/g);
                        if (urlMatches) {
                            console.log(`   Found ${urlMatches.length} potential vehicle URLs`);
                            urlMatches.slice(0, 3).forEach(url => {
                                console.log(`     ${url}`);
                            });
                        }
                    }
                } else {
                    console.log(`   Search page returned: ${response.status}`);
                }
            } catch (error) {
                console.log(`   Error searching for VIN: ${error.message}`);
            }

            console.log('');
        }

        // Now let's try a different approach - get some actual vehicle URLs from sitemap
        console.log('📋 Testing with actual vehicle URLs from sitemap...\n');

        const sitemapResponse = await fetch('https://www.rsmhondaonline.com/sitemap.xml');
        if (!sitemapResponse.ok) {
            throw new Error(`Failed to fetch sitemap: ${sitemapResponse.status}`);
        }

        const sitemapXml = await sitemapResponse.text();

        // Extract vehicle URLs properly
        const vehicleUrlMatches = sitemapXml.match(/https:\/\/www\.rsmhondaonline\.com\/new\/Honda\/[^"<]*\.htm/g);

        if (!vehicleUrlMatches) {
            throw new Error('No vehicle URLs found in sitemap');
        }

        console.log(`📋 Found ${vehicleUrlMatches.length} vehicle URLs in sitemap`);

        // Test the first few vehicle pages
        for (let i = 0; i < Math.min(3, vehicleUrlMatches.length); i++) {
            const vehicleUrl = vehicleUrlMatches[i];
            console.log(`\n🔍 Testing vehicle page: ${vehicleUrl}`);

            try {
                const pageResponse = await fetch(vehicleUrl);
                if (pageResponse.ok) {
                    const pageHtml = await pageResponse.text();

                    // Look for VIN patterns in the page
                    const vinPattern = /[A-HJ-NPR-Z0-9]{17}/g;
                    const vinsFound = pageHtml.match(vinPattern);

                    if (vinsFound) {
                        console.log(`   Found ${vinsFound.length} VIN-like patterns on page`);
                        // Filter to likely real VINs (Honda VINs start with specific patterns)
                        const hondaVins = vinsFound.filter(vin =>
                            vin.startsWith('1HG') ||
                            vin.startsWith('2HK') ||
                            vin.startsWith('2HG') ||
                            vin.startsWith('5FN') ||
                            vin.startsWith('5J6') ||
                            vin.startsWith('7FA') ||
                            vin.startsWith('19X') ||
                            vin.startsWith('3CZ') ||
                            vin.startsWith('3GP') ||
                            vin.startsWith('5FP') ||
                            vin.startsWith('5TD') ||
                            vin.startsWith('5XYP') ||
                            vin.startsWith('KND') ||
                            vin.startsWith('KMH') ||
                            vin.startsWith('1C4') ||
                            vin.startsWith('1N4') ||
                            vin.startsWith('2FMP') ||
                            vin.startsWith('SHH')
                        );

                        if (hondaVins.length > 0) {
                            console.log(`   Found ${hondaVins.length} Honda VINs on page:`);
                            hondaVins.forEach(vin => {
                                console.log(`     ${vin}`);
                            });
                        } else {
                            console.log(`   No Honda VINs found on page`);
                        }
                    } else {
                        console.log(`   No VIN patterns found on page`);
                    }

                    // Also look for any JavaScript data that might contain VIN
                    const scriptMatches = pageHtml.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
                    if (scriptMatches) {
                        console.log(`   Found ${scriptMatches.length} script tags`);

                        for (const script of scriptMatches.slice(0, 2)) { // Check first 2 scripts
                            if (script.includes('VIN') || script.includes('vin')) {
                                console.log(`   Script contains VIN references`);
                                // Extract any VIN-like patterns from script
                                const scriptVins = script.match(/[A-HJ-NPR-Z0-9]{17}/g);
                                if (scriptVins) {
                                    console.log(`   Found ${scriptVins.length} VINs in script`);
                                }
                            }
                        }
                    }

                } else {
                    console.log(`   Page returned: ${pageResponse.status}`);
                }
            } catch (error) {
                console.log(`   Error fetching page: ${error.message}`);
            }
        }

        console.log('\n💡 Key Findings:');
        console.log('1. Individual vehicle pages likely contain the VIN in the HTML or JavaScript');
        console.log('2. We can scrape these pages to build a VIN-to-URL mapping');
        console.log('3. This mapping can then be used to update our vehicles table');
        console.log('4. The Dealer.com feed approach is still the most efficient primary method');

    } catch (error) {
        console.error('❌ Failed to test vehicle page scraping:', error);
    }
}

testVehiclePageScraping();
