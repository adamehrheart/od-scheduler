#!/usr/bin/env node
// Create HomeNet Job Script
// Usage: node scripts/create-homenet-job.mjs --dealer-id=rsm-honda --rooftop-id=13157

import 'dotenv/config';
import { getSupabaseClient } from '../dist/src/utils.js';

const supabase = getSupabaseClient();

// Parse command line arguments
const args = process.argv.slice(2);
const dealerSlug = args.find(arg => arg.startsWith('--dealer-id='))?.split('=')[1];
const rooftopId = args.find(arg => arg.startsWith('--rooftop-id='))?.split('=')[1];

if (!dealerSlug || !rooftopId) {
  console.error('❌ Usage: node scripts/create-homenet-job.mjs --dealer-id=DEALER_SLUG --rooftop-id=ROOFTOP_ID');
  process.exit(1);
}

async function createHomeNetJob() {
  console.log(`🚀 Creating HomeNet job for dealer slug: ${dealerSlug}, rooftop: ${rooftopId}`);

  try {
    // Get the dealer UUID from the slug
    const { data: dealer, error: dealerError } = await supabase
      .from('dealers')
      .select('id, name, slug')
      .eq('slug', dealerSlug)
      .single();

    if (dealerError || !dealer) {
      console.error('❌ Error finding dealer:', dealerError || 'Dealer not found');
      return;
    }

    console.log(`📋 Found dealer: ${dealer.name} (${dealer.slug}) with UUID: ${dealer.id}`);

    const { data: job, error } = await supabase
      .from('job_queue')
      .insert({
        job_type: 'homenet_feed',
        status: 'pending',
        priority: 1,
        attempts: 0,
        max_attempts: 3,
        payload: {
          dealer_id: dealer.id, // Use the actual UUID
          dealer_slug: dealer.slug, // Keep the slug for reference
          rooftop_id: rooftopId,
          platform: 'homenet',
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

    console.log('✅ Successfully created HomeNet job:');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Dealer: ${dealer.name} (${dealer.slug})`);
    console.log(`   Dealer UUID: ${dealer.id}`);
    console.log(`   Rooftop ID: ${rooftopId}`);
    console.log(`   Status: ${job.status}`);

  } catch (error) {
    console.error('❌ Error creating HomeNet job:', error);
  }
}

createHomeNetJob().catch(console.error);
