#!/usr/bin/env node
// Check Job Queue Status
// Usage: node scripts/check-job-queue.mjs

import 'dotenv/config';
import { getSupabaseClient } from '../dist/src/utils.js';

const supabase = getSupabaseClient();

async function checkJobQueue() {
    console.log('🔍 Checking Job Queue Status...\n');

    try {
        // Check job counts by status
        const { data: statusCounts, error: statusError } = await supabase
            .from('job_queue')
            .select('status');

        if (statusError) {
            console.error('❌ Error checking job status:', statusError);
            return;
        }

        const counts = {};
        statusCounts.forEach(job => {
            counts[job.status] = (counts[job.status] || 0) + 1;
        });

        console.log('📊 Job Queue Status:');
        console.log('===================');
        Object.entries(counts).forEach(([status, count]) => {
            console.log(`${status}: ${count}`);
        });

        // Check for stuck processing jobs (older than 30 minutes)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: stuckJobs, error: stuckError } = await supabase
            .from('job_queue')
            .select('id, job_type, status, started_at, attempts, error')
            .eq('status', 'processing')
            .lt('started_at', thirtyMinutesAgo);

        if (stuckError) {
            console.error('❌ Error checking stuck jobs:', stuckError);
            return;
        }

        if (stuckJobs && stuckJobs.length > 0) {
            console.log('\n⚠️  Stuck Processing Jobs (>30 min):');
            console.log('===================================');
            stuckJobs.forEach(job => {
                console.log(`ID: ${job.id}`);
                console.log(`Type: ${job.job_type}`);
                console.log(`Started: ${job.started_at}`);
                console.log(`Attempts: ${job.attempts}`);
                console.log(`Error: ${job.error || 'None'}`);
                console.log('---');
            });
        } else {
            console.log('\n✅ No stuck processing jobs found');
        }

        // Check recent failed jobs
        const { data: recentFailed, error: failedError } = await supabase
            .from('job_queue')
            .select('id, job_type, status, error, created_at')
            .eq('status', 'failed')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(5);

        if (failedError) {
            console.error('❌ Error checking failed jobs:', failedError);
            return;
        }

        if (recentFailed && recentFailed.length > 0) {
            console.log('\n❌ Recent Failed Jobs (last 24h):');
            console.log('=================================');
            recentFailed.forEach(job => {
                console.log(`ID: ${job.id}`);
                console.log(`Type: ${job.job_type}`);
                console.log(`Created: ${job.created_at}`);
                console.log(`Error: ${job.error || 'Unknown'}`);
                console.log('---');
            });
        } else {
            console.log('\n✅ No recent failed jobs');
        }

        // Check retry jobs
        const { data: retryJobs, error: retryError } = await supabase
            .from('job_queue')
            .select('id, job_type, attempts, max_attempts, error, scheduled_at')
            .eq('status', 'retry')
            .order('scheduled_at', { ascending: true })
            .limit(10);

        if (retryError) {
            console.error('❌ Error checking retry jobs:', retryError);
            return;
        }

        if (retryJobs && retryJobs.length > 0) {
            console.log('\n🔄 Retry Jobs:');
            console.log('==============');
            retryJobs.forEach(job => {
                console.log(`ID: ${job.id}`);
                console.log(`Type: ${job.job_type}`);
                console.log(`Attempts: ${job.attempts}/${job.max_attempts}`);
                console.log(`Scheduled: ${job.scheduled_at}`);
                console.log(`Error: ${job.error || 'Unknown'}`);
                console.log('---');
            });
        } else {
            console.log('\n✅ No retry jobs');
        }

    } catch (error) {
        console.error('❌ Error checking job queue:', error);
    }
}

checkJobQueue();
