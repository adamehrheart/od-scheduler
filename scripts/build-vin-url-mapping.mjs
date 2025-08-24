#!/usr/bin/env node

// Build VIN-to-URL mapping by scraping vehicle pages from sitemap
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

async function buildVinUrlMapping() {
    console.log('🔗 Building VIN-to-URL mapping from sitemap...\n');

    try {
        // Fetch sitemap
        const sitemapResponse = await fetch('https://www.rsmhondaonline.com/sitemap.xml');
        if (!sitemapResponse.ok) {
            throw new Error(`Failed to fetch sitemap: ${sitemapResponse.status}`);
        }

        const sitemapXml = await sitemapResponse.text();
        
        // Extract all vehicle URLs (new, used, certified)
        const vehicleUrlMatches = sitemapXml.match(/https:\/\/www\.rsmhondaonline\.com\/(new|used|certified)\/[^"<]*\.htm/g);
        
        if (!vehicleUrlMatches) {
            throw new Error('No vehicle URLs found in sitemap');
        }

        console.log(`📋 Found ${vehicleUrlMatches.length} vehicle URLs in sitemap`);
        
        // Filter to new Honda vehicles for now (we can expand later)
        const newHondaUrls = vehicleUrlMatches.filter(url => url.includes('/new/Honda/'));
        console.log(`📋 Processing ${newHondaUrls.length} new Honda vehicle URLs\n`);

        const vinUrlMapping = new Map();
        let processed = 0;
        let success = 0;
        let failed = 0;

        // Process URLs in batches to avoid overwhelming the server
        const batchSize = 5;
        for (let i = 0; i < newHondaUrls.length; i += batchSize) {
            const batch = newHondaUrls.slice(i, i + batchSize);
            
            console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(newHondaUrls.length/batchSize)} (${batch.length} URLs)`);
            
            // Process batch concurrently
            const batchPromises = batch.map(async (vehicleUrl) => {
                try {
                    const pageResponse = await fetch(vehicleUrl);
                    if (pageResponse.ok) {
                        const pageHtml = await pageResponse.text();
                        
                        // Look for Honda VINs in the page
                        const vinPattern = /[A-HJ-NPR-Z0-9]{17}/g;
                        const vinsFound = pageHtml.match(vinPattern);
                        
                        if (vinsFound) {
                            // Filter to Honda VINs
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
                                // Use the first Honda VIN found (should be the primary one)
                                const vin = hondaVins[0];
                                vinUrlMapping.set(vin, vehicleUrl);
                                return { success: true, vin, url: vehicleUrl };
                            }
                        }
                    }
                    return { success: false, url: vehicleUrl, error: 'No VIN found' };
                } catch (error) {
                    return { success: false, url: vehicleUrl, error: error.message };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            for (const result of batchResults) {
                processed++;
                if (result.success) {
                    success++;
                    console.log(`   ✅ ${result.vin} -> ${result.url.split('/').pop()}`);
                } else {
                    failed++;
                    console.log(`   ❌ ${result.url.split('/').pop()} - ${result.error}`);
                }
            }
            
            // Small delay between batches to be respectful
            if (i + batchSize < newHondaUrls.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`\n📊 Mapping Results:`);
        console.log(`   Processed: ${processed} URLs`);
        console.log(`   Success: ${success} VIN-URL mappings`);
        console.log(`   Failed: ${failed} URLs`);
        console.log(`   Mapping size: ${vinUrlMapping.size} entries`);

        // Now update our vehicles table with the URLs
        if (vinUrlMapping.size > 0) {
            console.log(`\n💾 Updating vehicles table with ${vinUrlMapping.size} URLs...`);
            
            let updatedCount = 0;
            let notFoundCount = 0;
            const urlShorteningJobs = [];

            for (const [vin, url] of vinUrlMapping) {
                // Update vehicle in database
                const { error: updateError } = await supabase
                    .from('vehicles')
                    .update({ 
                        dealerurl: url,
                        short_url_status: 'pending',
                        short_url_attempts: 0,
                        short_url_last_attempt: null
                    })
                    .eq('vin', vin);

                if (updateError) {
                    console.log(`   ❌ Failed to update ${vin}: ${updateError.message}`);
                } else {
                    updatedCount++;
                    console.log(`   ✅ Updated ${vin} with URL`);

                    // Create URL shortening job
                    urlShorteningJobs.push({
                        job_type: 'url_shortening',
                        status: 'pending',
                        attempts: 0,
                        max_attempts: 3,
                        payload: {
                            dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847', // RSM Honda dealer ID
                            vin: vin,
                            dealerurl: url,
                            utm: {
                                dealerId: '5eb88852-0caa-5656-8a7b-aab53e5b1847',
                                vin: vin,
                                medium: 'LLM',
                                source: 'sitemap_scraping'
                            }
                        },
                        created_at: new Date().toISOString(),
                        scheduled_at: new Date().toISOString()
                    });
                }
            }

            console.log(`\n🎯 Database Update Summary:`);
            console.log(`   ✅ Updated: ${updatedCount} vehicles`);
            console.log(`   📊 Total mappings: ${vinUrlMapping.size}`);

            // Create URL shortening jobs
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

            // Show some sample mappings
            console.log(`\n📋 Sample VIN-to-URL Mappings:`);
            let count = 0;
            for (const [vin, url] of vinUrlMapping) {
                if (count < 5) {
                    console.log(`   ${vin} -> ${url.split('/').pop()}`);
                    count++;
                } else {
                    break;
                }
            }
        }

        console.log('\n🎉 VIN-to-URL mapping completed!');

    } catch (error) {
        console.error('❌ Failed to build VIN-to-URL mapping:', error);
    }
}

buildVinUrlMapping();
