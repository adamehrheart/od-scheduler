import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SchedulerService } from '../../src/scheduler.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a cron job request
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const scheduler = new SchedulerService()
    const result = await scheduler.processProductDetailScrapingJobs(20)

    console.log('Product detail scraping cron job completed:', result)

    res.status(200).json({
      message: 'Product detail scraping cron job completed',
      ...result
    })

  } catch (error: any) {
    console.error('Product detail scraping cron job error:', error)

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    })
  }
}
