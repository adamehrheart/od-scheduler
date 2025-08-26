/**
 * Enhanced URL Shortening Worker with Conflict Resolution
 *
 * Processes URL shortening jobs from the job_queue table with improved error handling.
 * Features:
 * - Slashtag conflict resolution with fallback strategies
 * - Enhanced retry logic with exponential backoff
 * - Circuit breaker pattern for Rebrandly API
 * - Duplicate URL detection and handling
 * - Comprehensive error categorization
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';
import { executeJobWithErrorHandling, EnhancedErrorHandler } from './enhanced-error-handling.js';

// Initialize Supabase client
const supabaseUrl = env.OD_SUPABASE_URL;
const supabaseKey = env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration for URL shortening worker');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize enhanced error handler
const errorHandler = new EnhancedErrorHandler();

// Types for job processing
interface UrlShorteningJob {
    id: string;
    payload: {
        dealer_id: string;
        vin: string;
        dealerurl: string;
        utm: {
            dealerId: string;
            vin: string;
            make?: string;
            model?: string;
            year?: string;
            medium: string;
            source: string;
        };
        skip_url_shortening?: boolean;
    };
}

interface ShortLinkResult {
    success: boolean;
    shortUrl?: string;
    id?: string;
    error?: string;
    slashtag?: string;
    attempts?: number;
    message?: string;
}

/**
 * Generate a unique slashtag with conflict resolution
 */
async function generateUniqueSlashtag(
    dealerId: string,
    vin: string,
    attempt: number = 1
): Promise<string> {
    const maxAttempts = 5;

    // Normalize inputs
    const normalizedDealerId = dealerId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const normalizedVin = vin.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Base slashtag format
    const truncatedDealerId = normalizedDealerId.substring(0, 6);
    const truncatedVin = normalizedVin.substring(0, 8);

    let slashtag: string;

    if (attempt === 1) {
        // First attempt: standard format
        slashtag = `v1/llm/${truncatedDealerId}/${truncatedVin}`;
    } else if (attempt <= 3) {
        // Add timestamp suffix for conflicts
        const timestamp = Date.now().toString(36).substring(-4);
        slashtag = `v1/llm/${truncatedDealerId}/${truncatedVin}-${timestamp}`;
    } else {
        // Final fallback: random suffix
        const random = Math.random().toString(36).substring(2, 6);
        slashtag = `v1/llm/${truncatedDealerId}/${truncatedVin}-${random}`;
    }

    // Ensure slashtag meets Rebrandly requirements
    if (slashtag.length > 30) {
        slashtag = slashtag.substring(0, 30);
    }

    return slashtag;
}

/**
 * Check if a slashtag already exists in our database
 */
async function checkSlashtagExists(slashtag: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('vehicles')
            .select('short_url')
            .ilike('short_url', `%${slashtag}%`)
            .limit(1);

        if (error) {
            console.warn('Error checking slashtag existence:', error);
            return false; // Assume it doesn't exist if we can't check
        }

        return data && data.length > 0;
    } catch (error) {
        console.warn('Error checking slashtag existence:', error);
        return false;
    }
}

/**
 * Create a short link with conflict resolution
 */
async function createShortLinkWithConflictResolution(
    dealerurl: string,
    utm: any,
    maxAttempts: number = 5
): Promise<ShortLinkResult> {
    const rebrandlyApiKey = env.OD_REBRANDLY_API_KEY;

    if (!rebrandlyApiKey) {
        return {
            success: false,
            error: 'Rebrandly API key not configured'
        };
    }

    let lastError: string = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Generate unique slashtag
            const slashtag = await generateUniqueSlashtag(utm.dealerId, utm.vin, attempt);

            // Check if this slashtag already exists in our database
            const exists = await checkSlashtagExists(slashtag);
            if (exists) {
                console.log(`Slashtag ${slashtag} already exists in database, trying next attempt`);
                continue;
            }

            console.log(`Creating Rebrandly link (attempt ${attempt}/${maxAttempts})`, {
                destination: dealerurl,
                slashtag: slashtag
            });

            const response = await fetch('https://api.rebrandly.com/v1/links', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': rebrandlyApiKey,
                },
                body: JSON.stringify({
                    destination: dealerurl,
                    slashtag: slashtag,
                }),
            });

            if (response.ok) {
                const linkData = await response.json() as any;

                console.log('Short link created successfully', {
                    shortUrl: linkData.shortUrl,
                    id: linkData.id,
                    slashtag: linkData.slashtag,
                    attempts: attempt
                });

                return {
                    success: true,
                    shortUrl: linkData.shortUrl,
                    id: linkData.id,
                    slashtag: linkData.slashtag,
                    attempts: attempt
                };
            }

            // Handle specific error responses
            const errorData = await response.json().catch(() => ({})) as any;
            lastError = `Rebrandly API error: ${response.status} ${JSON.stringify(errorData)}`;

            // Check if it's a slashtag conflict
            if (response.status === 403 && errorData.errors?.some((e: any) => e.code === 'AlreadyExists')) {
                console.log(`Slashtag conflict detected: ${slashtag}, trying next attempt`);
                continue;
            }

            // Check if it's a rate limit
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
                console.log(`Rate limited, waiting ${delay}ms before retry`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // For other errors, don't retry
            break;

        } catch (error: any) {
            lastError = error?.message || error?.toString() || 'Unknown error';
            console.error(`Error creating short link (attempt ${attempt}):`, lastError);

            // Don't retry on network errors immediately
            if (attempt < maxAttempts) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    return {
        success: false,
        error: lastError,
        attempts: maxAttempts
    };
}

/**
 * Check if URL shortening is already completed for this vehicle
 */
async function checkExistingShortUrl(dealerId: string, vin: string): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .from('vehicles')
            .select('short_url, short_url_status')
            .eq('dealer_id', dealerId)
            .eq('vin', vin)
            .single();

        if (error) {
            console.warn('Error checking existing short URL:', error);
            return null;
        }

        // If we have a valid short URL, return it
        if (data?.short_url && data?.short_url_status === 'completed') {
            return data.short_url;
        }

        return null;
    } catch (error) {
        console.warn('Error checking existing short URL:', error);
        return null;
    }
}

/**
 * Process a single URL shortening job with enhanced error handling
 */
async function processUrlShorteningJob(job: UrlShorteningJob): Promise<ShortLinkResult> {
    const { payload } = job;
    const { dealer_id, vin, dealerurl, utm, skip_url_shortening } = payload;

    // Skip URL shortening if flag is set
    if (skip_url_shortening) {
        console.log('URL shortening skipped due to skip_url_shortening flag', {
            jobId: job.id,
            dealerId: dealer_id,
            vin: vin
        });

        return {
            success: true,
            shortUrl: '',
            slashtag: '',
            message: 'URL shortening skipped'
        };
    }

    console.log('Processing URL shortening job', {
        jobId: job.id,
        dealerId: dealer_id,
        vin: vin,
        url: dealerurl
    });

    // Check if we already have a short URL for this vehicle
    const existingShortUrl = await checkExistingShortUrl(dealer_id, vin);
    if (existingShortUrl) {
        console.log('Short URL already exists for vehicle', {
            dealerId: dealer_id,
            vin: vin,
            shortUrl: existingShortUrl
        });

        return {
            success: true,
            shortUrl: existingShortUrl,
            slashtag: existingShortUrl.split('/').pop() || ''
        };
    }

    // Create short link with conflict resolution
    const result = await createShortLinkWithConflictResolution(dealerurl, utm);

    if (result.success) {
        // Update vehicle record with short URL
        try {
            const { error: updateError } = await supabase
                .from('vehicles')
                .update({
                    short_url: result.shortUrl,
                    rebrandly_id: result.id,
                    short_url_status: 'completed',
                    short_url_attempts: result.attempts || 1,
                    short_url_last_attempt: new Date().toISOString()
                })
                .eq('dealer_id', dealer_id)
                .eq('vin', vin);

            if (updateError) {
                console.error('Error updating vehicle with short URL:', updateError);
                // Don't fail the job if database update fails
            }
        } catch (error) {
            console.error('Error updating vehicle with short URL:', error);
        }
    } else {
        // Update vehicle record with error status
        try {
            const { error: updateError } = await supabase
                .from('vehicles')
                .update({
                    short_url_status: 'failed',
                    short_url_attempts: result.attempts || 1,
                    short_url_last_attempt: new Date().toISOString()
                })
                .eq('dealer_id', dealer_id)
                .eq('vin', vin);

            if (updateError) {
                console.error('Error updating vehicle with error status:', updateError);
            }
        } catch (error) {
            console.error('Error updating vehicle with error status:', error);
        }
    }

    return result;
}

/**
 * Enhanced URL shortening job processor with error handling
 */
export async function processUrlShorteningJobsEnhanced(
    limit: number = 10,
    logFunction: (level: string, message: string, data?: any) => void = console.log
): Promise<{
    processed: number;
    success: number;
    failed: number;
    errors: string[];
}> {
    try {
        // Fetch pending URL shortening jobs
        const { data: jobs, error: fetchError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit);

        if (fetchError) {
            logFunction('error', 'Failed to fetch URL shortening jobs', { error: fetchError });
            return { processed: 0, success: 0, failed: 1, errors: [fetchError.message] };
        }

        if (!jobs || jobs.length === 0) {
            logFunction('info', 'No pending URL shortening jobs found');
            return { processed: 0, success: 0, failed: 0, errors: [] };
        }

        logFunction('info', `Processing ${jobs.length} URL shortening jobs`);

        let processed = 0;
        let success = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const job of jobs) {
            try {
                const result = await executeJobWithErrorHandling(
                    job.id,
                    'url_shortening',
                    () => processUrlShorteningJob(job),
                    errorHandler,
                    logFunction
                );

                processed++;

                if (result.success) {
                    success++;
                    logFunction('info', `Job ${job.id} completed successfully`, {
                        shortUrl: result.result?.shortUrl,
                        attempts: result.result?.attempts
                    });
                } else {
                    failed++;
                    const errorMsg = result.error?.message || 'Unknown error';
                    errors.push(`Job ${job.id}: ${errorMsg}`);
                    logFunction('error', `Job ${job.id} failed`, {
                        error: errorMsg,
                        type: result.error?.type
                    });
                }

            } catch (error: any) {
                processed++;
                failed++;
                const errorMsg = error?.message || error?.toString() || 'Unknown error';
                errors.push(`Job ${job.id}: ${errorMsg}`);
                logFunction('error', `Job ${job.id} failed with exception`, {
                    error: errorMsg,
                    stack: error?.stack
                });
            }
        }

        logFunction('info', 'URL shortening job processing completed', {
            processed,
            success,
            failed,
            errors: errors.length
        });

        return { processed, success, failed, errors };

    } catch (error: any) {
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        logFunction('error', 'URL shortening job processing failed', { error: errorMsg });
        return { processed: 0, success: 0, failed: 1, errors: [errorMsg] };
    }
}
