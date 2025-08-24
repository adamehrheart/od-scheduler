#!/usr/bin/env node

// List and optionally delete Rebrandly short URLs
import dotenv from 'dotenv';

dotenv.config();

const rebrandlyApiKey = process.env.OD_REBRANDLY_API_KEY;

if (!rebrandlyApiKey) {
    console.error('❌ Rebrandly API key not configured');
    process.exit(1);
}

async function clearRebrandlyUrls() {
    console.log('🔍 Listing Rebrandly short URLs...\n');

    try {
        // Get all links from Rebrandly
        const response = await fetch('https://api.rebrandly.com/v1/links', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'apikey': rebrandlyApiKey,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Rebrandly API error: ${response.status} ${JSON.stringify(errorData)}`);
        }

        const links = await response.json();
        
        console.log(`📊 Found ${links.length} short URLs in Rebrandly:`);
        
        // Filter for our Open Dealer links
        const openDealerLinks = links.filter(link => 
            link.slashtag && link.slashtag.startsWith('v1/llm/')
        );

        console.log(`\n🎯 Found ${openDealerLinks.length} Open Dealer short URLs:`);
        
        openDealerLinks.forEach((link, index) => {
            console.log(`${index + 1}. ${link.slashtag} -> ${link.destination}`);
            console.log(`   ID: ${link.id}, Created: ${link.createdAt}`);
        });

        if (openDealerLinks.length === 0) {
            console.log('\n✅ No Open Dealer short URLs found in Rebrandly');
            return;
        }

        console.log('\n⚠️  To delete these URLs, you can:');
        console.log('1. Use the Rebrandly dashboard to delete them manually');
        console.log('2. Or run this script with DELETE=true to delete them programmatically');
        
        // Check if user wants to delete
        const shouldDelete = process.argv.includes('DELETE=true');
        
        if (shouldDelete) {
            console.log('\n🗑️  Deleting Open Dealer short URLs...');
            
            for (const link of openDealerLinks) {
                try {
                    const deleteResponse = await fetch(`https://api.rebrandly.com/v1/links/${link.id}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': rebrandlyApiKey,
                        },
                    });

                    if (deleteResponse.ok) {
                        console.log(`✅ Deleted: ${link.slashtag}`);
                    } else {
                        console.log(`❌ Failed to delete: ${link.slashtag}`);
                    }
                } catch (error) {
                    console.log(`❌ Error deleting ${link.slashtag}: ${error.message}`);
                }
            }
            
            console.log('\n🎉 Deletion complete!');
        } else {
            console.log('\n💡 To delete these URLs, run:');
            console.log('doppler run -- node scripts/clear-rebrandly-urls.mjs DELETE=true');
        }

    } catch (error) {
        console.error('❌ Failed to list Rebrandly URLs:', error);
    }
}

clearRebrandlyUrls();
