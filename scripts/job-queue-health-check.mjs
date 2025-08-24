#!/usr/bin/env node
// Job Queue Health Check and Monitoring
// Usage: node scripts/job-queue-health-check.mjs [--detailed] [--fix-issues]

import 'dotenv/config';
import { getSupabaseClient } from '../dist/src/utils.js';

const supabase = getSupabaseClient();
const args = process.argv.slice(2);
const detailed = args.includes('--detailed');
const fixIssues = args.includes('--fix-issues');

async function performHealthCheck() {
  console.log('🏥 Job Queue Health Check...\n');
  
  const healthReport = {
    overall: 'healthy',
    issues: [],
    warnings: [],
    metrics: {},
    recommendations: []
  };

  try {
    // 1. Check overall job distribution
    const { data: allJobs, error: countError } = await supabase
      .from('job_queue')
      .select('status, job_type, created_at');
    
    if (countError) {
      healthReport.overall = 'error';
      healthReport.issues.push(`Failed to fetch job data: ${countError.message}`);
      return healthReport;
    }

    const statusCounts = {};
    const typeCounts = {};
    const recentJobs = allJobs.filter(job => {
      const jobDate = new Date(job.created_at);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return jobDate > oneDayAgo;
    });

    allJobs.forEach(job => {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
      typeCounts[job.job_type] = (typeCounts[job.job_type] || 0) + 1;
    });

    healthReport.metrics = {
      totalJobs: allJobs.length,
      recentJobs: recentJobs.length,
      statusDistribution: statusCounts,
      typeDistribution: typeCounts
    };

    // 2. Check for stuck jobs
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckJobs } = await supabase
      .from('job_queue')
      .select('id, job_type, started_at, attempts')
      .eq('status', 'processing')
      .lt('started_at', thirtyMinutesAgo);

    if (stuckJobs && stuckJobs.length > 0) {
      healthReport.overall = 'warning';
      healthReport.warnings.push(`Found ${stuckJobs.length} stuck processing jobs`);
      
      if (detailed) {
        stuckJobs.forEach(job => {
          healthReport.warnings.push(`  - Job ${job.id} (${job.job_type}) stuck since ${job.started_at}`);
        });
      }
    }

    // 3. Check failure rates
    const failureRate = (statusCounts.failed || 0) / allJobs.length;
    if (failureRate > 0.1) { // More than 10% failure rate
      healthReport.overall = 'warning';
      healthReport.warnings.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }

    // 4. Check for specific error patterns
    const { data: failedJobs } = await supabase
      .from('job_queue')
      .select('job_type, error, created_at')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (failedJobs && failedJobs.length > 0) {
      const errorPatterns = {};
      failedJobs.forEach(job => {
        const error = job.error || 'Unknown error';
        const pattern = extractErrorPattern(error);
        if (!errorPatterns[pattern]) {
          errorPatterns[pattern] = { count: 0, jobTypes: new Set() };
        }
        errorPatterns[pattern].count++;
        errorPatterns[pattern].jobTypes.add(job.job_type);
      });

      // Check for critical error patterns
      Object.entries(errorPatterns).forEach(([pattern, data]) => {
        if (data.count >= 3) {
          healthReport.warnings.push(`Recurring ${pattern} errors: ${data.count} occurrences`);
          healthReport.recommendations.push(`Investigate and fix ${pattern} errors for ${Array.from(data.jobTypes).join(', ')}`);
        }
      });
    }

    // 5. Check job processing throughput
    const { data: completedJobs } = await supabase
      .from('job_queue')
      .select('created_at, completed_at')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

    if (completedJobs && completedJobs.length > 0) {
      const avgProcessingTime = completedJobs.reduce((sum, job) => {
        const created = new Date(job.created_at);
        const completed = new Date(job.completed_at);
        return sum + (completed.getTime() - created.getTime());
      }, 0) / completedJobs.length;

      healthReport.metrics.avgProcessingTimeMs = avgProcessingTime;
      
      if (avgProcessingTime > 300000) { // More than 5 minutes
        healthReport.warnings.push(`Slow job processing: ${(avgProcessingTime / 1000).toFixed(1)}s average`);
      }
    }

    // 6. Check for retry loops
    const { data: retryJobs } = await supabase
      .from('job_queue')
      .select('id, job_type, attempts, max_attempts, error')
      .eq('status', 'retry')
      .gte('attempts', 2);

    if (retryJobs && retryJobs.length > 0) {
      healthReport.warnings.push(`${retryJobs.length} jobs in retry loops (2+ attempts)`);
      
      if (detailed) {
        retryJobs.forEach(job => {
          healthReport.warnings.push(`  - Job ${job.id} (${job.job_type}): ${job.attempts}/${job.max_attempts} attempts`);
        });
      }
    }

    // 7. Check for job type imbalances
    Object.entries(typeCounts).forEach(([jobType, count]) => {
      const percentage = (count / allJobs.length) * 100;
      if (percentage > 80) {
        healthReport.warnings.push(`Job type imbalance: ${jobType} represents ${percentage.toFixed(1)}% of all jobs`);
      }
    });

    // Generate recommendations
    if (healthReport.warnings.length > 0) {
      healthReport.recommendations.push('Run job queue management: node scripts/manage-job-queue.mjs reset-stuck');
      healthReport.recommendations.push('Monitor error patterns and implement fixes');
    }

    if (failureRate > 0.05) {
      healthReport.recommendations.push('Investigate high failure rate and improve error handling');
    }

    return healthReport;

  } catch (error) {
    healthReport.overall = 'error';
    healthReport.issues.push(`Health check failed: ${error.message}`);
    return healthReport;
  }
}

function extractErrorPattern(error) {
  const errorStr = error.toLowerCase();
  
  if (errorStr.includes('rebrandly api error')) return 'rebrandly_api_error';
  if (errorStr.includes('dealer.com') && errorStr.includes('500')) return 'dealer_com_server_error';
  if (errorStr.includes('cannot read properties of undefined')) return 'undefined_property_error';
  if (errorStr.includes('timeout') || errorStr.includes('network')) return 'network_timeout_error';
  if (errorStr.includes('rate limit') || errorStr.includes('429')) return 'rate_limit_error';
  if (errorStr.includes('already exists')) return 'duplicate_error';
  if (errorStr.includes('invalid format')) return 'validation_error';
  
  return 'unknown_error';
}

async function displayHealthReport(report) {
  const statusIcons = {
    healthy: '✅',
    warning: '⚠️',
    error: '❌'
  };

  console.log(`${statusIcons[report.overall]} Overall Status: ${report.overall.toUpperCase()}\n`);

  if (report.issues.length > 0) {
    console.log('❌ Issues:');
    report.issues.forEach(issue => console.log(`  - ${issue}`));
    console.log('');
  }

  if (report.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    report.warnings.forEach(warning => console.log(`  - ${warning}`));
    console.log('');
  }

  console.log('📊 Metrics:');
  console.log('===========');
  console.log(`Total Jobs: ${report.metrics.totalJobs}`);
  console.log(`Recent Jobs (24h): ${report.metrics.recentJobs}`);
  
  if (report.metrics.avgProcessingTimeMs) {
    console.log(`Avg Processing Time: ${(report.metrics.avgProcessingTimeMs / 1000).toFixed(1)}s`);
  }

  console.log('\nStatus Distribution:');
  Object.entries(report.metrics.statusDistribution || {}).forEach(([status, count]) => {
    const icon = status === 'completed' ? '✅' : 
                 status === 'failed' ? '❌' : 
                 status === 'processing' ? '🔄' : 
                 status === 'retry' ? '⏳' : '📋';
    console.log(`  ${icon} ${status}: ${count}`);
  });

  console.log('\nJob Type Distribution:');
  Object.entries(report.metrics.typeDistribution || {}).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    console.log('===================');
    report.recommendations.forEach(rec => console.log(`  • ${rec}`));
  }

  return report.overall === 'healthy';
}

async function main() {
  const report = await performHealthCheck();
  const isHealthy = await displayHealthReport(report);

  if (fixIssues && report.warnings.length > 0) {
    console.log('\n🔧 Attempting to fix issues...');
    
    // Reset stuck jobs
    if (report.warnings.some(w => w.includes('stuck'))) {
      console.log('Resetting stuck jobs...');
      // This would call the management script
    }
  }

  process.exit(isHealthy ? 0 : 1);
}

main().catch(console.error);
