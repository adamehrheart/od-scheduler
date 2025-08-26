import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

interface SitemapUrl {
    loc: string;
    lastmod?: string;
    changefreq?: string;
    priority?: string;
}

interface SitemapData {
    urlset: {
        url: SitemapUrl[];
    };
}

export async function processSitemapForDealer(
    dealerId: string,
    sitemapUrl: string,
    logFunction: (level: string, message: string, data?: any) => void
) {
    const supabaseUrl = process.env.OD_SUPABASE_URL;
    const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        logFunction('info', 'Fetching sitemap', { dealerId, sitemapUrl });

        // Fetch sitemap
        const response = await fetch(sitemapUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
        }

        const sitemapXml = await response.text();
        logFunction('info', 'Sitemap fetched successfully', { size: sitemapXml.length });

        // Parse XML
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
        });
        const parsed: SitemapData = parser.parse(sitemapXml);

        if (!parsed.urlset?.url) {
            throw new Error('Invalid sitemap structure');
        }

        // Extract vehicle detail URLs
        const vehicleUrls = parsed.urlset.url.filter(url => {
            // Filter for new Honda vehicle detail pages
            return url.loc.includes('/new/Honda/') && url.loc.endsWith('.htm');
        });

        logFunction('info', 'Found vehicle URLs in sitemap', {
            total: parsed.urlset.url.length,
            vehicleUrls: vehicleUrls.length
        });

        // Get existing vehicles for this dealer
        const { data: existingVehicles, error: fetchError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl')
            .eq('dealer_id', dealerId);

        if (fetchError) {
            throw new Error(`Failed to fetch existing vehicles: ${fetchError.message}`);
        }

        logFunction('info', 'Found existing vehicles', { count: existingVehicles?.length || 0 });

        // Create a map of existing VINs to their current dealer URLs
        const existingVehicleMap = new Map<string, string>();
        existingVehicles?.forEach(vehicle => {
            existingVehicleMap.set(vehicle.vin, vehicle.dealerurl || '');
        });

        // Enhanced matching: Find vehicles without URLs and match them to sitemap URLs
        const { data: vehiclesWithoutUrls, error: fetchVehiclesError } = await supabase
            .from('vehicles')
            .select('vin, make, model, year, trim')
            .eq('dealer_id', dealerId)
            .is('dealerurl', null);

        if (fetchVehiclesError) {
            logFunction('error', 'Failed to fetch vehicles without URLs', { error: fetchVehiclesError.message });
        } else {
            logFunction('info', 'Found vehicles without URLs', { count: vehiclesWithoutUrls?.length || 0 });
        }

        // Process each vehicle URL
        let updatedCount = 0;
        let newUrlCount = 0;
        let matchedCount = 0;
        const urlShorteningJobs = [];

        // First, try to match vehicles without URLs to sitemap URLs
        if (vehiclesWithoutUrls && vehiclesWithoutUrls.length > 0) {
            for (const vehicle of vehiclesWithoutUrls) {
                let bestMatch = null;
                let bestScore = 0;

                for (const urlData of vehicleUrls) {
                    const url = urlData.loc;
                    const score = calculateVehicleUrlMatchScore(vehicle, url);

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = url;
                    }
                }

                // Use match if score is reasonable (lowered threshold to catch more vehicles)
                if (bestMatch && bestScore >= 0.1) {
                    logFunction('info', 'Matched vehicle to URL', {
                        vin: vehicle.vin,
                        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                        score: bestScore.toFixed(2),
                        url: bestMatch
                    });

                    // Update vehicle with URL
                    const { error: updateError } = await supabase
                        .from('vehicles')
                        .update({
                            dealerurl: bestMatch,
                            short_url_status: 'pending',
                            short_url_attempts: 0,
                            short_url_last_attempt: null
                        })
                        .eq('vin', vehicle.vin)
                        .eq('dealer_id', dealerId);

                    if (updateError) {
                        logFunction('error', 'Failed to update vehicle URL', { vin: vehicle.vin, error: updateError.message });
                        continue;
                    }

                    matchedCount++;

                    // Create URL shortening job
                    urlShorteningJobs.push({
                        job_type: 'url_shortening',
                        status: 'pending',
                        attempts: 0,
                        max_attempts: 3,
                        payload: {
                            dealer_id: dealerId,
                            vin: vehicle.vin,
                            dealerurl: bestMatch,
                            utm: {
                                dealerId: dealerId,
                                vin: vehicle.vin,
                                make: vehicle.make,
                                model: vehicle.model,
                                year: vehicle.year,
                                medium: 'LLM',
                                source: 'sitemap'
                            }
                        },
                        created_at: new Date().toISOString(),
                        scheduled_at: new Date().toISOString()
                    });
                } else {
                    logFunction('info', 'No good URL match found for vehicle', {
                        vin: vehicle.vin,
                        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                        bestScore: bestScore.toFixed(2)
                    });
                }
            }
        }

        // Then process existing URLs for updates (original logic)
        for (const urlData of vehicleUrls) {
            const url = urlData.loc;

            // Extract VIN from URL (assuming it's in the URL somewhere)
            const urlParts = url.split('/');
            const filename = urlParts[urlParts.length - 1];
            const hashPart = filename.split('.')[0];

            // Try to find a VIN in the existing vehicles that matches this URL
            let matchedVin = null;

            // For demonstration, let's assume we can extract some identifier
            const urlIdentifier = hashPart.substring(hashPart.length - 8); // Last 8 chars

            // Find matching vehicle by some criteria
            for (const [vin, existingUrl] of existingVehicleMap) {
                if (existingUrl && existingUrl.includes(urlIdentifier)) {
                    matchedVin = vin;
                    break;
                }
            }

            if (matchedVin) {
                const existingUrl = existingVehicleMap.get(matchedVin);

                if (existingUrl !== url) {
                    // URL has changed or is new
                    logFunction('info', 'Updating vehicle URL', { vin: matchedVin, oldUrl: existingUrl, newUrl: url });

                    const { error: updateError } = await supabase
                        .from('vehicles')
                        .update({
                            dealerurl: url,
                            short_url_status: 'pending',
                            short_url_attempts: 0,
                            short_url_last_attempt: null
                        })
                        .eq('vin', matchedVin)
                        .eq('dealer_id', dealerId);

                    if (updateError) {
                        logFunction('error', 'Failed to update vehicle URL', { vin: matchedVin, error: updateError.message });
                        continue;
                    }

                    updatedCount++;

                    // Create URL shortening job
                    urlShorteningJobs.push({
                        job_type: 'url_shortening',
                        status: 'pending',
                        attempts: 0,
                        max_attempts: 3,
                        payload: {
                            dealer_id: dealerId,
                            vin: matchedVin,
                            dealerurl: url,
                            utm: {
                                dealerId: dealerId,
                                vin: matchedVin,
                                medium: 'LLM',
                                source: 'sitemap'
                            }
                        },
                        created_at: new Date().toISOString(),
                        scheduled_at: new Date().toISOString()
                    });
                }
            } else {
                // New vehicle URL - we need to create a new vehicle record
                // This would require additional logic to get vehicle details
                logFunction('info', 'Found new vehicle URL', { url });
                newUrlCount++;
            }
        }

        // Insert URL shortening jobs
        if (urlShorteningJobs.length > 0) {
            const { error: jobError } = await supabase
                .from('job_queue')
                .insert(urlShorteningJobs);

            if (jobError) {
                logFunction('error', 'Failed to create URL shortening jobs', { error: jobError.message });
            } else {
                logFunction('info', 'Created URL shortening jobs', { count: urlShorteningJobs.length });
            }
        }

        logFunction('info', 'Sitemap processing completed', {
            totalUrls: vehicleUrls.length,
            updatedCount,
            newUrlCount,
            jobsCreated: urlShorteningJobs.length
        });

        return {
            success: true,
            totalUrls: vehicleUrls.length,
            updatedCount,
            newUrlCount,
            jobsCreated: urlShorteningJobs.length
        };

    } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        logFunction('error', 'Sitemap processing failed', {
            error: errorMessage,
            dealerId,
            sitemapUrl
        });

        return {
            success: false,
            error: errorMessage
        };
    }
}

export async function processSitemapJobs(
    limit: number = 10,
    logFunction: (level: string, message: string, data?: any) => void = console.log
) {
    const supabaseUrl = process.env.OD_SUPABASE_URL;
    const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Get pending sitemap jobs
        const { data: jobs, error: fetchError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'sitemap_processing')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit);

        if (fetchError) {
            throw new Error(`Failed to fetch sitemap jobs: ${fetchError.message}`);
        }

        if (!jobs || jobs.length === 0) {
            logFunction('info', 'No pending sitemap jobs found');
            return { processed: 0, success: 0, failed: 0, errors: [] };
        }

        logFunction('info', `Processing ${jobs.length} sitemap jobs`);

        let processed = 0;
        let success = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const job of jobs) {
            try {
                // Mark job as processing
                await supabase
                    .from('job_queue')
                    .update({
                        status: 'processing',
                        started_at: new Date().toISOString()
                    })
                    .eq('id', job.id);

                const { payload } = job;
                const result = await processSitemapForDealer(
                    payload.dealer_id,
                    payload.sitemap_url,
                    logFunction
                );

                processed++;

                if (result.success) {
                    success++;

                    // Mark job as completed
                    await supabase
                        .from('job_queue')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            result: result
                        })
                        .eq('id', job.id);
                } else {
                    failed++;
                    errors.push(`Job ${job.id}: ${result.error}`);

                    // Mark job as failed
                    await supabase
                        .from('job_queue')
                        .update({
                            status: 'failed',
                            completed_at: new Date().toISOString(),
                            error: result.error
                        })
                        .eq('id', job.id);
                }

            } catch (error: any) {
                processed++;
                failed++;
                const errorMessage = error?.message || error?.toString() || 'Unknown error';
                const errorMsg = `Job ${job.id}: ${errorMessage}`;
                errors.push(errorMsg);
                logFunction('error', errorMsg, {
                    stack: error?.stack,
                    jobId: job.id
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

        logFunction('info', 'Sitemap job processing completed', {
            processed,
            success,
            failed,
            errors: errors.length
        });

        return { processed, success, failed, errors };

    } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        logFunction('error', 'Sitemap job processing failed', { error: errorMessage });
        return { processed: 0, success: 0, failed: 1, errors: [errorMessage] };
    }
}

/**
 * Calculate match score between a vehicle and a URL
 * URLs follow pattern: /new/, /used/, /certified/ + make/model/year
 */
function calculateVehicleUrlMatchScore(vehicle: any, url: string): number {
    let score = 0;

    const urlLower = url.toLowerCase();
    const vehicleLower = {
        make: vehicle.make?.toLowerCase() || '',
        model: vehicle.model?.toLowerCase() || '',
        year: vehicle.year?.toString() || '',
        trim: vehicle.trim?.toLowerCase() || ''
    };

    // Check for vehicle type in URL (/new/, /used/, /certified/)
    if (urlLower.includes('/new/')) {
        score += 0.1; // New vehicles
    } else if (urlLower.includes('/used/')) {
        score += 0.1; // Used vehicles
    } else if (urlLower.includes('/certified/')) {
        score += 0.1; // Certified vehicles
    }

    // Year match (exact)
    if (urlLower.includes(vehicleLower.year)) {
        score += 0.4;
    }

    // Make match (any brand)
    if (urlLower.includes(vehicleLower.make)) {
        score += 0.3;
    }

    // Model match (partial)
    if (vehicleLower.model && urlLower.includes(vehicleLower.model)) {
        score += 0.2;
    }

    // Trim match (if available)
    if (vehicleLower.trim && urlLower.includes(vehicleLower.trim)) {
        score += 0.1;
    }

    return Math.max(0, score);
}
