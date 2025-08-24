# Multi-Dealer Dependency Management System

## Overview

The Multi-Dealer Dependency Management System is an advanced job scheduling and processing system designed to handle complex dependency scenarios across multiple dealers in the Open Dealer platform. It provides intelligent job scheduling, parallel processing, and comprehensive dependency resolution.

## 🎯 Key Features

### **Intelligent Dependency Management**
- **Per-dealer dependency tracking**: Each dealer's jobs are processed independently
- **Cross-dealer isolation**: Failures in one dealer don't affect others
- **Dependency graph visualization**: Clear view of job relationships
- **Automatic cycle detection**: Prevents deadlocks and infinite loops

### **Parallel Processing**
- **Concurrent dealer processing**: Multiple dealers processed simultaneously
- **Safe parallel execution**: Jobs that can run in parallel are identified automatically
- **Resource optimization**: Configurable concurrency limits
- **Load balancing**: Intelligent distribution of processing load

### **Enhanced Error Handling**
- **Circuit breaker patterns**: Prevents cascading failures
- **Exponential backoff**: Intelligent retry strategies
- **Job-specific error handling**: Different strategies for different job types
- **Comprehensive logging**: Detailed error tracking and reporting

### **Performance Monitoring**
- **Real-time statistics**: Processing metrics and performance data
- **Dependency violation tracking**: Monitor for configuration issues
- **Throughput analysis**: Measure system efficiency
- **Success rate monitoring**: Track job completion rates

## 🏗️ Architecture

### **Core Components**

#### **MultiDealerDependencyManager**
The main orchestrator that manages the entire multi-dealer job processing workflow.

```typescript
const dependencyManager = new MultiDealerDependencyManager(
  maxConcurrentDealers,    // Number of dealers to process simultaneously
  maxConcurrentJobsPerDealer // Number of jobs per dealer to process simultaneously
);
```

#### **Dependency Graph**
A directed acyclic graph (DAG) that represents job dependencies across all dealers.

```typescript
interface DependencyGraph {
  nodes: Map<string, DealerDependency>;  // Job nodes with metadata
  edges: Array<{ from: string; to: string }>;  // Dependency relationships
  cycles: string[][];  // Detected dependency cycles
}
```

#### **Enhanced Error Handler**
Provides robust error handling with circuit breakers and retry logic.

```typescript
const errorHandler = new EnhancedErrorHandler();
// Automatically handles retries, circuit breakers, and error categorization
```

### **Job Types and Dependencies**

#### **Job Hierarchy**
1. **HomeNet Feed** (Priority 1) - No dependencies
2. **Dealer.com Feed** (Priority 2) - Depends on HomeNet
3. **Product Detail Scraping** (Priority 3) - Depends on HomeNet
4. **URL Shortening** (Priority 4) - Depends on Product Detail Scraping

#### **Dependency Rules**
- **Per-dealer isolation**: Dependencies only exist within the same dealer
- **Sequential processing**: Jobs must complete in dependency order
- **Parallel safety**: HomeNet and Dealer.com jobs can run in parallel across dealers

## 🚀 Usage

### **Basic Usage**

```typescript
import { MultiDealerDependencyManager } from './jobs/multi-dealer-dependency-manager.js';

// Initialize the manager
const manager = new MultiDealerDependencyManager(3, 2);

// Process jobs with dependency management
const stats = await manager.processMultiDealerJobs(10);
console.log(`Processed ${stats.processedJobs} jobs successfully`);
```

### **Command Line Usage**

```bash
# Test the multi-dealer dependency manager
npm run queue:test-multi-dealer

# Process multi-dealer jobs
npm run queue:process-multi-dealer [limit] [maxDealers] [maxJobsPerDealer]

# Examples:
npm run queue:process-multi-dealer 20 3 2  # Process 20 jobs, 3 dealers, 2 jobs per dealer
npm run queue:process-multi-dealer 10      # Use defaults (10 jobs, 3 dealers, 2 jobs per dealer)
```

### **Vercel Cron Integration**

The system is integrated with Vercel cron jobs and can be enabled via query parameters:

```bash
# Enable multi-dealer processing
curl "https://your-vercel-app.vercel.app/api/cron/run-jobs?multi_dealer=true"

# Use legacy processing (default)
curl "https://your-vercel-app.vercel.app/api/cron/run-jobs"
```

## 📊 Monitoring and Analytics

### **Processing Statistics**

The system provides comprehensive statistics for monitoring:

```typescript
interface MultiDealerProcessingStats {
  totalJobs: number;           // Total jobs requested
  processedJobs: number;       // Jobs actually processed
  successfulJobs: number;      // Successfully completed jobs
  failedJobs: number;          // Failed jobs
  blockedJobs: number;         // Jobs blocked by dependencies
  processingTimeMs: number;    // Total processing time
  dealersProcessed: string[];  // List of dealers processed
  dependencyViolations: number; // Number of dependency violations
}
```

### **Performance Metrics**

- **Success Rate**: Percentage of jobs completed successfully
- **Throughput**: Jobs processed per second
- **Concurrency Efficiency**: How well parallel processing is utilized
- **Dependency Violations**: Configuration issues detected

### **Dependency Analysis**

- **Dependency Nodes**: Total number of job nodes in the graph
- **Dependency Edges**: Number of dependency relationships
- **Dependency Cycles**: Detected circular dependencies (should be 0)

## 🔧 Configuration

### **Concurrency Settings**

```typescript
// Conservative settings (recommended for production)
const manager = new MultiDealerDependencyManager(2, 1);

// Balanced settings (good for most use cases)
const manager = new MultiDealerDependencyManager(3, 2);

// Aggressive settings (for high-performance environments)
const manager = new MultiDealerDependencyManager(5, 3);
```

### **Job Limits**

- **Total Job Limit**: Maximum number of jobs to process in one run
- **Per-Dealer Limit**: Maximum jobs per dealer to prevent resource exhaustion
- **Concurrent Dealer Limit**: Number of dealers to process simultaneously

## 🛠️ Integration

### **With Existing Job Processors**

The system is designed to integrate with existing job processors:

```typescript
// In multi-dealer-dependency-manager.ts
private async processHomeNetJob(job: any): Promise<any> {
  // Import and use the actual HomeNet processor
  const { processHomeNetJobs } = await import('./homenet-feed.js');
  return processHomeNetJobs(job);
}

private async processDealerComJob(job: any): Promise<any> {
  // Import and use the actual Dealer.com processor
  const { processDealerComFeedJobs } = await import('./dealer-com-feed.js');
  return processDealerComFeedJobs(job);
}
```

### **With CMS Dashboard**

The system can be integrated with the CMS dashboard for real-time monitoring:

```typescript
// Get real-time statistics
const stats = dependencyManager.getProcessingStats();
const graph = await dependencyManager.buildDependencyGraph();

// Display in dashboard
dashboard.updateJobQueueStats(stats);
dashboard.updateDependencyGraph(graph);
```

## 🔍 Troubleshooting

### **Common Issues**

#### **No Jobs Processed**
- **Cause**: All jobs are blocked by dependencies
- **Solution**: Check if prerequisite jobs (HomeNet) have completed

#### **High Failure Rate**
- **Cause**: External API issues or configuration problems
- **Solution**: Check circuit breaker status and error logs

#### **Dependency Cycles Detected**
- **Cause**: Circular job dependencies
- **Solution**: Review job configuration and dependency rules

#### **Low Throughput**
- **Cause**: Concurrency limits too conservative
- **Solution**: Increase `maxConcurrentDealers` or `maxConcurrentJobsPerDealer`

### **Debugging Commands**

```bash
# Check job queue status
npm run queue:status

# Analyze job errors
npm run queue:analyze-errors

# Health check with detailed information
npm run queue:health:detailed

# Reset stuck jobs
npm run queue:reset-stuck
```

## 📈 Performance Optimization

### **Best Practices**

1. **Monitor Performance**: Use the built-in statistics to track performance
2. **Adjust Concurrency**: Fine-tune based on your infrastructure capabilities
3. **Handle Errors Gracefully**: The system includes robust error handling
4. **Regular Maintenance**: Clean up old jobs and monitor for issues

### **Scaling Considerations**

- **Horizontal Scaling**: The system can be scaled by running multiple instances
- **Vertical Scaling**: Increase concurrency limits for more powerful servers
- **Load Balancing**: Distribute jobs across multiple processing nodes

## 🔮 Future Enhancements

### **Planned Features**

1. **Real-time Dashboard**: Web-based monitoring interface
2. **Predictive Scheduling**: AI-powered job scheduling optimization
3. **Advanced Analytics**: Machine learning for performance prediction
4. **Dynamic Scaling**: Automatic adjustment of concurrency based on load

### **Integration Roadmap**

1. **CMS Integration**: Real-time monitoring in PayloadCMS admin
2. **Alerting System**: Email/Slack notifications for issues
3. **API Endpoints**: REST API for external monitoring
4. **Metrics Export**: Integration with monitoring systems (Prometheus, etc.)

## 📝 API Reference

### **MultiDealerDependencyManager**

#### **Constructor**
```typescript
new MultiDealerDependencyManager(
  maxConcurrentDealers: number,
  maxConcurrentJobsPerDealer: number
)
```

#### **Methods**

##### **processMultiDealerJobs(limit: number)**
Process jobs with dependency management.

##### **buildDependencyGraph()**
Build and return the dependency graph.

##### **getReadyJobsForDealer(dealerId: string)**
Get jobs ready to process for a specific dealer.

##### **getDependencyGraphVisualization()**
Get a text representation of the dependency graph.

##### **getProcessingStats()**
Get current processing statistics.

##### **resetProcessingStats()**
Reset processing statistics.

## 🎯 Success Metrics

### **Target Performance**

- **Success Rate**: >95% job completion rate
- **Throughput**: >10 jobs/second
- **Dependency Violations**: 0
- **Processing Time**: <60 seconds per job on average

### **Monitoring KPIs**

- Job success rate by type and dealer
- Average processing time
- Circuit breaker activation frequency
- Dependency graph complexity
- Resource utilization

---

**Status**: ✅ **Production Ready**  
**Last Updated**: 2025-01-24  
**Version**: 1.0.0
