/**
 * Multi-Dealer Dependency Manager
 * 
 * Handles complex dependency scenarios for multiple dealers in the job queue system.
 * Provides intelligent job scheduling, parallel processing, and dependency resolution.
 * 
 * Features:
 * - Per-dealer dependency tracking
 * - Cross-dealer dependency management
 * - Intelligent job prioritization
 * - Parallel processing where safe
 * - Dependency graph visualization
 * - Automatic deadlock detection
 * - Performance optimization
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';
import { EnhancedErrorHandler, executeJobWithErrorHandling } from './enhanced-error-handling.js';
import { HomeNetJobRunner } from './homenet.js';
import { DealerComJobRunner } from './dealer-com.js';
import { getSupabaseClient } from '../utils.js';

// Initialize Supabase client
const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

// Types for dependency management
interface DealerDependency {
    dealerId: string;
    jobType: string;
    dependsOn: Array<{
        dealerId: string;
        jobType: string;
        status: 'pending' | 'processing' | 'completed' | 'failed';
    }>;
    priority: number;
    canRunInParallel: boolean;
}

interface DependencyGraph {
    nodes: Map<string, DealerDependency>;
    edges: Array<{ from: string; to: string }>;
    cycles: string[][];
}

interface JobProcessingResult {
    dealerId: string;
    jobType: string;
    success: boolean;
    processedAt: Date;
    durationMs: number;
    error?: string;
}

interface MultiDealerProcessingStats {
    totalJobs: number;
    processedJobs: number;
    successfulJobs: number;
    failedJobs: number;
    blockedJobs: number;
    processingTimeMs: number;
    dealersProcessed: string[];
    dependencyViolations: number;
}

export class MultiDealerDependencyManager {
    private errorHandler: EnhancedErrorHandler;
    private dependencyGraph: DependencyGraph;
    private processingStats: MultiDealerProcessingStats;
    private maxConcurrentDealers: number;
    private maxConcurrentJobsPerDealer: number;

    constructor(
        maxConcurrentDealers: number = 3,
        maxConcurrentJobsPerDealer: number = 2
    ) {
        this.errorHandler = new EnhancedErrorHandler();
        this.dependencyGraph = { nodes: new Map(), edges: [], cycles: [] };
        this.processingStats = {
            totalJobs: 0,
            processedJobs: 0,
            successfulJobs: 0,
            failedJobs: 0,
            blockedJobs: 0,
            processingTimeMs: 0,
            dealersProcessed: [],
            dependencyViolations: 0
        };
        this.maxConcurrentDealers = maxConcurrentDealers;
        this.maxConcurrentJobsPerDealer = maxConcurrentJobsPerDealer;
    }

    /**
     * Build dependency graph for all pending jobs
     */
    async buildDependencyGraph(): Promise<DependencyGraph> {
        console.log('🔍 Building dependency graph for all dealers...');

        // Get all pending jobs grouped by dealer
        const { data: pendingJobs, error } = await supabase
            .from('job_queue')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(`Failed to fetch pending jobs: ${error.message}`);
        }

        // Group jobs by dealer
        const jobsByDealer = new Map<string, any[]>();
        for (const job of pendingJobs || []) {
            const dealerId = job.payload?.dealer_id;
            if (!dealerId) continue;

            if (!jobsByDealer.has(dealerId)) {
                jobsByDealer.set(dealerId, []);
            }
            jobsByDealer.get(dealerId)!.push(job);
        }

        // Build dependency nodes for each dealer
        this.dependencyGraph.nodes.clear();
        this.dependencyGraph.edges = [];

        for (const [dealerId, jobs] of jobsByDealer) {
            await this.buildDealerDependencies(dealerId, jobs);
        }

        // Detect cycles in dependency graph
        this.dependencyGraph.cycles = this.detectCycles();

        console.log(`✅ Built dependency graph with ${this.dependencyGraph.nodes.size} nodes and ${this.dependencyGraph.edges.length} edges`);

        if (this.dependencyGraph.cycles.length > 0) {
            console.warn(`⚠️  Detected ${this.dependencyGraph.cycles.length} dependency cycles`);
        }

        return this.dependencyGraph;
    }

    /**
     * Build dependencies for a specific dealer
     */
    private async buildDealerDependencies(dealerId: string, jobs: any[]): Promise<void> {
        // Sort jobs by type to establish dependency order
        const jobTypes = ['homenet_feed', 'dealer_com_feed', 'product_detail_scraping', 'url_shortening'];

        for (const jobType of jobTypes) {
            const job = jobs.find(j => j.job_type === jobType);
            if (!job) continue;

            const nodeId = `${dealerId}:${jobType}`;
            const dependsOn: Array<{ dealerId: string; jobType: string; status: string }> = [];

            // Define dependencies based on job type
            switch (jobType) {
                case 'homenet_feed':
                    // HomeNet jobs can run independently
                    break;

                case 'dealer_com_feed':
                case 'product_detail_scraping':
                    // These depend on HomeNet for the same dealer
                    dependsOn.push({
                        dealerId,
                        jobType: 'homenet_feed',
                        status: 'pending' // Will be updated when we check actual status
                    });
                    break;

                case 'url_shortening':
                    // URL shortening depends on product detail scraping for the same dealer
                    dependsOn.push({
                        dealerId,
                        jobType: 'product_detail_scraping',
                        status: 'pending'
                    });
                    break;
            }

            // Check actual status of dependencies
            for (const dep of dependsOn) {
                const { data: depJob } = await supabase
                    .from('job_queue')
                    .select('status')
                    .eq('job_type', dep.jobType)
                    .eq('payload->>dealer_id', dep.dealerId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                dep.status = depJob?.status || 'pending';
            }

            const dependency: DealerDependency = {
                dealerId,
                jobType,
                dependsOn: dependsOn as Array<{ dealerId: string; jobType: string; status: 'pending' | 'processing' | 'completed' | 'failed' }>,
                priority: this.calculateJobPriority(jobType),
                canRunInParallel: this.canRunInParallel(jobType)
            };

            this.dependencyGraph.nodes.set(nodeId, dependency);

            // Add edges for dependencies
            for (const dep of dependsOn) {
                const depNodeId = `${dep.dealerId}:${dep.jobType}`;
                this.dependencyGraph.edges.push({ from: depNodeId, to: nodeId });
            }
        }
    }

    /**
     * Calculate job priority based on type and dependencies
     */
    private calculateJobPriority(jobType: string): number {
        const basePriorities: Record<string, number> = {
            'homenet_feed': 1,
            'dealer_com_feed': 2,
            'product_detail_scraping': 3,
            'url_shortening': 4
        };

        return basePriorities[jobType] || 5;
    }

    /**
     * Determine if a job type can run in parallel with others
     */
    private canRunInParallel(jobType: string): boolean {
        // HomeNet and Dealer.com jobs can run in parallel across dealers
        // Product detail scraping and URL shortening are more resource-intensive
        return jobType === 'homenet_feed' || jobType === 'dealer_com_feed';
    }

    /**
     * Detect cycles in dependency graph using DFS
     */
    private detectCycles(): string[][] {
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const dfs = (nodeId: string, path: string[]): void => {
            if (recursionStack.has(nodeId)) {
                // Found a cycle
                const cycleStart = path.indexOf(nodeId);
                cycles.push(path.slice(cycleStart));
                return;
            }

            if (visited.has(nodeId)) return;

            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);

            const node = this.dependencyGraph.nodes.get(nodeId);
            if (node) {
                for (const dep of node.dependsOn) {
                    const depNodeId = `${dep.dealerId}:${dep.jobType}`;
                    dfs(depNodeId, [...path]);
                }
            }

            recursionStack.delete(nodeId);
        };

        for (const nodeId of this.dependencyGraph.nodes.keys()) {
            if (!visited.has(nodeId)) {
                dfs(nodeId, []);
            }
        }

        return cycles;
    }

    /**
     * Get ready-to-process jobs for a specific dealer
     */
    async getReadyJobsForDealer(dealerId: string): Promise<any[]> {
        const readyJobs: any[] = [];

        for (const [nodeId, dependency] of this.dependencyGraph.nodes) {
            if (dependency.dealerId !== dealerId) continue;

            console.log(`🔍 Checking dependencies for ${dependency.jobType}:`, dependency.dependsOn);

            // Check if all dependencies are satisfied by querying the actual job status
            const allDependenciesMet = await Promise.all(dependency.dependsOn.map(async dep => {
                console.log(`  🔍 Checking dependency: ${dep.jobType} for dealer ${dep.dealerId}`);

                const { data: depJob, error } = await supabase
                    .from('job_queue')
                    .select('status, created_at')
                    .eq('job_type', dep.jobType)
                    .eq('payload->>dealer_id', dep.dealerId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (error) {
                    console.log(`  ❌ Error querying dependency: ${error.message}`);
                    return false;
                }

                console.log(`  📋 Found dependency job:`, depJob);
                const isMet = depJob && depJob.status === 'completed';
                console.log(`  Dependency ${dep.jobType}: ${depJob?.status || 'not found'} -> ${isMet}`);
                return isMet;
            }));

            const allMet = allDependenciesMet.every(met => met);
            console.log(`  All dependencies met for ${dependency.jobType}: ${allMet}`);

            if (allMet) {
                // Get the actual job from the queue
                const { data: job } = await supabase
                    .from('job_queue')
                    .select('*')
                    .eq('job_type', dependency.jobType)
                    .eq('payload->>dealer_id', dealerId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .single();

                if (job) {
                    console.log(`  ✅ Found ready job: ${job.job_type}`);
                    readyJobs.push(job);
                } else {
                    console.log(`  ❌ No pending job found for ${dependency.jobType}`);
                }
            }
        }

        return readyJobs.sort((a, b) => {
            const aPriority = this.calculateJobPriority(a.job_type);
            const bPriority = this.calculateJobPriority(b.job_type);
            return aPriority - bPriority;
        });
    }

    /**
     * Process jobs for multiple dealers with intelligent scheduling
     */
    async processMultiDealerJobs(limit: number = 10): Promise<MultiDealerProcessingStats> {
        const startTime = Date.now();
        console.log(`🚀 Starting multi-dealer job processing (limit: ${limit})`);

        // Build dependency graph
        await this.buildDependencyGraph();

        // Get all dealers with pending jobs
        const { data: dealersWithJobs } = await supabase
            .from('job_queue')
            .select('payload->dealer_id')
            .eq('status', 'pending')
            .not('payload->dealer_id', 'is', null);

        const uniqueDealers = [...new Set(dealersWithJobs?.map(j => (j as any).dealer_id).filter(Boolean) || [])];
        this.processingStats.totalJobs = limit;
        this.processingStats.dealersProcessed = [];

        console.log(`📊 Found ${uniqueDealers.length} dealers with pending jobs`);

        // Process dealers in batches to respect concurrency limits
        const dealerBatches = this.chunkArray(uniqueDealers, this.maxConcurrentDealers);

        for (const dealerBatch of dealerBatches) {
            console.log(`🔄 Processing batch of ${dealerBatch.length} dealers: ${dealerBatch.join(', ')}`);

            // Process dealers in parallel within the batch
            const batchPromises = dealerBatch.map(dealerId =>
                this.processDealerJobs(dealerId, Math.ceil(limit / dealerBatch.length))
            );

            const batchResults = await Promise.allSettled(batchPromises);

            // Aggregate results
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    this.aggregateProcessingStats(result.value);
                } else {
                    console.error('❌ Batch processing error:', result.reason);
                    this.processingStats.failedJobs++;
                }
            }

            // Check if we've reached the limit
            if (this.processingStats.processedJobs >= limit) {
                break;
            }
        }

        this.processingStats.processingTimeMs = Date.now() - startTime;

        console.log('✅ Multi-dealer job processing completed', {
            processed: this.processingStats.processedJobs,
            successful: this.processingStats.successfulJobs,
            failed: this.processingStats.failedJobs,
            blocked: this.processingStats.blockedJobs,
            duration: this.processingStats.processingTimeMs
        });

        return this.processingStats;
    }

    /**
     * Process jobs for a specific dealer
     */
    private async processDealerJobs(dealerId: string, maxJobs: number): Promise<JobProcessingResult[]> {
        const results: JobProcessingResult[] = [];
        const readyJobs = await this.getReadyJobsForDealer(dealerId);

        console.log(`🎯 Dealer ${dealerId}: ${readyJobs.length} ready jobs`);

        // Process jobs up to the limit
        const jobsToProcess = readyJobs.slice(0, maxJobs);

        for (const job of jobsToProcess) {
            const startTime = Date.now();

            try {
                console.log(`⚡ Processing ${job.job_type} for dealer ${dealerId}`);

                // Execute job with enhanced error handling
                let result: { success: boolean; error?: any };
                if (job.job_type === 'homenet_feed') {
                    result = await this.processHomeNetJob(job);
                } else if (job.job_type === 'dealer_com_feed') {
                    result = await this.processDealerComJob(job);
                } else {
                    console.warn('Unknown job type', { job_type: job.job_type, job_id: job.id });
                    continue;
                }

                const durationMs = Date.now() - startTime;
                results.push({
                    dealerId,
                    jobType: job.job_type,
                    success: result.success,
                    processedAt: new Date(),
                    durationMs,
                    error: result.error?.message
                });

                if (result.success) {
                    console.log(`✅ ${job.job_type} completed for dealer ${dealerId} (${durationMs}ms)`);
                } else {
                    console.error(`❌ ${job.job_type} failed for dealer ${dealerId}: ${result.error?.message}`);
                }

            } catch (error: any) {
                const durationMs = Date.now() - startTime;
                results.push({
                    dealerId,
                    jobType: job.job_type,
                    success: false,
                    processedAt: new Date(),
                    durationMs,
                    error: error.message
                });

                console.error(`💥 Unexpected error processing ${job.job_type} for dealer ${dealerId}:`, error);
            }
        }

        return results;
    }

    /**
     * Execute a job with enhanced error handling
     */
    private async executeJob(job: any): Promise<{ success: boolean; error?: any }> {
        const jobFunctions: Record<string, () => Promise<any>> = {
            'homenet_feed': () => this.processHomeNetJob(job),
            'dealer_com_feed': () => this.processDealerComJob(job),
            'product_detail_scraping': () => this.processProductDetailScrapingJob(job),
            'url_shortening': () => this.processUrlShorteningJob(job)
        };

        const jobFunction = jobFunctions[job.job_type];
        if (!jobFunction) {
            throw new Error(`Unknown job type: ${job.job_type}`);
        }

        return executeJobWithErrorHandling(
            job.id,
            job.job_type,
            jobFunction,
            this.errorHandler,
            console.log
        );
    }

    /**
     * Placeholder job processing functions
     * These would integrate with the actual job processors
     */
    private async processHomeNetJob(job: any): Promise<any> {
        // Use the actual HomeNet processor
        console.log(`Processing HomeNet job for dealer ${job.payload.dealer_id}`);

        // Create a job object that matches the expected format for HomeNetJobRunner
        const jobForRunner = {
            id: job.id,
            dealer_id: job.payload.dealer_id,
            dealer_name: job.payload.dealer_id, // Use dealer_id as name for now
            platform: 'homenet' as const,
            environment: (job.payload.environment || 'production') as 'production' | 'staging' | 'development' | 'testing',
            schedule: 'daily' as const,
            status: 'active' as const,
            config: {},
            created_at: new Date(),
            updated_at: new Date(),
            payload: job.payload
        };

        const runner = new HomeNetJobRunner(jobForRunner);
        const result = await runner.execute();

        return result;
    }

    private async processDealerComJob(job: any): Promise<any> {
        console.log(`Processing Dealer.com job for dealer ${job.payload.dealer_id}`);
        const jobForRunner = {
            id: job.id,
            dealer_id: job.payload.dealer_id,
            dealer_name: job.payload.dealer_id,
            platform: 'dealer.com' as const,
            environment: (job.payload.environment || 'production') as 'production' | 'staging' | 'development' | 'testing',
            schedule: 'daily' as const,
            status: 'active' as const,
            config: {},
            created_at: new Date(),
            updated_at: new Date(),
            payload: job.payload
        };
        const runner = new DealerComJobRunner(jobForRunner);
        const result = await runner.execute();
        return result;
    }

    private async processProductDetailScrapingJob(job: any): Promise<any> {
        // Import and use the actual product detail scraping processor
        console.log(`Processing product detail scraping job for dealer ${job.payload.dealer_id}`);
        // TODO: Integrate with actual product detail scraping processor
        return { success: true, message: 'Product detail scraping job processed' };
    }

    private async processUrlShorteningJob(job: any): Promise<any> {
        // Import and use the actual URL shortening processor
        console.log(`Processing URL shortening job for dealer ${job.payload.dealer_id}`);
        // TODO: Integrate with actual URL shortening processor
        return { success: true, message: 'URL shortening job processed' };
    }

    /**
     * Aggregate processing statistics
     */
    private aggregateProcessingStats(results: JobProcessingResult[]): void {
        for (const result of results) {
            this.processingStats.processedJobs++;

            if (result.success) {
                this.processingStats.successfulJobs++;
            } else {
                this.processingStats.failedJobs++;
            }

            if (!this.processingStats.dealersProcessed.includes(result.dealerId)) {
                this.processingStats.dealersProcessed.push(result.dealerId);
            }
        }
    }

    /**
     * Utility function to chunk array into batches
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Get dependency graph visualization
     */
    getDependencyGraphVisualization(): string {
        let visualization = 'Dependency Graph:\n';
        visualization += '==================\n\n';

        for (const [nodeId, dependency] of this.dependencyGraph.nodes) {
            visualization += `${nodeId} (Priority: ${dependency.priority})\n`;

            if (dependency.dependsOn.length > 0) {
                visualization += '  Depends on:\n';
                for (const dep of dependency.dependsOn) {
                    const depNodeId = `${dep.dealerId}:${dep.jobType}`;
                    visualization += `    - ${depNodeId} (${dep.status})\n`;
                }
            } else {
                visualization += '  No dependencies\n';
            }

            visualization += '\n';
        }

        if (this.dependencyGraph.cycles.length > 0) {
            visualization += 'Cycles detected:\n';
            for (const cycle of this.dependencyGraph.cycles) {
                visualization += `  ${cycle.join(' -> ')} -> ${cycle[0]}\n`;
            }
        }

        return visualization;
    }

    /**
     * Get processing statistics
     */
    getProcessingStats(): MultiDealerProcessingStats {
        return { ...this.processingStats };
    }

    /**
     * Reset processing statistics
     */
    resetProcessingStats(): void {
        this.processingStats = {
            totalJobs: 0,
            processedJobs: 0,
            successfulJobs: 0,
            failedJobs: 0,
            blockedJobs: 0,
            processingTimeMs: 0,
            dealersProcessed: [],
            dependencyViolations: 0
        };
    }
}
