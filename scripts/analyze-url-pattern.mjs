#!/usr/bin/env node

// Analyze URL pattern from sitemap to find unique identifiers
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

async function analyzeUrlPattern() {
    console.log('🔍 Analyzing URL pattern from sitemap...\n');

    try {
        // Fetch sitemap
        const response = await fetch('https://www.rsmhondaonline.com/sitemap.xml');
        if (!response.ok) {
            throw new Error(`Failed to fetch sitemap: ${response.status}`);
        }

        const sitemapXml = await response.text();
        
        // Extract vehicle URLs using regex
        const vehicleUrlPattern = /new\/Honda\/[^"]*\.htm/g;
        const matches = sitemapXml.match(vehicleUrlPattern);
        
        if (!matches) {
            throw new Error('No vehicle URLs found in sitemap');
        }

        console.log(`📋 Found ${matches.length} vehicle URLs in sitemap\n`);

        // Analyze URL structure
        const urlAnalysis = [];
        for (const url of matches.slice(0, 10)) { // Analyze first 10 URLs
            const parts = url.split('/');
            const filename = parts[parts.length - 1];
            const filenameWithoutExt = filename.replace('.htm', '');
            
            // Extract components
            const yearMatch = filenameWithoutExt.match(/^(\d{4})/);
            const makeMatch = filenameWithoutExt.match(/-([^-]+)-/);
            const modelMatch = filenameWithoutExt.match(/-([^-]+?)(?:-|$)/);
            const hashMatch = filenameWithoutExt.match(/([a-f0-9]{32})$/);
            
            urlAnalysis.push({
                url,
                year: yearMatch ? yearMatch[1] : null,
                make: makeMatch ? makeMatch[1] : null,
                model: modelMatch ? modelMatch[1] : null,
                hash: hashMatch ? hashMatch[1] : null,
                filename: filenameWithoutExt
            });
        }

        console.log('📊 URL Structure Analysis (first 10 URLs):');
        urlAnalysis.forEach((analysis, index) => {
            console.log(`\n${index + 1}. ${analysis.url}`);
            console.log(`   Year: ${analysis.year}`);
            console.log(`   Make: ${analysis.make}`);
            console.log(`   Model: ${analysis.model}`);
            console.log(`   Hash: ${analysis.hash}`);
            console.log(`   Full filename: ${analysis.filename}`);
        });

        // Get some sample vehicles from our database
        console.log('\n🔍 Sample vehicles from our database:');
        const { data: sampleVehicles, error: fetchError } = await supabase
            .from('vehicles')
            .select('vin, make, model, year')
            .limit(5);

        if (fetchError) {
            console.error('Error fetching vehicles:', fetchError);
        } else {
            sampleVehicles?.forEach((vehicle, index) => {
                console.log(`\n${index + 1}. VIN: ${vehicle.vin}`);
                console.log(`   ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
            });
        }

        // Try to find potential matching patterns
        console.log('\n🎯 Potential Matching Strategies:');
        console.log('1. **Hash-based matching**: The 32-character hash might be a unique identifier');
        console.log('2. **Year-Make-Model matching**: Match by vehicle specifications');
        console.log('3. **VIN pattern matching**: Extract patterns from VIN that might appear in hash');
        console.log('4. **Stock number matching**: The hash might encode stock numbers');

        // Check if any of our VINs appear in the URL hashes
        console.log('\n🔍 Checking for VIN patterns in URL hashes...');
        const allHashes = matches.map(url => {
            const filename = url.split('/').pop().replace('.htm', '');
            const hashMatch = filename.match(/([a-f0-9]{32})$/);
            return hashMatch ? hashMatch[1] : null;
        }).filter(Boolean);

        console.log(`Found ${allHashes.length} unique hashes in sitemap URLs`);

        // Get all our VINs
        const { data: allVehicles, error: vinError } = await supabase
            .from('vehicles')
            .select('vin, make, model, year');

        if (vinError) {
            console.error('Error fetching all vehicles:', vinError);
        } else {
            console.log(`\nChecking ${allVehicles?.length || 0} vehicles for hash matches...`);
            
            let potentialMatches = 0;
            for (const vehicle of allVehicles || []) {
                // Try different VIN pattern matching strategies
                const vin = vehicle.vin;
                
                // Strategy 1: Check if VIN appears in any hash
                const vinInHash = allHashes.some(hash => hash.includes(vin.substring(0, 8)));
                
                // Strategy 2: Check if last 8 characters of VIN appear in hash
                const vinSuffix = vin.substring(vin.length - 8);
                const suffixInHash = allHashes.some(hash => hash.includes(vinSuffix));
                
                // Strategy 3: Check if any part of VIN appears in hash
                const vinParts = vin.match(/.{1,4}/g) || [];
                const anyPartInHash = vinParts.some(part => 
                    allHashes.some(hash => hash.includes(part))
                );
                
                if (vinInHash || suffixInHash || anyPartInHash) {
                    potentialMatches++;
                    console.log(`\n🎯 Potential match found for ${vin}:`);
                    console.log(`   ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
                    console.log(`   VIN in hash: ${vinInHash}`);
                    console.log(`   VIN suffix in hash: ${suffixInHash}`);
                    console.log(`   VIN parts in hash: ${anyPartInHash}`);
                }
            }
            
            console.log(`\n📊 Found ${potentialMatches} potential matches out of ${allVehicles?.length || 0} vehicles`);
        }

        console.log('\n💡 Next Steps:');
        console.log('1. The hash appears to be a unique identifier for each vehicle');
        console.log('2. We need to find the relationship between VINs and these hashes');
        console.log('3. Possible approaches:');
        console.log('   - Scrape individual vehicle pages to find VIN in page content');
        console.log('   - Check if hash is derived from VIN using a known algorithm');
        console.log('   - Use Dealer.com feed to get both VIN and hash mapping');
        console.log('   - Check if hash is a stock number or inventory ID');

    } catch (error) {
        console.error('❌ Failed to analyze URL pattern:', error);
    }
}

analyzeUrlPattern();
