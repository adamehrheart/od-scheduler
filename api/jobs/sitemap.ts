import { SchedulerService } from '../../src/scheduler.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 10 } = req.query;
    const maxJobs = typeof limit === 'string' ? parseInt(limit, 10) : limit;

    const scheduler = new SchedulerService();
    const result = await scheduler.processSitemapJobs(maxJobs);

    res.status(200).json(result);
  } catch (error) {
    console.error('Sitemap processing error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
