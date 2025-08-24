import { createServer } from 'node:http'
import { SchedulerService } from './scheduler.js'
import { processUrlShorteningJobsEnhanced } from './jobs/url-shortening-enhanced.js'
import { processProductDetailScrapingJobsEnhanced } from './jobs/product-detail-scraping-enhanced.js'

const PORT = 3003

/**
 * Simple development server for the Open Dealer Scheduler
 * Provides HTTP endpoints to test scheduler functionality locally
 */

const scheduler = new SchedulerService()

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  try {
    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        service: 'od-scheduler',
        timestamp: new Date().toISOString()
      }))
      return
    }

    // Run all scheduled jobs
    if (req.method === 'POST' && url.pathname === '/api/jobs/run') {
      console.log('🚀 Running scheduled jobs...')
      const result = await scheduler.runJobs()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result, null, 2))
      return
    }

    // Process URL shortening jobs
    if (req.method === 'POST' && url.pathname === '/api/jobs/url-shortening') {
      const limit = parseInt(url.searchParams.get('limit') || '10')
      console.log(`🔗 Processing URL shortening jobs (limit: ${limit})...`)
      const result = await processUrlShorteningJobsEnhanced(limit)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result, null, 2))
      return
    }

    // Process sitemap jobs
    if (req.method === 'POST' && url.pathname === '/api/jobs/sitemap') {
      const limit = parseInt(url.searchParams.get('limit') || '10')
      console.log(`🗺️ Processing sitemap jobs (limit: ${limit})...`)
      const result = await scheduler.processSitemapJobs(limit)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result, null, 2))
      return
    }

    // Process product detail scraping jobs
    if (req.method === 'POST' && url.pathname === '/api/jobs/product-detail-scraping') {
      const limit = parseInt(url.searchParams.get('limit') || '10')
      console.log(`🔍 Processing product detail scraping jobs (limit: ${limit})...`)
      const result = await processProductDetailScrapingJobsEnhanced(limit)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result, null, 2))
      return
    }

    // Manual job trigger for specific dealer
    if (req.method === 'POST' && url.pathname === '/api/jobs/dealer') {
      const dealerId = url.searchParams.get('dealer_id')
      if (!dealerId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'dealer_id parameter required' }))
        return
      }

      console.log(`🏪 Running jobs for dealer: ${dealerId}`)
      const result = await scheduler.runJobs({ dealer_id: dealerId, force: true })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result, null, 2))
      return
    }

    // Root endpoint - API documentation
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        service: 'Open Dealer Scheduler - Development Server',
        version: '1.0.0',
        endpoints: {
          'GET /health': 'Health check',
          'POST /api/jobs/run': 'Run all scheduled jobs',
          'POST /api/jobs/url-shortening?limit=N': 'Process URL shortening jobs',
          'POST /api/jobs/sitemap?limit=N': 'Process sitemap jobs',
          'POST /api/jobs/product-detail-scraping?limit=N': 'Process product detail scraping jobs',
          'POST /api/jobs/dealer?dealer_id=ID': 'Run jobs for specific dealer'
        },
        examples: {
          'Health check': `curl http://localhost:${PORT}/health`,
          'Run all jobs': `curl -X POST http://localhost:${PORT}/api/jobs/run`,
          'Process URL shortening': `curl -X POST http://localhost:${PORT}/api/jobs/url-shortening?limit=5`,
          'Process sitemap': `curl -X POST http://localhost:${PORT}/api/jobs/sitemap?limit=5`,
          'Process product detail scraping': `curl -X POST http://localhost:${PORT}/api/jobs/product-detail-scraping?limit=5`,
          'Run dealer jobs': `curl -X POST http://localhost:${PORT}/api/jobs/dealer?dealer_id=DEALER_ID`
        }
      }, null, 2))
      return
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not Found' }))

  } catch (error: any) {
    console.error('Server error:', error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }))
  }
})

server.listen(PORT, () => {
  console.log(`🚀 Open Dealer Scheduler Development Server`)
  console.log(`📡 Server running on http://localhost:${PORT}`)
  console.log(`📋 API documentation: http://localhost:${PORT}`)
  console.log(`💚 Health check: http://localhost:${PORT}/health`)
  console.log('')
  console.log('Available endpoints:')
  console.log(`  🔗 URL Shortening: curl -X POST http://localhost:${PORT}/api/jobs/url-shortening`)
  console.log(`  🏪 All Jobs: curl -X POST http://localhost:${PORT}/api/jobs/run`)
  console.log('')
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down scheduler development server...')
  server.close(() => {
    console.log('✅ Server closed')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...')
  server.close(() => {
    console.log('✅ Server closed')
    process.exit(0)
  })
})
