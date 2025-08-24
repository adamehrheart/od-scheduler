#!/usr/bin/env node
// Job Queue Management Script
// Usage: node scripts/manage-job-queue.mjs [action] [options]
// Actions: reset-stuck, retry-failed, cleanup-old, status

import 'dotenv/config';
import { getSupabaseClient } from '../dist/src/utils.js';

const supabase = getSupabaseClient();

const action = process.argv[2] || 'status';
const options = process.argv.slice(3);

async function resetStuckJobs() {
  console.log('🔄 Resetting stuck processing jobs...\n');

  try {
    // Find jobs stuck in processing for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckJobs, error } = await supabase
      .from('job_queue')
      .select('id, job_type, attempts, max_attempts, error')
      .eq('status', 'processing')
      .lt('started_at', thirtyMinutesAgo);

    if (error) {
      console.error('❌ Error finding stuck jobs:', error);
      return;
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log('✅ No stuck jobs found');
      return;
    }

    console.log(`Found ${stuckJobs.length} stuck jobs to reset`);

    for (const job of stuckJobs) {
      const shouldRetry = job.attempts < job.max_attempts;
      const newStatus = shouldRetry ? 'retry' : 'failed';
      const errorMessage = shouldRetry
        ? `Job reset from stuck processing state (attempt ${job.attempts + 1}/${job.max_attempts})`
        : `Job failed after ${job.attempts} attempts - max attempts exceeded`;

      const { error: updateError } = await supabase
        .from('job_queue')
        .update({
          status: newStatus,
          attempts: shouldRetry ? job.attempts + 1 : job.attempts,
          error: errorMessage,
          started_at: null,
          completed_at: newStatus === 'failed' ? new Date().toISOString() : null
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`❌ Failed to reset job ${job.id}:`, updateError);
      } else {
        console.log(`✅ Reset job ${job.id} (${job.job_type}) to ${newStatus}`);
      }
    }

    console.log('\n✅ Stuck job reset complete');

  } catch (error) {
    console.error('❌ Error resetting stuck jobs:', error);
  }
}

async function retryFailedJobs() {
  console.log('🔄 Retrying failed jobs...\n');

  try {
    // Find failed jobs that can be retried
    const { data: failedJobs, error } = await supabase
      .from('job_queue')
      .select('id, job_type, attempts, max_attempts, error, payload')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(10);

    // Filter jobs that can be retried
    const retryableJobs = failedJobs?.filter(job => job.attempts < job.max_attempts) || [];

    if (error) {
      console.error('❌ Error finding failed jobs:', error);
      return;
    }

    if (!retryableJobs || retryableJobs.length === 0) {
      console.log('✅ No failed jobs to retry');
      return;
    }

    console.log(`Found ${retryableJobs.length} failed jobs to retry`);

    for (const job of retryableJobs) {
      const { error: updateError } = await supabase
        .from('job_queue')
        .update({
          status: 'retry',
          attempts: job.attempts + 1,
          error: `Retrying failed job (attempt ${job.attempts + 1}/${job.max_attempts})`,
          started_at: null,
          completed_at: null
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`❌ Failed to retry job ${job.id}:`, updateError);
      } else {
        console.log(`✅ Queued job ${job.id} (${job.job_type}) for retry`);
      }
    }

    console.log('\n✅ Failed job retry complete');

  } catch (error) {
    console.error('❌ Error retrying failed jobs:', error);
  }
}

async function cleanupOldJobs() {
  console.log('🧹 Cleaning up old completed jobs...\n');

  try {
    // Remove completed jobs older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: oldJobs, error: findError } = await supabase
      .from('job_queue')
      .select('id, job_type, status, created_at')
      .eq('status', 'completed')
      .lt('created_at', sevenDaysAgo);

    if (findError) {
      console.error('❌ Error finding old jobs:', findError);
      return;
    }

    if (!oldJobs || oldJobs.length === 0) {
      console.log('✅ No old completed jobs to clean up');
      return;
    }

    console.log(`Found ${oldJobs.length} old completed jobs to clean up`);

    const { error: deleteError } = await supabase
      .from('job_queue')
      .delete()
      .eq('status', 'completed')
      .lt('created_at', sevenDaysAgo);

    if (deleteError) {
      console.error('❌ Error deleting old jobs:', deleteError);
    } else {
      console.log(`✅ Cleaned up ${oldJobs.length} old completed jobs`);
    }

  } catch (error) {
    console.error('❌ Error cleaning up old jobs:', error);
  }
}

async function showStatus() {
  console.log('📊 Job Queue Status...\n');

  try {
    // Get overall counts
    const { data: allJobs, error } = await supabase
      .from('job_queue')
      .select('status, job_type');

    if (error) {
      console.error('❌ Error getting job status:', error);
      return;
    }

    const statusCounts = {};
    const typeCounts = {};

    allJobs.forEach(job => {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
      typeCounts[job.job_type] = (typeCounts[job.job_type] || 0) + 1;
    });

    console.log('📈 Overall Status:');
    console.log('==================');
    Object.entries(statusCounts).forEach(([status, count]) => {
      const icon = status === 'completed' ? '✅' :
        status === 'failed' ? '❌' :
          status === 'processing' ? '🔄' :
            status === 'retry' ? '⏳' : '📋';
      console.log(`${icon} ${status}: ${count}`);
    });

    console.log('\n📋 By Job Type:');
    console.log('===============');
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`${type}: ${count}`);
    });

    // Check for stuck jobs
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckJobs } = await supabase
      .from('job_queue')
      .select('id, job_type, started_at')
      .eq('status', 'processing')
      .lt('started_at', thirtyMinutesAgo);

    if (stuckJobs && stuckJobs.length > 0) {
      console.log(`\n⚠️  Stuck Jobs: ${stuckJobs.length}`);
    }

  } catch (error) {
    console.error('❌ Error showing status:', error);
  }
}

async function main() {
  switch (action) {
    case 'reset-stuck':
      await resetStuckJobs();
      break;
    case 'retry-failed':
      await retryFailedJobs();
      break;
    case 'cleanup-old':
      await cleanupOldJobs();
      break;
    case 'status':
    default:
      await showStatus();
      break;
  }
}

main().catch(console.error);
