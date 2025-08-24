import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SchedulerService } from '../../src/scheduler.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { maxJobs = 10 } = req.body

    const scheduler = new SchedulerService()
    const result = await scheduler.processProductDetailScrapingJobs(maxJobs)

    res.status(200).json({
      ...result
    })

  } catch (error: any) {
    console.error('Product detail scraping API error:', error)

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    })
  }
}
