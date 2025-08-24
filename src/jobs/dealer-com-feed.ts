import { createClient } from '@supabase/supabase-js';

interface DealerComVehicle {
    vin: string;
    make: string;
    model: string;
    year: number;
    trim: string;
    mileage: number | null;
    internetPrice: number | null;
    msrp: number | null;
    stockNumber: string;
    status: string;
    extColor: string | null;
    intColor: string | null;
    bodyStyle: string;
    fuelType: string;
    transmission: string | null;
    engine: string | null;
    options: string[] | null;
    images?: Array<{ uri: string }>;
    comments?: string;
    marketingTitle?: string;
    location?: string;
    daysOnLot?: number;
    certified?: boolean;
    carfaxUrl?: string;
    carfaxIconUrl?: string;
    incentives?: any[];
    payments?: any;
    uuid?: string;
}

interface DealerComInventoryResponse {
    inventory: DealerComVehicle[];
    totalCount?: number;
    pageSize?: number;
    currentPage?: number;
}

export async function processDealerComFeedForDealer(
    dealerId: string,
    dealerConfig: {
        siteId: string;
        baseUrl: string;
        pageSize?: number;
    },
    logFunction: (level: string, message: string, data?: any) => void
) {
    const supabaseUrl = process.env.OD_SUPABASE_URL;
    const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        logFunction('info', 'Fetching Dealer.com inventory feed', { dealerId, siteId: dealerConfig.siteId });

        // Fetch inventory data from Dealer.com API
        const response = await fetch(`${dealerConfig.baseUrl}/api/widget/ws-inv-data/getInventory`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
            },
            body: JSON.stringify({
                siteId: dealerConfig.siteId,
                locale: "en_US",
                device: "DESKTOP",
                pageAlias: "INVENTORY_LISTING_DEFAULT_AUTO_NEW",
                pageId: `${dealerConfig.siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_NEW_V1_1`,
                windowId: "inventory-data-bus2",
                widgetName: "ws-inv-data",
                inventoryParameters: {},
                preferences: {
                    pageSize: dealerConfig.pageSize?.toString() || "50",
                    "listing.config.id": "auto-new",
                    "removeEmptyFacets": "true",
                    "removeEmptyConstraints": "true",
                    "required.display.attributes": "vin,make,model,year,trim,mileage,internetPrice,msrp,stockNumber,status,extColor,intColor,bodyStyle,fuelType,transmission,engine,options,images,comments,marketingTitle,location,daysOnLot,certified,carfaxUrl,carfaxIconUrl,incentives,payments,uuid"
                },
                includePricing: true
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Dealer.com feed: ${response.status} ${response.statusText}`);
        }

        const data: DealerComInventoryResponse = await response.json();
        
        if (!data.inventory || !Array.isArray(data.inventory)) {
            throw new Error('Invalid response structure from Dealer.com feed');
        }

        logFunction('info', 'Dealer.com feed fetched successfully', { 
            totalVehicles: data.inventory.length,
            totalCount: data.totalCount
        });

        // Get existing vehicles for this dealer
        const { data: existingVehicles, error: fetchError } = await supabase
            .from('vehicles')
            .select('vin, dealerurl, short_url_status')
            .eq('dealer_id', dealerId);

        if (fetchError) {
            throw new Error(`Failed to fetch existing vehicles: ${fetchError.message}`);
        }

        logFunction('info', 'Found existing vehicles', { count: existingVehicles?.length || 0 });

        // Create a map of existing VINs
        const existingVinMap = new Map<string, any>();
        existingVehicles?.forEach(vehicle => {
            existingVinMap.set(vehicle.vin, vehicle);
        });

        // Process each vehicle from the feed
        let newVehicles = 0;
        let updatedVehicles = 0;
        let urlShorteningJobs = [];

        for (const vehicle of data.inventory) {
            if (!vehicle.vin) {
                logFunction('warn', 'Vehicle missing VIN', { vehicle });
                continue;
            }

            const existingVehicle = existingVinMap.get(vehicle.vin);
            
            // Prepare vehicle data for database
            const vehicleData = {
                vin: vehicle.vin,
                dealer_id: dealerId,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                trim: vehicle.trim,
                mileage: vehicle.mileage,
                internet_price: vehicle.internetPrice,
                msrp: vehicle.msrp,
                stock_number: vehicle.stockNumber,
                status: vehicle.status,
                exterior_color: vehicle.extColor,
                interior_color: vehicle.intColor,
                body_style: vehicle.bodyStyle,
                fuel_type: vehicle.fuelType,
                transmission: vehicle.transmission,
                engine: vehicle.engine,
                options: vehicle.options,
                comments: vehicle.comments,
                marketing_title: vehicle.marketingTitle,
                location: vehicle.location,
                days_on_lot: vehicle.daysOnLot,
                certified: vehicle.certified,
                carfax_url: vehicle.carfaxUrl,
                carfax_icon_url: vehicle.carfaxIconUrl,
                incentives: vehicle.incentives,
                payments: vehicle.payments,
                dealer_com_uuid: vehicle.uuid,
                // Generate dealer URL from VIN/stock number
                dealerurl: `${dealerConfig.baseUrl}/new/${vehicle.make}/${vehicle.year}-${vehicle.make}-${vehicle.model}-${vehicle.uuid || vehicle.vin}.htm`,
                source: 'dealer_com_feed',
                last_updated: new Date().toISOString()
            };

            if (existingVehicle) {
                // Update existing vehicle
                const { error: updateError } = await supabase
                    .from('vehicles')
                    .update(vehicleData)
                    .eq('vin', vehicle.vin)
                    .eq('dealer_id', dealerId);

                if (updateError) {
                    logFunction('error', 'Failed to update vehicle', { vin: vehicle.vin, error: updateError.message });
                    continue;
                }

                updatedVehicles++;

                // If vehicle doesn't have a short URL, create a job for it
                if (!existingVehicle.short_url_status || existingVehicle.short_url_status === 'pending') {
                    urlShorteningJobs.push({
                        job_type: 'url_shortening',
                        status: 'pending',
                        attempts: 0,
                        max_attempts: 3,
                        payload: {
                            dealer_id: dealerId,
                            vin: vehicle.vin,
                            dealerurl: vehicleData.dealerurl,
                            utm: {
                                dealerId: dealerId,
                                vin: vehicle.vin,
                                make: vehicle.make,
                                model: vehicle.model,
                                year: vehicle.year,
                                medium: 'LLM',
                                source: 'dealer_com_feed'
                            }
                        },
                        created_at: new Date().toISOString(),
                        scheduled_at: new Date().toISOString()
                    });
                }
            } else {
                // Insert new vehicle
                const { error: insertError } = await supabase
                    .from('vehicles')
                    .insert({
                        ...vehicleData,
                        short_url_status: 'pending'
                    });

                if (insertError) {
                    logFunction('error', 'Failed to insert vehicle', { vin: vehicle.vin, error: insertError.message });
                    continue;
                }

                newVehicles++;

                // Create URL shortening job for new vehicle
                urlShorteningJobs.push({
                    job_type: 'url_shortening',
                    status: 'pending',
                    attempts: 0,
                    max_attempts: 3,
                    payload: {
                        dealer_id: dealerId,
                        vin: vehicle.vin,
                        dealerurl: vehicleData.dealerurl,
                        utm: {
                            dealerId: dealerId,
                            vin: vehicle.vin,
                            make: vehicle.make,
                            model: vehicle.model,
                            year: vehicle.year,
                            medium: 'LLM',
                            source: 'dealer_com_feed'
                        }
                    },
                    created_at: new Date().toISOString(),
                    scheduled_at: new Date().toISOString()
                });
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

        logFunction('info', 'Dealer.com feed processing completed', {
            totalVehicles: data.inventory.length,
            newVehicles,
            updatedVehicles,
            urlShorteningJobsCreated: urlShorteningJobs.length
        });

        return {
            success: true,
            totalVehicles: data.inventory.length,
            newVehicles,
            updatedVehicles,
            urlShorteningJobsCreated: urlShorteningJobs.length
        };

    } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        logFunction('error', 'Dealer.com feed processing failed', {
            error: errorMessage,
            dealerId,
            siteId: dealerConfig.siteId
        });
        
        return {
            success: false,
            error: errorMessage
        };
    }
}

export async function processDealerComFeedJobs(
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
        // Get pending Dealer.com feed jobs
        const { data: jobs, error: fetchError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('job_type', 'dealer_com_feed')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit);

        if (fetchError) {
            throw new Error(`Failed to fetch Dealer.com feed jobs: ${fetchError.message}`);
        }

        if (!jobs || jobs.length === 0) {
            logFunction('info', 'No pending Dealer.com feed jobs found');
            return { processed: 0, success: 0, failed: 0, errors: [] };
        }

        logFunction('info', `Processing ${jobs.length} Dealer.com feed jobs`);

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
                const result = await processDealerComFeedForDealer(
                    payload.dealer_id,
                    payload.dealer_config,
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

        logFunction('info', 'Dealer.com feed job processing completed', {
            processed,
            success,
            failed,
            errors: errors.length
        });

        return { processed, success, failed, errors };

    } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        logFunction('error', 'Dealer.com feed job processing failed', { error: errorMessage });
        throw error;
    }
}
