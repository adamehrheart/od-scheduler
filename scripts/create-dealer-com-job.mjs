#!/usr/bin/env node
// Create Dealer.com Scraping Job Script
// Usage: node scripts/create-dealer-com-job.mjs --dealer-id=rsm-honda

import 'dotenv/config';
import { getSupabaseClient } from '../dist/src/utils.js';

const supabase = getSupabaseClient();

// Parse command line arguments
const args = process.argv.slice(2);
const dealerSlug = args.find(arg => arg.startsWith('--dealer-id='))?.split('=')[1];

if (!dealerSlug) {
  console.error('❌ Usage: node scripts/create-dealer-com-job.mjs --dealer-id=DEALER_SLUG');
  process.exit(1);
}

async function createDealerComJob() {
  console.log(`🚀 Creating Dealer.com scraping job for dealer slug: ${dealerSlug}`);

  try {
    // Get the dealer UUID from the slug
    const { data: dealer, error: dealerError } = await supabase
      .from('dealers')
      .select('id, name, slug, domain, website')
      .eq('slug', dealerSlug)
      .single();

    if (dealerError || !dealer) {
      console.error('❌ Error finding dealer:', dealerError || 'Dealer not found');
      return;
    }

    console.log(`📋 Found dealer: ${dealer.name} (${dealer.slug}) with UUID: ${dealer.id}`);
    console.log(`🌐 Domain: ${dealer.domain || 'Not configured'}`);
    console.log(`🌐 Website: ${dealer.website || 'Not configured'}`);

    // Use domain if available, otherwise use website
    const websiteUrl = dealer.website || (dealer.domain ? `https://${dealer.domain}` : null);

    if (!websiteUrl) {
      console.warn('⚠️  Warning: Dealer website URL not configured. Scraping may not work.');
    }

    const { data: job, error } = await supabase
      .from('job_queue')
      .insert({
        job_type: 'dealer_com_feed',
        status: 'pending',
        priority: 2, // Lower priority than HomeNet (priority 1)
        attempts: 0,
        max_attempts: 3,
        payload: {
          dealer_id: dealer.id, // Use the actual UUID
          dealer_slug: dealer.slug, // Keep the slug for reference
          website_url: websiteUrl,
          platform: 'dealer.com',
          environment: 'production'
        },
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating job:', error);
      return;
    }

    console.log('✅ Successfully created Dealer.com scraping job:');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Dealer: ${dealer.name} (${dealer.slug})`);
    console.log(`   Dealer UUID: ${dealer.id}`);
    console.log(`   Website: ${websiteUrl || 'Not configured'}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Priority: ${job.priority} (lower than HomeNet jobs)`);

  } catch (error) {
    console.error('❌ Error creating Dealer.com scraping job:', error);
  }
}

createDealerComJob().catch(console.error);
