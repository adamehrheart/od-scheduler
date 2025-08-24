#!/usr/bin/env node
// Analyze Job Errors
// Usage: node scripts/analyze-job-errors.mjs

import 'dotenv/config';
import { getSupabaseClient } from '../dist/src/utils.js';

const supabase = getSupabaseClient();

async function analyzeJobErrors() {
    console.log('🔍 Analyzing Job Errors...\n');

    try {
        // Get all failed jobs from the last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: failedJobs, error } = await supabase
            .from('job_queue')
            .select('id, job_type, error, attempts, created_at')
            .eq('status', 'failed')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching failed jobs:', error);
            return;
        }

        if (!failedJobs || failedJobs.length === 0) {
            console.log('✅ No failed jobs found in the last 7 days');
            return;
        }

        console.log(`📊 Found ${failedJobs.length} failed jobs in the last 7 days\n`);

        // Group by job type
        const errorsByType = {};
        const errorPatterns = {};

        failedJobs.forEach(job => {
            if (!errorsByType[job.job_type]) {
                errorsByType[job.job_type] = [];
            }
            errorsByType[job.job_type].push(job);

            // Extract error patterns
            const error = job.error || 'Unknown error';
            const pattern = extractErrorPattern(error);

            if (!errorPatterns[pattern]) {
                errorPatterns[pattern] = {
                    count: 0,
                    examples: [],
                    jobTypes: new Set()
                };
            }

            errorPatterns[pattern].count++;
            errorPatterns[pattern].examples.push(error);
            errorPatterns[pattern].jobTypes.add(job.job_type);
        });

        // Display analysis by job type
        console.log('📋 Errors by Job Type:');
        console.log('======================');
        Object.entries(errorsByType).forEach(([jobType, jobs]) => {
            console.log(`\n${jobType}: ${jobs.length} failures`);
            console.log('-'.repeat(jobType.length + 20));

            const errorCounts = {};
            jobs.forEach(job => {
                const error = job.error || 'Unknown error';
                errorCounts[error] = (errorCounts[error] || 0) + 1;
            });

            Object.entries(errorCounts)
                .sort(([, a], [, b]) => b - a)
                .forEach(([error, count]) => {
                    console.log(`  ${count}x: ${error.substring(0, 80)}${error.length > 80 ? '...' : ''}`);
                });
        });

        // Display error patterns
        console.log('\n🔍 Error Patterns:');
        console.log('==================');
        Object.entries(errorPatterns)
            .sort(([, a], [, b]) => b.count - a.count)
            .forEach(([pattern, data]) => {
                console.log(`\n${pattern}: ${data.count} occurrences`);
                console.log(`Job Types: ${Array.from(data.jobTypes).join(', ')}`);
                console.log('Examples:');
                data.examples.slice(0, 3).forEach(example => {
                    console.log(`  - ${example.substring(0, 100)}${example.length > 100 ? '...' : ''}`);
                });
            });

        // Recommendations
        console.log('\n💡 Recommendations:');
        console.log('===================');

        if (errorPatterns['rebrandly_api_error']) {
            console.log('• URL Shortening: Implement slashtag conflict resolution');
            console.log('• URL Shortening: Add retry logic for rate limiting');
        }

        if (errorPatterns['dealer_com_api_error']) {
            console.log('• Dealer.com Feed: Implement exponential backoff for 500 errors');
            console.log('• Dealer.com Feed: Add circuit breaker pattern');
        }

        if (errorPatterns['undefined_property_error']) {
            console.log('• Product Detail Scraping: Add null/undefined checks');
            console.log('• Product Detail Scraping: Improve error handling for malformed data');
        }

        if (errorPatterns['network_timeout_error']) {
            console.log('• All Jobs: Increase timeout values');
            console.log('• All Jobs: Implement connection pooling');
        }

    } catch (error) {
        console.error('❌ Error analyzing job errors:', error);
    }
}

function extractErrorPattern(error) {
    const errorStr = error.toLowerCase();

    if (errorStr.includes('rebrandly api error')) return 'rebrandly_api_error';
    if (errorStr.includes('dealer.com') && errorStr.includes('500')) return 'dealer_com_api_error';
    if (errorStr.includes('cannot read properties of undefined')) return 'undefined_property_error';
    if (errorStr.includes('timeout') || errorStr.includes('network')) return 'network_timeout_error';
    if (errorStr.includes('rate limit') || errorStr.includes('429')) return 'rate_limit_error';
    if (errorStr.includes('already exists')) return 'duplicate_error';
    if (errorStr.includes('invalid format')) return 'validation_error';

    return 'unknown_error';
}

analyzeJobErrors();
