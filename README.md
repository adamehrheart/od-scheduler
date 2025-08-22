# Open Dealer Scheduler Service

A serverless scheduling service built on Vercel that manages data pull jobs for the Open Dealer platform. This service orchestrates the execution of scheduled jobs for fetching vehicle inventory from various platforms like HomeNet, Dealer.com, and web scraping.

## 🚀 Features

- **Automated Scheduling**: Cron-based job execution daily at 9 AM
- **Multi-Platform Support**: HomeNet, Dealer.com, Web Scraping, VinSolutions, DealerSocket, Cobalt
- **Concurrency Control**: Parallel job execution with rate limiting
- **Comprehensive Monitoring**: Job status tracking and performance metrics
- **Automatic Cleanup**: Daily cleanup of old execution records at 2 AM
- **Manual Execution**: On-demand job execution for testing
- **Error Handling**: Robust error handling and retry logic
- **Production Ready**: Deployed and tested on Vercel

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vercel        │    │   Scheduler     │    │   Apify/Jobs    │
│   Cron Jobs     │───▶│   Service       │───▶│   (Execution)   │
│   (Hosting)     │    │   (Logic)       │    │   (Scrapers)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PayloadCMS    │    │   Supabase      │    │   Data API      │
│   (Job Config)  │    │   (Job History) │    │   (Ingestion)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+ or 20+
- Vercel CLI
- Supabase project with proper tables
- Environment variables configured

## 🛠️ Installation

1. **Clone and install dependencies:**
   ```bash
   cd od-scheduler
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```

3. **Configure environment variables:**
   ```env
   # Supabase Configuration
   OD_SUPABASE_URL=your_supabase_url
   OD_SUPABASE_SERVICE_ROLE=your_service_role_key

   # API Endpoints
   OD_DATA_API_URL=https://od-data-api.vercel.app
   OD_SOAP_TRANSFORMER_URL=https://od-soap-transformer.vercel.app
   OD_BEARER_TOKEN=your_bearer_token

   # HomeNet Configuration
   OD_HOMENET_INTEGRATION_TOKEN=your_homenet_token
   OD_HOMENET_ROOFTOP_COLLECTION=your_rooftop_collection

   # Apify Configuration (for scraping)
   APIFY_API_URL=https://api.apify.com/v2
   APIFY_TOKEN=your_apify_token

   # API Keys
   OD_API_KEY_SECRET=your_api_key_secret
   ```

4. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```

## 🚀 Deployment Status

**Production URL**: https://od-scheduler.vercel.app

**Status**: ✅ **Deployed and Operational**

**Environment Variables**: ✅ **Configured**
- Supabase connection established
- Bearer token authentication active
- API endpoints configured
- Cron jobs scheduled

**API Endpoints Tested**: ✅ **All Working**
- `/api/jobs/run` - Manual job execution
- `/api/cron/run-jobs` - Daily job execution (9 AM)
- `/api/cron/cleanup` - Daily cleanup (2 AM)
- `/api/jobs/status` - Job status monitoring

## 🔧 Configuration

### Cron Jobs

The service uses Vercel Cron Jobs with the following schedule:

- **Job Execution**: Daily at 9 AM (`0 9 * * *`)
- **Cleanup**: Daily at 2 AM (`0 2 * * *`)

> **Note**: Due to Vercel Hobby plan limitations, cron jobs are limited to daily execution. For more frequent execution, upgrade to Vercel Pro plan.

### Job Scheduling

Jobs are automatically scheduled based on platform:

- **HomeNet**: Daily
- **Dealer.com**: Hourly
- **Web Scraping**: Daily
- **Other Platforms**: Daily (default)

## 📡 API Endpoints

### Cron Endpoints

- `POST /api/cron/run-jobs` - Execute scheduled jobs (called by Vercel cron)
- `POST /api/cron/cleanup` - Clean up old records (called by Vercel cron)

### Manual Endpoints

- `POST /api/jobs/run` - Manually execute jobs
  ```json
  {
    "force": true,
    "dealer_id": "optional-dealer-id",
    "platform": "optional-platform"
  }
  ```

- `GET /api/jobs/status` - Get job status and statistics
  ```
  /api/jobs/status?dealer_id=123&platform=homenet&limit=50
  ```

## 🏃‍♂️ Usage

### Local Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Test endpoints
curl -X POST http://localhost:3000/api/jobs/run \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### Production Deployment

```bash
# Deploy to Vercel
vercel --prod

# Check deployment status
vercel ls
```

### Monitoring

```bash
# Check job status
curl https://your-scheduler.vercel.app/api/jobs/status

# Get recent executions
curl https://your-scheduler.vercel.app/api/jobs/status?limit=10
```

## 📊 Database Schema

### Job Executions Table

```sql
CREATE TABLE job_executions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  dealer_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  vehicles_found INTEGER DEFAULT 0,
  vehicles_processed INTEGER DEFAULT 0,
  errors TEXT[],
  performance_metrics JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔍 Monitoring & Alerting

### Logs

All job executions are logged with:
- Execution start/end times
- Vehicle counts
- Performance metrics
- Error details

### Metrics

Tracked metrics include:
- Jobs executed per day
- Success/failure rates
- Average execution time
- Platform-specific performance

### Alerts

Configure alerts for:
- High failure rates
- Long execution times
- Missing executions
- System errors

## 🚨 Error Handling

The service includes comprehensive error handling:

- **Retry Logic**: Automatic retries for transient failures
- **Graceful Degradation**: Continues processing other jobs if one fails
- **Detailed Logging**: Full error context for debugging
- **Status Tracking**: Persistent job execution status

## 🔒 Security

- **Environment Variables**: All sensitive data stored in environment variables
- **Service Role**: Uses Supabase service role for database access
- **API Keys**: Secure API key management for external services
- **Rate Limiting**: Built-in rate limiting to prevent abuse

## 🧪 Testing

```bash
# Run tests
npm test

# Run type checking
npm run type-check

# Run linting
npm run lint
```

## 📈 Performance

### Optimization Features

- **Concurrency Control**: Limits parallel job execution
- **Connection Pooling**: Efficient database connections
- **Caching**: Intelligent caching of frequently accessed data
- **Batch Processing**: Bulk operations for better performance

### Scaling

The service automatically scales with:
- **Vercel Edge Functions**: Global distribution
- **Serverless Architecture**: Pay-per-execution
- **Auto-scaling**: Handles traffic spikes automatically

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is part of the Open Dealer platform and follows the same licensing terms.

## 🆘 Support

For support and questions:
- Check the logs in Vercel dashboard
- Review the API documentation
- Contact the development team

## 🔄 Changelog

### v1.0.0
- Initial release
- Basic job scheduling and execution
- HomeNet and Dealer.com integration
- Vercel cron job setup
- Monitoring and status endpoints
