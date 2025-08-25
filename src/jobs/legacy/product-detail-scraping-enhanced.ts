/**
 * Enhanced Product Detail Scraping with Robust Error Handling
 * 
 * Processes product detail scraping jobs with improved error handling and null checks.
 * Features:
 * - Comprehensive null/undefined checks
 * - Enhanced error handling with circuit breaker
 * - Better logging and debugging
 * - Graceful handling of malformed data
 */

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
// import { Vehicle, normalizeVehicleValues } from '@adamehrheart/schema';
import { executeJobWithErrorHandling, EnhancedErrorHandler } from './enhanced-error-handling.js';

interface Vehicle {
  vin: string;
  make?: string;
  model?: string;
  year?: string;
  trim?: string;
  [key: string]: any;
}

interface ProductDetailScrapingJob {
  id: string;
  job_type: 'product_detail_scraping';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
  payload: {
    dealer_id: string;
    urls?: string[];
    config?: {
      extractDealerComJson: boolean;
      extractJsonLd: boolean;
      extractHtmlFallback: boolean;
      maxConcurrency: number;
      updateDatabase: boolean;
    };
  };
  attempts: number;
  max_attempts: number;
}

// Use Vehicle type from od-schema as single source of truth
type ScrapedVehicle = Vehicle;

interface ScrapedResult {
  url: string;
  success: boolean;
  vehicle?: ScrapedVehicle;
  error?: string;
  extractedData?: {
    dealerComJson?: any;
    jsonLd?: any;
    html?: any;
  };
}

// Initialize enhanced error handler
const errorHandler = new EnhancedErrorHandler();

/**
 * Enhanced product detail scraping job processor with robust error handling
 */
export async function processProductDetailScrapingJobsEnhanced(
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
    // Get pending product detail scraping jobs
    const { data: jobs, error: fetchError } = await supabase
      .from('job_queue')
      .select('*')
      .eq('job_type', 'product_detail_scraping')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch product detail scraping jobs: ${fetchError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      logFunction('info', 'No pending product detail scraping jobs found');
      return { processed: 0, success: 0, failed: 0, errors: [] };
    }

    logFunction('info', `Processing ${jobs.length} product detail scraping jobs`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      try {
        const result = await executeJobWithErrorHandling(
          job.id,
          'product_detail_scraping',
          () => processProductDetailScrapingForDealerEnhanced(job, supabase, logFunction),
          errorHandler,
          logFunction
        );

        processed++;

        if (result.success) {
          success++;
          logFunction('info', `Job ${job.id} completed successfully`, {
            totalUrls: result.result?.totalUrls,
            successfulScrapes: result.result?.successfulScrapes,
            vehiclesEnriched: result.result?.vehiclesEnriched
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

    logFunction('info', 'Product detail scraping job processing completed', {
      processed,
      success,
      failed,
      errors: errors.length
    });

    return { processed, success, failed, errors };

  } catch (error: any) {
    const errorMsg = error?.message || error?.toString() || 'Unknown error';
    logFunction('error', 'Product detail scraping job processing failed', { error: errorMsg });
    return { processed: 0, success: 0, failed: 1, errors: [errorMsg] };
  }
}

/**
 * Enhanced product detail scraping for dealer with robust error handling
 */
async function processProductDetailScrapingForDealerEnhanced(
  job: ProductDetailScrapingJob,
  supabase: any,
  logFunction: (level: string, message: string, data?: any) => void
) {
  const { payload } = job;
  const { dealer_id, urls, config } = payload;

  try {
    // Set default config if not provided
    const defaultConfig = {
      extractDealerComJson: true,
      extractJsonLd: true,
      extractHtmlFallback: false,
      maxConcurrency: 5,
      updateDatabase: true
    };
    const finalConfig = config || defaultConfig;

    // If no URLs provided, fetch them from the database with proper null checks
    let urlsToProcess: string[] = [];
    
    if (!urls || urls.length === 0) {
      logFunction('info', 'No URLs provided, fetching from vehicles table', { dealerId: dealer_id });

      const { data: vehicles, error: fetchError } = await supabase
        .from('vehicles')
        .select('dealer_page_url')
        .eq('dealer_id', dealer_id)
        .not('dealer_page_url', 'is', null);

      if (fetchError) {
        throw new Error(`Failed to fetch vehicle URLs: ${fetchError.message}`);
      }

      // Add proper null checks
      if (vehicles && Array.isArray(vehicles)) {
        urlsToProcess = vehicles
          .filter(v => v && v.dealer_page_url && typeof v.dealer_page_url === 'string')
          .map(v => v.dealer_page_url);
      }

      logFunction('info', 'Fetched URLs from vehicles table', { 
        dealerId: dealer_id, 
        urlCount: urlsToProcess.length,
        totalVehicles: vehicles?.length || 0
      });
    } else {
      // Use provided URLs with validation
      urlsToProcess = urls.filter(url => url && typeof url === 'string' && url.trim() !== '');
      logFunction('info', 'Using provided URLs', { 
        dealerId: dealer_id, 
        urlCount: urlsToProcess.length,
        originalCount: urls.length
      });
    }

    if (urlsToProcess.length === 0) {
      logFunction('info', 'No valid vehicle URLs found to process', { dealerId: dealer_id });
      return {
        success: true,
        totalUrls: 0,
        successfulScrapes: 0,
        failedScrapes: 0,
        vehiclesEnriched: 0
      };
    }

    logFunction('info', 'Starting product detail scraping', { 
      dealerId: dealer_id, 
      urlCount: urlsToProcess.length 
    });

    const results: ScrapedResult[] = [];

    // Process URLs with concurrency control and error handling
    for (let i = 0; i < urlsToProcess.length; i += finalConfig.maxConcurrency) {
      const batch = urlsToProcess.slice(i, i + finalConfig.maxConcurrency);
      
      // Process batch with individual error handling
      const batchPromises = batch.map(async (url) => {
        try {
          return await scrapeProductDetailPageEnhanced(url, finalConfig);
        } catch (error: any) {
          logFunction('error', 'Error scraping URL', {
            url,
            error: error?.message || error?.toString()
          });
          return {
            url,
            success: false,
            error: error?.message || error?.toString()
          } as ScrapedResult;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Extract results from Promise.allSettled
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const url = batch[index];
          results.push({
            url,
            success: false,
            error: result.reason?.message || 'Promise rejected'
          });
        }
      });

      // Small delay between batches to be respectful
      if (i + finalConfig.maxConcurrency < urlsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successfulResults = results.filter(r => r.success && r.vehicle) || [];
    const failedResults = results.filter(r => !r.success) || [];

    logFunction('info', 'Product detail scraping completed', {
      total: results.length,
      successful: successfulResults.length,
      failed: failedResults.length
    });

    // Update database if requested and we have successful results
    let vehiclesEnriched = 0;
    if (finalConfig.updateDatabase && successfulResults.length > 0) {
      vehiclesEnriched = await updateVehiclesWithScrapedDataEnhanced(
        supabase, 
        dealer_id, 
        successfulResults, 
        logFunction
      );
    }

    return {
      success: true,
      totalUrls: results.length,
      successfulScrapes: successfulResults.length,
      failedScrapes: failedResults.length,
      vehiclesEnriched
    };

  } catch (error: any) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    logFunction('error', 'Product detail scraping failed', { 
      error: errorMessage,
      dealerId: dealer_id,
      stack: error?.stack
    });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Enhanced product detail page scraping with better error handling
 */
async function scrapeProductDetailPageEnhanced(
  url: string, 
  config: any
): Promise<ScrapedResult> {
  try {
    // Validate URL
    if (!url || typeof url !== 'string' || url.trim() === '') {
      throw new Error('Invalid URL provided');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    if (!html || html.trim() === '') {
      throw new Error('Empty HTML response');
    }

    const $ = cheerio.load(html);

    const result: ScrapedResult = {
      url,
      success: false,
      extractedData: {}
    };

    // Extract JSON-LD data (highest priority)
    if (config.extractJsonLd) {
      try {
        const jsonLdScripts = $('script[type="application/ld+json"]');
        if (jsonLdScripts.length > 0) {
          for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
              const scriptContent = $(jsonLdScripts[i]).html();
              if (scriptContent) {
                const jsonLd = JSON.parse(scriptContent);
                if (jsonLd && (jsonLd['@type'] === 'Car' || jsonLd['@type'] === 'Vehicle')) {
                  result.extractedData!.jsonLd = jsonLd;
                  break;
                }
              }
            } catch (parseError) {
              // Continue to next script if this one fails to parse
              continue;
            }
          }
        }
      } catch (error) {
        console.warn('Error extracting JSON-LD:', error);
      }
    }

    // Extract Dealer.com JSON data
    if (config.extractDealerComJson) {
      try {
        const dealerComScripts = $('script').filter((_, el) => {
          const content = $(el).html() || '';
          return content.includes('window.DDC') || content.includes('dealer.com');
        });

        if (dealerComScripts.length > 0) {
          for (let i = 0; i < dealerComScripts.length; i++) {
            try {
              const scriptContent = $(dealerComScripts[i]).html();
              if (scriptContent) {
                // Look for vehicle data patterns
                const vehicleMatch = scriptContent.match(/window\.DDC\s*=\s*({.*?});/s);
                if (vehicleMatch) {
                  const dealerComData = JSON.parse(vehicleMatch[1]);
                  result.extractedData!.dealerComJson = dealerComData;
                  break;
                }
              }
            } catch (parseError) {
              // Continue to next script if this one fails to parse
              continue;
            }
          }
        }
      } catch (error) {
        console.warn('Error extracting Dealer.com JSON:', error);
      }
    }

    // Create vehicle object from extracted data
    const vehicle = createVehicleFromExtractedData(result.extractedData, url);
    
    if (vehicle) {
      result.success = true;
      result.vehicle = vehicle;
    } else {
      result.error = 'No vehicle data could be extracted from the page';
    }

    return result;

  } catch (error: any) {
    return {
      url,
      success: false,
      error: error?.message || error?.toString() || 'Unknown error'
    };
  }
}

/**
 * Create vehicle object from extracted data with proper validation
 */
function createVehicleFromExtractedData(
  extractedData: any, 
  url: string
): ScrapedVehicle | null {
  try {
    // Try JSON-LD first (most reliable)
    if (extractedData?.jsonLd) {
      const jsonLd = extractedData.jsonLd;
      
      // Validate required fields
      if (jsonLd.name || jsonLd.brand?.name || jsonLd.model) {
        return {
          // Map JSON-LD fields to Vehicle schema
          id: jsonLd.identifier || jsonLd.sku || '',
          year: jsonLd.modelDate || jsonLd.year || null,
          make: jsonLd.brand?.name || jsonLd.manufacturer?.name || '',
          model: jsonLd.model || jsonLd.name || '',
          trim: jsonLd.trim || '',
          vin: jsonLd.vehicleIdentificationNumber || jsonLd.vin || '',
          dealer_page_url: url,
          // Add other fields as available
          price: jsonLd.offers?.price || null,
          mileage: jsonLd.mileageFromOdometer?.value || null,
          color_ext: jsonLd.color || '',
          description: jsonLd.description || '',
          // Set defaults for required fields
          dealer_id: '', // Will be set by caller
          dealerslug: '',
          short_url: null,
          rebrandly_id: null,
          short_url_status: null,
          short_url_attempts: null,
          short_url_last_attempt: null,
          url_source: 'scrape',
          images: [],
          incentives: null,
          last_api_at: null,
          last_scrape_at: new Date().toISOString(),
          last_scrape_timestamp: new Date().toISOString(),
          source_priority: 1,
          raw: jsonLd,
          updated_at: new Date().toISOString()
        } as ScrapedVehicle;
      }
    }

    // Try Dealer.com JSON as fallback
    if (extractedData?.dealerComJson) {
      const dealerCom = extractedData.dealerComJson;
      
      if (dealerCom.vehicle || dealerCom.inventory) {
        const vehicleData = dealerCom.vehicle || dealerCom.inventory;
        
        return {
          id: vehicleData.id || vehicleData.stockNumber || '',
          year: vehicleData.year || null,
          make: vehicleData.make || vehicleData.manufacturer || '',
          model: vehicleData.model || '',
          trim: vehicleData.trim || '',
          vin: vehicleData.vin || vehicleData.vehicleIdentificationNumber || '',
          dealer_page_url: url,
          price: vehicleData.price || vehicleData.msrp || null,
          mileage: vehicleData.mileage || vehicleData.odometer || null,
          color_ext: vehicleData.color || vehicleData.exteriorColor || '',
          description: vehicleData.description || '',
          // Set defaults for required fields
          dealer_id: '',
          dealerslug: '',
          short_url: null,
          rebrandly_id: null,
          short_url_status: null,
          short_url_attempts: null,
          short_url_last_attempt: null,
          url_source: 'scrape',
          images: vehicleData.images || [],
          incentives: null,
          last_api_at: null,
          last_scrape_at: new Date().toISOString(),
          last_scrape_timestamp: new Date().toISOString(),
          source_priority: 1,
          raw: vehicleData,
          updated_at: new Date().toISOString()
        } as ScrapedVehicle;
      }
    }

    return null;

  } catch (error) {
    console.error('Error creating vehicle from extracted data:', error);
    return null;
  }
}

/**
 * Enhanced database update with better error handling
 */
async function updateVehiclesWithScrapedDataEnhanced(
  supabase: any,
  dealerId: string,
  results: ScrapedResult[],
  logFunction: (level: string, message: string, data?: any) => void
): Promise<number> {
  let vehiclesEnriched = 0;

  for (const result of results) {
    if (!result.vehicle || !result.success) {
      continue;
    }

    try {
      // Set dealer_id from the job
      const vehicle = { ...result.vehicle, dealer_id: dealerId };

      // Validate required fields
      if (!vehicle.vin || !vehicle.dealer_id) {
        logFunction('warn', 'Skipping vehicle with missing required fields', {
          vin: vehicle.vin,
          dealerId: vehicle.dealer_id
        });
        continue;
      }

      // Update vehicle in database
      const { error: updateError } = await supabase
        .from('vehicles')
        .upsert(vehicle, {
          onConflict: 'dealer_id,vin'
        });

      if (updateError) {
        logFunction('error', 'Failed to update vehicle', {
          vin: vehicle.vin,
          error: updateError.message
        });
      } else {
        vehiclesEnriched++;
        logFunction('info', 'Vehicle updated successfully', {
          vin: vehicle.vin,
          make: vehicle.make,
          model: vehicle.model
        });
      }

    } catch (error: any) {
      logFunction('error', 'Error updating vehicle', {
        vin: result.vehicle?.vin,
        error: error?.message || error?.toString()
      });
    }
  }

  return vehiclesEnriched;
}
