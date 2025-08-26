import { SchedulerService } from '../../src/scheduler.js'
import { env } from '../../src/env.js';

export default async function handler(req: any, res: any) {
  // Verify this is a cron request
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔄 Starting scheduled sitemap processing...');

    const scheduler = new SchedulerService();
    const result = await scheduler.processSitemapJobs(50); // Process up to 50 jobs

    console.log('✅ Sitemap processing completed:', result);

    res.status(200).json({
      success: true,
      message: 'Sitemap processing completed',
      result
    });
  } catch (error) {
    console.error('❌ Sitemap processing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Sitemap processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
