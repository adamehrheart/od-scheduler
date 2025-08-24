import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { Vehicle, normalizeVehicleValues } from '@adamehrheart/schema';

interface ProductDetailScrapingJob {
  id: string;
  job_type: 'product_detail_scraping';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
  payload: {
    dealer_id: string;
    urls: string[];
    config: {
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

export async function processProductDetailScrapingJobs(
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
        // Mark job as processing
        await supabase
          .from('job_queue')
          .update({
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', job.id);

        const { payload } = job;
        const result = await processProductDetailScrapingForDealer(
          payload.dealer_id,
          logFunction,
          payload.urls || [], // URLs are optional now
          payload.config
        );

        if (result.success) {
          success++;
          processed++;

          // Mark job as completed
          await supabase
            .from('job_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              result: result
            })
            .eq('id', job.id);

          logFunction('info', `Job ${job.id} completed successfully`, {
            urlsProcessed: payload.urls?.length || 0,
            vehiclesEnriched: result.vehiclesEnriched
          });

        } else {
          failed++;
          processed++;
          const errorMessage = `Job ${job.id}: ${result.error}`;
          errors.push(errorMessage);

          // Check if we should retry
          if (job.attempts < job.max_attempts) {
            await supabase
              .from('job_queue')
              .update({
                status: 'retry',
                attempts: job.attempts + 1,
                error: result.error
              })
              .eq('id', job.id);
          } else {
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

          logFunction('error', errorMessage);
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

    logFunction('info', 'Product detail scraping job processing completed', {
      processed,
      success,
      failed,
      errors: errors.length
    });

    return { processed, success, failed, errors };

  } catch (error: any) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    logFunction('error', 'Product detail scraping job processing failed', { error: errorMessage });
    return { processed: 0, success: 0, failed: 1, errors: [errorMessage] };
  }
}

export async function processProductDetailScrapingForDealer(
  dealerId: string,
  logFunction: (level: string, message: string, data?: any) => void,
  urls?: string[],
  config?: {
    extractDealerComJson: boolean;
    extractJsonLd: boolean;
    extractHtmlFallback: boolean;
    maxConcurrency: number;
    updateDatabase: boolean;
  }
) {
  const supabaseUrl = process.env.OD_SUPABASE_URL;
  const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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

    // If no URLs provided, fetch them from the database
    let urlsToProcess = urls;
    if (!urlsToProcess || urlsToProcess.length === 0) {
      logFunction('info', 'No URLs provided, fetching from vehicles table', { dealerId });

      const { data: vehicles, error: fetchError } = await supabase
        .from('vehicles')
        .select('dealer_page_url')
        .eq('dealer_id', dealerId)
        .not('dealer_page_url', 'is', null);

      if (fetchError) {
        throw new Error(`Failed to fetch vehicle URLs: ${fetchError.message}`);
      }

      urlsToProcess = vehicles?.map(v => v.dealer_page_url) || [];
      logFunction('info', 'Fetched URLs from vehicles table', { dealerId, urlCount: urlsToProcess.length });
    }

    if (urlsToProcess.length === 0) {
      logFunction('info', 'No vehicle URLs found to process', { dealerId });
      return {
        success: true,
        totalUrls: 0,
        successfulScrapes: 0,
        failedScrapes: 0,
        vehiclesEnriched: 0
      };
    }

    logFunction('info', 'Starting product detail scraping', { dealerId, urlCount: urlsToProcess.length });

    const results: ScrapedResult[] = [];

    // Process URLs with concurrency control
    for (let i = 0; i < urlsToProcess.length; i += finalConfig.maxConcurrency) {
      const batch = urlsToProcess.slice(i, i + finalConfig.maxConcurrency);
      const batchPromises = batch.map(url => scrapeProductDetailPage(url, finalConfig));

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

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
      vehiclesEnriched = await updateVehiclesWithScrapedData(supabase, dealerId, successfulResults, logFunction);
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
    logFunction('error', 'Product detail scraping failed', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

async function scrapeProductDetailPage(url: string, config: any): Promise<ScrapedResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenDealer-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const result: ScrapedResult = {
      url,
      success: true,
      extractedData: {}
    };

    // Extract Dealer.com inventory JSON data
    if (config.extractDealerComJson) {
      const dealerComData = extractDealerComJsonData($);
      if (dealerComData) {
        result.extractedData!.dealerComJson = dealerComData;
        const vehicle = normalizeDealerComVehicle(dealerComData);
        if (vehicle) {
          result.vehicle = vehicle;
        }
      }
    }

    // Extract JSON-LD data
    if (config.extractJsonLd && !result.vehicle) {
      const jsonLdData = extractJsonLdData($);
      if (jsonLdData) {
        result.extractedData!.jsonLd = jsonLdData;
        if (!result.vehicle) {
          const vehicle = normalizeJsonLdVehicle(jsonLdData);
          if (vehicle) {
            result.vehicle = vehicle;
          }
        }
      }
    }

    // Extract HTML data as fallback
    if (config.extractHtmlFallback && !result.vehicle) {
      const htmlData = extractHtmlData($, url);
      if (htmlData) {
        result.extractedData!.html = htmlData;
        if (!result.vehicle) {
          const vehicle = normalizeHtmlVehicle(htmlData);
          if (vehicle) {
            result.vehicle = vehicle;
          }
        }
      }
    }

    return result;

  } catch (error: any) {
    return {
      url,
      success: false,
      error: error.message
    };
  }
}

function extractDealerComJsonData($: cheerio.CheerioAPI): any {
  // Look for Dealer.com inventory JSON in script tags
  const scripts = $('script');

  for (let i = 0; i < scripts.length; i++) {
    const script = $(scripts[i]);
    const content = script.html() || '';

    // Look for the massive Dealer.com inventory JSON object
    // This is the most reliable source - the full inventory data embedded in the page
    const patterns = [
      // Look for the main inventory data object
      /window\.inventoryData\s*=\s*({.*?});/s,
      /window\.vehicleData\s*=\s*({.*?});/s,
      /window\.dealerComData\s*=\s*({.*?});/s,
      /var\s+inventoryData\s*=\s*({.*?});/s,
      /var\s+vehicleData\s*=\s*({.*?});/s,
      // Look for the specific vehicle data in the page
      /window\.currentVehicle\s*=\s*({.*?});/s,
      /window\.vehicle\s*=\s*({.*?});/s,
      // Look for DDC (Dealer.com) data objects
      /DDC\.WS\.state\['ws-quick-specs'\]\s*=\s*({.*?});/s,
      /DDC\.WidgetData\["inventory-detail-callout"\]\s*=\s*({.*?});/s,
      // Look for any large JSON object with vehicle data
      /"inventory":\s*\[.*?\]/s,
      /"vehicles":\s*\[.*?\]/s,
      /"vehicle":\s*{.*?}/s
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const jsonData = JSON.parse(match[1]);
          console.log(`Found Dealer.com JSON data in script ${i} with pattern`);
          return jsonData;
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    // Also look for JSON-LD with Dealer.com specific data
    if (content.includes('"@type":"Car"') || content.includes('"@type":"Vehicle"')) {
      try {
        const jsonLd = JSON.parse(content);
        if (jsonLd['@type'] === 'Car' || jsonLd['@type'] === 'Vehicle') {
          console.log(`Found JSON-LD vehicle data in script ${i}`);
          return jsonLd;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // Look for any script containing large amounts of vehicle data
    if (content.includes('"vin"') && content.includes('"make"') && content.includes('"model"') && content.length > 1000) {
      console.log(`Found potential vehicle data in script ${i} (${content.length} chars)`);
      // Try to extract JSON from this script
      try {
        // Look for JSON objects in the script
        const jsonMatches = content.match(/\{[^{}]*"vin"[^{}]*\}/g);
        if (jsonMatches && jsonMatches.length > 0) {
          for (const match of jsonMatches) {
            try {
              const jsonData = JSON.parse(match);
              if (jsonData.vin) {
                console.log(`Successfully parsed vehicle JSON from script ${i}`);
                return jsonData;
              }
            } catch (e) {
              // Continue to next match
            }
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }

  return null;
}

function extractJsonLdData($: cheerio.CheerioAPI): any {
  const jsonLdScripts = $('script[type="application/ld+json"]');

  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonLd = JSON.parse($(jsonLdScripts[i]).html() || '{}');

      if (jsonLd['@type'] === 'Car' || jsonLd['@type'] === 'Vehicle') {
        return jsonLd;
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  return null;
}

function extractHtmlData($: cheerio.CheerioAPI, baseUrl: string): any {
  // Extract vehicle data from HTML elements as fallback
  const data: any = {};

  // Extract VIN
  data.vin = $('[data-vin]').attr('data-vin') ||
    $('.vin').text().trim() ||
    $('.vehicle-vin').text().trim();

  // Extract stock number
  data.stock_number = $('[data-stock]').attr('data-stock') ||
    $('.stock').text().trim() ||
    $('.stock-number').text().trim();

  // Extract basic info
  data.year = parseInt($('.year, .vehicle-year').text().trim()) || undefined;
  data.make = $('.make, .vehicle-make').text().trim() || undefined;
  data.model = $('.model, .vehicle-model').text().trim() || undefined;
  data.trim = $('.trim, .vehicle-trim').text().trim() || undefined;

  // Extract price
  const priceText = $('.price, .vehicle-price, .msrp').text().trim();
  if (priceText) {
    const priceMatch = priceText.match(/[\d,]+/);
    if (priceMatch) {
      data.price = parseInt(priceMatch[0].replace(/,/g, ''));
    }
  }

  // Extract mileage
  const mileageText = $('.mileage, .miles, .odometer').text().trim();
  if (mileageText) {
    const mileageMatch = mileageText.match(/[\d,]+/);
    if (mileageMatch) {
      data.mileage = parseInt(mileageMatch[0].replace(/,/g, ''));
    }
  }

  // Extract images
  const images: Array<{ url: string }> = [];
  $('img').each((i: number, img: any) => {
    const src = $(img).attr('src');
    if (src) {
      const fullUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
      images.push({ url: fullUrl });
    }
  });
  data.images = images;

  return Object.keys(data).length > 0 ? data : null;
}

function normalizeDealerComVehicle(data: any): ScrapedVehicle | null {
  try {
    // Handle different Dealer.com JSON structures
    let vehicleData = data;

    // If it's an array, take the first vehicle
    if (Array.isArray(data)) {
      vehicleData = data[0];
    }

    // If it has an inventory property, extract from there
    if (data.inventory && Array.isArray(data.inventory)) {
      vehicleData = data.inventory[0];
    }

    // If it has a vehicles property, extract from there
    if (data.vehicles && Array.isArray(data.vehicles)) {
      vehicleData = data.vehicles[0];
    }

    if (!vehicleData) return null;

    return {
      vin: vehicleData.vin || vehicleData.vehicleIdentificationNumber,
      stock_number: vehicleData.stockNumber || vehicleData.stock_number,
      year: vehicleData.year,
      make: vehicleData.make,
      model: vehicleData.model,
      trim: vehicleData.trim,
      price: vehicleData.internetPrice || vehicleData.price,
      msrp: vehicleData.msrp,
      mileage: vehicleData.mileage,
      color_ext: vehicleData.exteriorColor || vehicleData.extColor || vehicleData.color_ext,
      color_int: vehicleData.interiorColor || vehicleData.intColor || vehicleData.color_int,
      body_style: vehicleData.bodyStyle || vehicleData.body_style,
      transmission: vehicleData.transmission,
      fuel_type: vehicleData.fuelType || vehicleData.fuel_type,
      drivetrain: vehicleData.driveLine,
      dealer_page_url: vehicleData.dealerurl,
      description: vehicleData.comments || vehicleData.description,
      images: vehicleData.images,
      incentives: vehicleData.incentives,
      certified: vehicleData.certified,
      condition: vehicleData.condition || 'New',
      availability_status: vehicleData.status === 'In Stock' ? 'In Stock' : 'Out of Stock'
    };
  } catch (e) {
    return null;
  }
}

function normalizeJsonLdVehicle(jsonLd: any): ScrapedVehicle | null {
  try {
    const vin = jsonLd.vehicleIdentificationNumber ||
      jsonLd.vin ||
      jsonLd.identifier?.find((id: any) => id['@type'] === 'PropertyValue' && id.name === 'VIN')?.value;

    if (!vin) return null;

    return {
      vin: String(vin).toUpperCase(),
      year: jsonLd.modelDate || jsonLd.year,
      make: jsonLd.brand?.name || jsonLd.brand || jsonLd.make,
      model: jsonLd.model || jsonLd.vehicleModel,
      trim: jsonLd.trim || jsonLd.vehicleTrim,
      price: jsonLd.offers?.price || jsonLd.price,
      mileage: jsonLd.mileageFromOdometer?.value || jsonLd.mileage,
      color_ext: jsonLd.color,
      color_int: jsonLd.interiorColor,
      body_style: jsonLd.bodyType || jsonLd.vehicleBodyType,
      transmission: jsonLd.vehicleTransmission,
      fuel_type: jsonLd.fuelType,
      images: Array.isArray(jsonLd.image) ? jsonLd.image : jsonLd.image ? [jsonLd.image] : [],
      features: jsonLd.additionalProperty?.map((prop: any) => prop.name) || [],
      availability_status: jsonLd.offers?.availability,
      description: jsonLd.description,
      raw: jsonLd
    };
  } catch (e) {
    return null;
  }
}

function normalizeHtmlVehicle(data: any): ScrapedVehicle | null {
  try {
    if (!data.vin) return null;

    return {
      vin: data.vin,
      stock_number: data.stock_number,
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      price: data.price,
      mileage: data.mileage,
      images: data.images,
      raw: data
    };
  } catch (e) {
    return null;
  }
}

async function updateVehiclesWithScrapedData(
  supabase: any,
  dealerId: string,
  results: ScrapedResult[],
  logFunction: (level: string, message: string, data?: any) => void
): Promise<number> {
  let updatedCount = 0;

  for (const result of results) {
    if (!result.vehicle || !result.vehicle.vin) continue;

    try {
      // Update vehicle with scraped data using upsert - only update columns that exist in the database
      const updateData: any = {
        vin: result.vehicle.vin,
        dealer_id: dealerId,
        updated_at: new Date().toISOString()
      };

      // Map all available fields to standardized database columns
      if (result.vehicle.stock_number) updateData.stock_number = result.vehicle.stock_number;
      if (result.vehicle.msrp) updateData.msrp = result.vehicle.msrp;
      if (result.vehicle.price) updateData.price = result.vehicle.price;
      if (result.vehicle.color_ext) updateData.color_ext = result.vehicle.color_ext;
      if (result.vehicle.color_int) updateData.color_int = result.vehicle.color_int;
      if (result.vehicle.mileage) updateData.mileage = result.vehicle.mileage;
      if (result.vehicle.description) updateData.description = result.vehicle.description;
      if (result.vehicle.fuel_type) updateData.fuel_type = result.vehicle.fuel_type;
      if (result.vehicle.transmission) updateData.transmission = result.vehicle.transmission;
      if (result.vehicle.drivetrain) updateData.drivetrain = result.vehicle.drivetrain;
      if (result.vehicle.body_style) updateData.body_style = result.vehicle.body_style;
      if (result.vehicle.engine_size) updateData.engine_size = result.vehicle.engine_size;
      if (result.vehicle.engine_cylinder_count) updateData.engine_cylinder_count = result.vehicle.engine_cylinder_count;
      if (result.vehicle.engine_specification) updateData.engine_specification = result.vehicle.engine_specification;
      if (result.vehicle.city_mpg) updateData.city_mpg = result.vehicle.city_mpg;
      if (result.vehicle.highway_mpg) updateData.highway_mpg = result.vehicle.highway_mpg;
      if (result.vehicle.combined_mpg) updateData.combined_mpg = result.vehicle.combined_mpg;
      if (result.vehicle.passenger_capacity) updateData.passenger_capacity = result.vehicle.passenger_capacity;
      if (result.vehicle.safety_features) updateData.safety_features = result.vehicle.safety_features;
      if (result.vehicle.technology_features) updateData.technology_features = result.vehicle.technology_features;
      if (result.vehicle.comfort_features) updateData.comfort_features = result.vehicle.comfort_features;
      if (result.vehicle.features) updateData.features = result.vehicle.features;
      if (result.vehicle.key_features) updateData.key_features = result.vehicle.key_features;
      if (result.vehicle.certified) updateData.certified = result.vehicle.certified;
      if (result.vehicle.condition) updateData.condition = result.vehicle.condition;
      if (result.vehicle.availability_status) updateData.availability_status = result.vehicle.availability_status;
      if (result.vehicle.vehicle_category) updateData.vehicle_category = result.vehicle.vehicle_category;
      if (result.vehicle.offsite_location) updateData.offsite_location = result.vehicle.offsite_location;
      if (result.vehicle.factory_options) updateData.factory_options = result.vehicle.factory_options;
      if (result.vehicle.option_packages) updateData.option_packages = result.vehicle.option_packages;
      if (result.vehicle.video_links) updateData.video_links = result.vehicle.video_links;
      if (result.vehicle.dealer_highlights) updateData.dealer_highlights = result.vehicle.dealer_highlights;
      if (result.vehicle.action_buttons) updateData.action_buttons = result.vehicle.action_buttons;
      if (result.vehicle.monthly_payment) updateData.monthly_payment = result.vehicle.monthly_payment;
      if (result.vehicle.down_payment) updateData.down_payment = result.vehicle.down_payment;
      if (result.vehicle.financing_available) updateData.financing_available = result.vehicle.financing_available;
      if (result.vehicle.warranty_details) updateData.warranty_details = result.vehicle.warranty_details;
      if (result.vehicle.carfax_report_url) updateData.carfax_report_url = result.vehicle.carfax_report_url;
      if (result.vehicle.days_in_inventory) updateData.days_in_inventory = result.vehicle.days_in_inventory;
      if (result.vehicle.expected_arrival_date) updateData.expected_arrival_date = result.vehicle.expected_arrival_date;
      if (result.vehicle.dealer_page_url) updateData.dealer_page_url = result.vehicle.dealer_page_url;
      if (result.vehicle.dealerslug) updateData.dealerslug = result.vehicle.dealerslug;
      if (result.vehicle.short_url) updateData.short_url = result.vehicle.short_url;
      if (result.vehicle.rebrandly_id) updateData.rebrandly_id = result.vehicle.rebrandly_id;
      if (result.vehicle.short_url_status) updateData.short_url_status = result.vehicle.short_url_status;
      if (result.vehicle.short_url_attempts) updateData.short_url_attempts = result.vehicle.short_url_attempts;
      if (result.vehicle.short_url_last_attempt) updateData.short_url_last_attempt = result.vehicle.short_url_last_attempt;
      if (result.vehicle.url_source) updateData.url_source = result.vehicle.url_source;
      if (result.vehicle.images) updateData.images = result.vehicle.images;
      if (result.vehicle.incentives) updateData.incentives = result.vehicle.incentives;
      if (result.vehicle.last_api_at) updateData.last_api_at = result.vehicle.last_api_at;
      if (result.vehicle.last_scrape_at) updateData.last_scrape_at = result.vehicle.last_scrape_at;
      if (result.vehicle.last_scrape_timestamp) updateData.last_scrape_timestamp = result.vehicle.last_scrape_timestamp;
      if (result.vehicle.source_priority) updateData.source_priority = result.vehicle.source_priority;
      if (result.vehicle.raw) updateData.raw = result.vehicle.raw;
      // Add last_scrape_at timestamp
      updateData.last_scrape_at = new Date().toISOString();

      const { error } = await supabase
        .from('vehicles')
        .upsert(updateData, {
          onConflict: 'dealer_id,vin',
          ignoreDuplicates: false
        });

      if (error) {
        logFunction('error', 'Failed to update vehicle with scraped data', {
          vin: result.vehicle.vin,
          error: error.message
        });
      } else {
        updatedCount++;
      }

    } catch (error: any) {
      logFunction('error', 'Error updating vehicle with scraped data', {
        vin: result.vehicle.vin,
        error: error.message
      });
    }
  }

  logFunction('info', 'Updated vehicles with scraped data', { updatedCount });
  return updatedCount;
}
