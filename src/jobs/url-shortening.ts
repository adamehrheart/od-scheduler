/**
 * URL Shortening Worker
 * 
 * Processes URL shortening jobs from the job_queue table.
 * Creates Rebrandly short links for vehicle dealer URLs with verification.
 * 
 * Features:
 * - URL verification before shortening
 * - Retry logic with exponential backoff
 * - UTM parameter tracking
 * - Comprehensive error handling and logging
 * - Updates vehicle records with short URL information
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';

// Initialize Supabase client
const supabaseUrl = env.OD_SUPABASE_URL;
const supabaseKey = env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration for URL shortening worker');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
    };
}

interface UrlVerificationResult {
    isValid: boolean;
    statusCode?: number;
    error?: string;
    finalUrl?: string;
}

interface ShortLinkResult {
    success: boolean;
    shortUrl?: string;
    id?: string;
    error?: string;
    verification?: UrlVerificationResult;
}

/**
 * Verify that a dealer URL is accessible and returns a valid product detail page
 */
async function verifyDealerUrl(url: string, timeoutMs: number = 5000): Promise<UrlVerificationResult> {
    try {
        // Basic URL validation
        if (!url || !url.startsWith('http')) {
            return { isValid: false, error: 'Invalid URL format' };
        }

        // Check for common invalid patterns
        const invalidPatterns = [
            /^https?:\/\/[^\/]+\/?$/, // Just domain with optional trailing slash
            /^https?:\/\/[^\/]+\/inventory\/?$/, // Inventory listing page
            /^https?:\/\/[^\/]+\/vehicles\/?$/, // Vehicle listing page
            /^https?:\/\/[^\/]+\/search\/?$/, // Search page
            /^https?:\/\/[^\/]+\/new-inventory\/?$/, // New inventory listing
            /^https?:\/\/[^\/]+\/used-inventory\/?$/, // Used inventory listing
        ];

        for (const pattern of invalidPatterns) {
            if (pattern.test(url)) {
                return { isValid: false, error: 'URL appears to be a listing page, not a product detail page' };
            }
        }

        // Make HTTP request to verify URL
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            // Try HEAD request first
            let response;
            try {
                response = await fetch(url, {
                    method: 'HEAD',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                });
            } catch (headError) {
                // If HEAD fails, try GET request
                console.log(`[INFO] HEAD request failed for ${url}, trying GET request`);
                response = await fetch(url, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                });
            }

            clearTimeout(timeoutId);

            // Accept 2xx, 3xx, and 403 (some sites block bots but URLs are valid)
            if (response.status >= 400 && response.status !== 403) {
                return {
                    isValid: false,
                    statusCode: response.status,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    finalUrl: response.url,
                };
            }

            // For 403 status, consider it valid (site blocks bots but URL exists)
            if (response.status === 403) {
                return {
                    isValid: true,
                    statusCode: response.status,
                    finalUrl: response.url,
                };
            }

            // Check if final URL is different (redirect)
            const finalUrl = response.url;
            if (finalUrl !== url) {
                // Verify the redirected URL is also valid
                const redirectResponse = await fetch(finalUrl, {
                    method: 'HEAD',
                    headers: {
                        'User-Agent': 'OpenDealer-Bot/1.0 (URL Verification)',
                    },
                });

                if (!redirectResponse.ok) {
                    return {
                        isValid: false,
                        statusCode: redirectResponse.status,
                        error: `Redirect failed: HTTP ${redirectResponse.status}`,
                        finalUrl,
                    };
                }
            }

            return {
                isValid: true,
                statusCode: response.status,
                finalUrl,
            };
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                return { isValid: false, error: 'Request timeout' };
            }
            return { isValid: false, error: error.message || 'Network error' };
        }
    } catch (error: any) {
        return { isValid: false, error: error.message || 'Verification failed' };
    }
}

/**
 * Generate a deterministic slashtag for Rebrandly
 */
function generateVersionedSlashtag(
    dealerId: string,
    vin: string,
    version: string = 'v1',
    service: string = 'llm'
): string {
    // Normalize inputs
    const normalizedDealerId = dealerId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const normalizedVin = vin.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Calculate available space for dealer ID and VIN
    // Format: v1/service/dealer/vin (with 3 slashes = 3 characters)
    const prefixLength = version.length + 1 + service.length + 1; // "v1/service/"
    const suffixLength = 1; // "/vin"
    const availableSpace = 50 - prefixLength - suffixLength;

    // If dealer ID is too long, truncate it
    let truncatedDealerId = normalizedDealerId;
    if (normalizedDealerId.length > availableSpace - 8) { // Leave at least 8 chars for VIN
        truncatedDealerId = normalizedDealerId.substring(0, availableSpace - 8);
    }

    // If VIN is too long, truncate it
    let truncatedVin = normalizedVin;
    const remainingSpace = availableSpace - truncatedDealerId.length;
    if (normalizedVin.length > remainingSpace) {
        truncatedVin = normalizedVin.substring(0, remainingSpace);
    }

    // Generate deterministic slashtag
    return `${version}/${service}/${truncatedDealerId}/${truncatedVin}`;
}

/**
 * Create a short link for a vehicle with URL verification
 */
async function createShortLinkForVehicleWithVerification(
    dealerurl: string,
    utm: any,
    options: {
        verifyUrl?: boolean;
        timeoutMs?: number;
        logFunction?: (level: string, message: string, meta?: any) => void;
    } = {}
): Promise<ShortLinkResult> {
    const { verifyUrl = true, timeoutMs = 5000, logFunction = console.log } = options;

    try {
        // Step 1: Verify URL if requested
        let verification: UrlVerificationResult | undefined;
        if (verifyUrl) {
            logFunction('info', 'Verifying dealer URL', { url: dealerurl });
            verification = await verifyDealerUrl(dealerurl, timeoutMs);

            if (!verification.isValid) {
                logFunction('warn', 'URL verification failed', {
                    url: dealerurl,
                    error: verification.error,
                    statusCode: verification.statusCode
                });
                return {
                    success: false,
                    error: `URL verification failed: ${verification.error}`,
                    verification,
                };
            }

            logFunction('info', 'URL verification successful', {
                url: dealerurl,
                finalUrl: verification.finalUrl
            });
        }

        // Step 2: Create UTM parameters
        const utmParams = new URLSearchParams();
        if (utm.dealerId) utmParams.set('utm_dealer', utm.dealerId);
        if (utm.vin) utmParams.set('utm_vin', utm.vin);
        if (utm.make) utmParams.set('utm_make', utm.make);
        if (utm.model) utmParams.set('utm_model', utm.model);
        if (utm.year) utmParams.set('utm_year', utm.year);
        if (utm.medium) utmParams.set('utm_medium', utm.medium);
        if (utm.source) utmParams.set('utm_source', utm.source);

        const targetUrl = verification?.finalUrl || dealerurl;
        const urlWithUtm = utmParams.toString() ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}${utmParams.toString()}` : targetUrl;

        // Step 3: Generate slashtag
        const slashtag = generateVersionedSlashtag(utm.dealerId, utm.vin);

        // Step 4: Create Rebrandly link
        const rebrandlyApiKey = env.OD_REBRANDLY_API_KEY;
        if (!rebrandlyApiKey) {
            return {
                success: false,
                error: 'Rebrandly API key not configured',
                verification,
            };
        }

        const response = await fetch('https://api.rebrandly.com/v1/links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': rebrandlyApiKey,
            },
            body: JSON.stringify({
                destination: urlWithUtm,
                slashtag: slashtag,
                // Use default rebrand.ly domain since opendealer.app doesn't exist
                // domain: { fullName: 'opendealer.app' },
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            logFunction('error', 'Rebrandly API error', {
                status: response.status,
                error: errorData
            });
            return {
                success: false,
                error: `Rebrandly API error: ${response.status} ${JSON.stringify(errorData)}`,
                verification,
            };
        }

        const linkData = await response.json() as any;

        logFunction('info', 'Short link created successfully', {
            shortUrl: linkData.shortUrl,
            id: linkData.id,
            slashtag: linkData.slashtag
        });

        return {
            success: true,
            shortUrl: linkData.shortUrl,
            id: linkData.id,
            verification: verification,
        };
    } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        logFunction('error', 'Short link creation failed', {
            error: errorMessage,
            url: dealerurl,
            stack: error?.stack
        });
        return {
            success: false,
            error: errorMessage,
            verification: undefined,
        };
    }
}

/**
 * Process URL shortening jobs from the queue
 */
export async function processUrlShorteningJobs(maxJobs: number = 10): Promise<{
    processed: number;
    success: number;
    failed: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let processed = 0;
    let success = 0;
    let failed = 0;

    try {
        // Fetch pending URL shortening jobs
        const { data: jobs, error: fetchError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'url_shortening')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(maxJobs);

        if (fetchError) {
            throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
        }

        if (!jobs || jobs.length === 0) {
            console.log('No pending URL shortening jobs found');
            return { processed: 0, success: 0, failed: 0, errors: [] };
        }

        console.log(`Processing ${jobs.length} URL shortening jobs`);

        for (const job of jobs) {
            try {
                // Mark job as processing
                await supabase
                    .from('job_queue')
                    .update({
                        status: 'processing',
                        started_at: new Date().toISOString(),
                        attempts: (job.attempts || 0) + 1
                    })
                    .eq('id', job.id);

                const jobData = job as UrlShorteningJob;
                const { payload } = jobData;

                // Check if vehicle already has a short URL
                const { data: vehicle } = await supabase
                    .from('vehicles')
                    .select('short_url, rebrandly_id, short_url_status')
                    .eq('dealer_id', payload.dealer_id)
                    .eq('vin', payload.vin)
                    .single();

                if (vehicle?.short_url || vehicle?.rebrandly_id) {
                    // Vehicle already has a short URL, mark job as completed
                    await supabase
                        .from('job_queue')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            result: { message: 'Vehicle already has short URL', existing: vehicle.short_url }
                        })
                        .eq('id', job.id);

                    processed++;
                    success++;
                    console.log(`Job ${job.id}: Vehicle already has short URL`);
                    continue;
                }

                // Create short link
                const result = await createShortLinkForVehicleWithVerification(
                    payload.dealerurl,
                    payload.utm,
                    {
                        verifyUrl: true,
                        timeoutMs: 10000,
                        logFunction: (level, message, meta) => {
                            console.log(`[${level.toUpperCase()}] ${message}`, meta);
                        }
                    }
                );

                if (result.success && result.shortUrl && result.id) {
                    // Update vehicle with short URL
                    const fullShortUrl = result.shortUrl.startsWith('http') ? result.shortUrl : `https://${result.shortUrl}`;

                    await supabase
                        .from('vehicles')
                        .update({
                            short_url: fullShortUrl,
                            rebrandly_id: result.id,
                            short_url_status: 'completed',
                            short_url_last_attempt: new Date().toISOString()
                        })
                        .eq('dealer_id', payload.dealer_id)
                        .eq('vin', payload.vin);

                    // Mark job as completed
                    await supabase
                        .from('job_queue')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            result: {
                                shortUrl: fullShortUrl,
                                id: result.id,
                                verification: result.verification
                            }
                        })
                        .eq('id', job.id);

                    processed++;
                    success++;
                    console.log(`Job ${job.id}: Short URL created successfully`, {
                        vin: payload.vin,
                        shortUrl: fullShortUrl
                    });
                } else {
                    // Handle failure
                    const maxAttempts = job.max_attempts || 3;
                    const currentAttempts = (job.attempts || 0) + 1;
                    const errorMessage = result.error || 'Unknown error';

                    if (currentAttempts >= maxAttempts) {
                        // Mark job as failed
                        await supabase
                            .from('job_queue')
                            .update({
                                status: 'failed',
                                completed_at: new Date().toISOString(),
                                error: errorMessage
                            })
                            .eq('id', job.id);

                        // Update vehicle status
                        await supabase
                            .from('vehicles')
                            .update({
                                short_url_status: 'failed',
                                short_url_last_attempt: new Date().toISOString(),
                                short_url_attempts: currentAttempts
                            })
                            .eq('dealer_id', payload.dealer_id)
                            .eq('vin', payload.vin);

                        processed++;
                        failed++;
                        errors.push(`Job ${job.id}: ${errorMessage}`);
                        console.error(`Job ${job.id}: Failed after ${currentAttempts} attempts`, {
                            vin: payload.vin,
                            error: errorMessage
                        });
                    } else {
                        // Retry with exponential backoff
                        const backoffMs = Math.min(1000 * Math.pow(2, currentAttempts - 1), 30000); // Max 30 seconds
                        const retryAt = new Date(Date.now() + backoffMs);

                        await supabase
                            .from('job_queue')
                            .update({
                                status: 'retry',
                                scheduled_at: retryAt.toISOString(),
                                error: errorMessage
                            })
                            .eq('id', job.id);

                        // Update vehicle status
                        await supabase
                            .from('vehicles')
                            .update({
                                short_url_status: 'processing',
                                short_url_last_attempt: new Date().toISOString(),
                                short_url_attempts: currentAttempts
                            })
                            .eq('dealer_id', payload.dealer_id)
                            .eq('vin', payload.vin);

                        processed++;
                        console.log(`Job ${job.id}: Scheduled for retry in ${backoffMs}ms`, {
                            vin: payload.vin,
                            attempt: currentAttempts,
                            error: errorMessage
                        });
                    }
                }
            } catch (error: any) {
                processed++;
                failed++;
                const errorMessage = error?.message || error?.toString() || 'Unknown error';
                const errorMsg = `Job ${job.id}: ${errorMessage}`;
                errors.push(errorMsg);
                console.error(errorMsg, {
                    stack: error?.stack,
                    jobId: job.id,
                    vin: job.payload?.vin
                });

                // Mark job as failed
                await supabase
                    .from('job_queue')
                    .update({
                        status: 'failed',
                        completed_at: new Date().toISOString(),
                        error: errorMessage
                    })
                    .eq('id', job.id);
            }
        }

        console.log(`URL shortening job processing complete: ${processed} processed, ${success} success, ${failed} failed`);
        return { processed, success, failed, errors };

    } catch (error: any) {
        console.error('URL shortening job processing failed:', error.message);
        return { processed: 0, success: 0, failed: 1, errors: [error.message] };
    }
}
