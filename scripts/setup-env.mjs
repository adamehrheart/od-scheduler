#!/usr/bin/env node
// Script to set up all environment variables in Vercel
// Usage: node scripts/setup-env.mjs

import { execSync } from 'child_process';

const envVars = {
  'OD_HOMENET_INTEGRATION_TOKEN': 'your-homenet-integration-token',
  'OD_HOMENET_ROOFTOP_COLLECTION': 'your-rooftop-collection-id',
  'APIFY_API_URL': 'https://api.apify.com/v2',
  'APIFY_TOKEN': 'your-apify-token',
  'OD_API_KEY_SECRET': 'your-api-key-secret',
  'LOG_LEVEL': 'info',
  'MAX_CONCURRENT_JOBS': '5',
  'JOB_TIMEOUT_MS': '300000',
  'NODE_ENV': 'production'
};

async function setupEnvVars() {
  console.log('🚀 Setting up environment variables in Vercel...\n');

  for (const [key, value] of Object.entries(envVars)) {
    try {
      console.log(`Setting ${key}...`);
      execSync(`echo "${value}" | vercel env add ${key} production`, { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
      console.log(`✅ ${key} set successfully`);
    } catch (error) {
      console.log(`⚠️  ${key} may already exist or failed to set`);
    }
  }

  console.log('\n🎉 Environment variables setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Test the deployed scheduler endpoints');
  console.log('2. Verify cron jobs are configured correctly');
  console.log('3. Check Vercel dashboard for environment variables');
}

setupEnvVars();
