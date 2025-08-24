#!/usr/bin/env node
// Test Enhanced Job Processors
// Usage: node scripts/test-enhanced-jobs.mjs

import 'dotenv/config';
import { processUrlShorteningJobsEnhanced } from '../dist/src/jobs/url-shortening-enhanced.js';
import { processProductDetailScrapingJobsEnhanced } from '../dist/src/jobs/product-detail-scraping-enhanced.js';

async function testEnhancedJobs() {
  console.log('🧪 Testing Enhanced Job Processors...\n');
  
  try {
    // Test URL Shortening Jobs
    console.log('🔗 Testing Enhanced URL Shortening Jobs...');
    console.log('==========================================');
    
    const urlShorteningResult = await processUrlShorteningJobsEnhanced(5);
    console.log('URL Shortening Results:', {
      processed: urlShorteningResult.processed,
      success: urlShorteningResult.success,
      failed: urlShorteningResult.failed,
      errors: urlShorteningResult.errors.length
    });
    
    if (urlShorteningResult.errors.length > 0) {
      console.log('URL Shortening Errors:');
      urlShorteningResult.errors.slice(0, 3).forEach(error => {
        console.log(`  - ${error}`);
      });
    }
    
    console.log('\n🔍 Testing Enhanced Product Detail Scraping Jobs...');
    console.log('===================================================');
    
    const scrapingResult = await processProductDetailScrapingJobsEnhanced(5);
    console.log('Product Detail Scraping Results:', {
      processed: scrapingResult.processed,
      success: scrapingResult.success,
      failed: scrapingResult.failed,
      errors: scrapingResult.errors.length
    });
    
    if (scrapingResult.errors.length > 0) {
      console.log('Product Detail Scraping Errors:');
      scrapingResult.errors.slice(0, 3).forEach(error => {
        console.log(`  - ${error}`);
      });
    }
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log('================');
    console.log(`URL Shortening: ${urlShorteningResult.success}/${urlShorteningResult.processed} successful`);
    console.log(`Product Scraping: ${scrapingResult.success}/${scrapingResult.processed} successful`);
    
    const totalProcessed = urlShorteningResult.processed + scrapingResult.processed;
    const totalSuccess = urlShorteningResult.success + scrapingResult.success;
    const totalFailed = urlShorteningResult.failed + scrapingResult.failed;
    
    console.log(`\nOverall: ${totalSuccess}/${totalProcessed} successful (${totalFailed} failed)`);
    
    if (totalFailed === 0) {
      console.log('✅ All enhanced job processors working correctly!');
    } else {
      console.log('⚠️  Some jobs failed - check error logs for details');
    }
    
  } catch (error) {
    console.error('❌ Error testing enhanced jobs:', error);
  }
}

testEnhancedJobs();
