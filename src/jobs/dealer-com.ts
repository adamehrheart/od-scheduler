import { ScheduledJob } from '../types.js';
import { env } from '../env.js';
import { useDealerComOnly, getCurrentConfig } from '../config/dealer-sources.js';
import { fetchAllDealerComInventory, DealerComPaginationConfig, getPaginationStats } from '../lib/dealer-com-pagination.js';

export class DealerComJobRunner {
  private job: ScheduledJob;

  constructor(job: ScheduledJob) {
    this.job = job;
  }

  async execute(): Promise<any> {
    const startTime = Date.now();

    try {
      console.log('🚀 DealerComJobRunner: Starting with feature flags!');
      console.log('📋 Current configuration:', getCurrentConfig());

      // Get dealer information from the database
      const dealer = await this.getDealerInfo();
      if (!dealer) {
        throw new Error(`Dealer not found: ${this.job.dealer_id}`);
      }

      // Check if we should use Dealer.com-only approach
      if (useDealerComOnly()) {
        console.log('🎯 Using Dealer.com-only approach');
        return await this.executeDealerComOnly(dealer);
      } else {
        console.log('🔄 Using multi-source approach (existing logic)');
        return await this.executeMultiSource(dealer);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Dealer.com job failed:', {
        dealer_id: this.job.dealer_id,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration
      });
      throw error;
    }
  }

  /**
   * Execute Dealer.com-only approach with pagination
   */
  private async executeDealerComOnly(dealer: any): Promise<any> {
    const startTime = Date.now();

    try {
      console.log(`📡 Fetching all Dealer.com inventory for ${dealer.name} with pagination...`);

      // Configure Dealer.com pagination
      const config: DealerComPaginationConfig = {
        siteId: this.extractDealerComSiteId(dealer.domain),
        baseUrl: 'https://www.rsmhondaonline.com', // Use the same URL that works in multi-source approach
        pageSize: 100,
        maxPages: 10
      };

      // Fetch all vehicles using pagination
      const allVehicles = await fetchAllDealerComInventory(config, (level: string, message: string, data?: any) => {
        console.log(`[${level.toUpperCase()}] ${message}`, data);
      });

      // Transform and store vehicles
      const transformedVehicles = allVehicles.map((vehicle: any) => this.transformDealerComVehicle(vehicle));

      // Store vehicles in database
      const storedVehicles = await this.storeVehicles(transformedVehicles);

      const duration = Date.now() - startTime;
      const stats = getPaginationStats(allVehicles.length, config.pageSize || 100);

      console.log('🎉 Dealer.com-only approach completed successfully!', {
        dealer_id: this.job.dealer_id,
        dealer_name: dealer.name,
        total_vehicles: allVehicles.length,
        stored_vehicles: storedVehicles.length,
        pagination_stats: stats,
        duration_ms: duration
      });

      return {
        success: true,
        approach: 'dealer_com_only',
        total_vehicles: allVehicles.length,
        stored_vehicles: storedVehicles.length,
        pagination_stats: stats,
        duration_ms: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Dealer.com-only approach failed:', {
        dealer_id: this.job.dealer_id,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration
      });
      throw error;
    }
  }

  /**
   * Execute multi-source approach (existing logic)
   */
  private async executeMultiSource(dealer: any): Promise<any> {
    const startTime = Date.now();

    try {
      console.log(`📡 Calling Dealer.com Master Inventory API for ${dealer.name}...`);

      // Call the REVOLUTIONARY Dealer.com Master Inventory API
      const dealerComData = await this.callDealerComMasterInventoryAPI(dealer);

      // Get existing vehicles for this dealer
      const existingVehicles = await this.getExistingVehicles();
      if (existingVehicles.length === 0) {
        console.log('ℹ️ No existing vehicles found for dealer, skipping Dealer.com enrichment');
        return {
          success: true,
          vehicles_found: 0,
          vehicles_updated: 0,
          message: 'No existing vehicles to enrich'
        };
      }

      // Match VINs and create enriched data
      const enrichedVehicles = await this.matchAndEnrichVehicles(dealerComData, existingVehicles);

      // Update vehicles with enriched data
      const updateResults = await this.updateVehiclesWithEnrichedData(enrichedVehicles);

      const duration = Date.now() - startTime;

      console.log('🎉 Dealer.com Master Inventory API job completed successfully!', {
        dealer_id: this.job.dealer_id,
        dealer_name: dealer.name,
        dealer_com_vehicles: dealerComData.length,
        home_net_vehicles: existingVehicles.length,
        matched_vehicles: enrichedVehicles.length,
        vehicles_updated: updateResults.updated,
        match_rate: `${((enrichedVehicles.length / existingVehicles.length) * 100).toFixed(1)}%`,
        duration_ms: duration
      });

      return {
        success: true,
        dealer_com_vehicles: dealerComData.length,
        home_net_vehicles: existingVehicles.length,
        matched_vehicles: enrichedVehicles.length,
        vehicles_updated: updateResults.updated,
        match_rate: `${((enrichedVehicles.length / existingVehicles.length) * 100).toFixed(1)}%`,
        duration_ms: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Multi-source approach failed:', {
        dealer_id: this.job.dealer_id,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration
      });
      throw error;
    }
  }

  /**
   * 🚀 REVOLUTIONARY: Call Dealer.com Master Inventory API with OPTIMAL APPROACH
   * This gets ALL vehicle data using the PERFECT endpoint discovered!
   */
  private async callDealerComMasterInventoryAPI(dealer: any): Promise<any[]> {
    try {
      // Extract site ID from dealer domain
      const siteId = this.extractDealerComSiteId(dealer.domain);

      console.log(`📡 Calling Dealer.com Master Inventory API with OPTIMAL approach for site ID: ${siteId}`);

      // Use the PERFECT endpoint discovered from the search pages
      const optimalVehicles = await this.tryOptimalEndpoint(siteId);

      if (optimalVehicles.length >= 100) {
        console.log(`🎉 OPTIMAL endpoint successful! Found ${optimalVehicles.length} vehicles`);
        return optimalVehicles;
      }

      // Fallback to hybrid approach if optimal endpoint doesn't work
      console.log(`⚠️ OPTIMAL endpoint only returned ${optimalVehicles.length} vehicles, falling back to hybrid approach`);
      return await this.tryHybridApproach(siteId);

    } catch (error) {
      console.error('❌ Dealer.com Master Inventory API call failed:', error);
      throw error;
    }
  }

  /**
   * Try the OPTIMAL endpoint discovered from search pages
   */
  private async tryOptimalEndpoint(siteId: string): Promise<any[]> {
    console.log(`📡 Trying OPTIMAL endpoint with large page size...`);

    try {
      const response = await fetch('https://www.rsmhondaonline.com/api/widget/ws-inv-data/getInventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: siteId,
          locale: 'en_US',
          device: 'DESKTOP',
          pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_ALL',
          pageId: 'v9_INVENTORY_SEARCH_RESULTS_AUTO_ALL_V1_1',
          windowId: 'inventory-data-bus2',
          widgetName: 'ws-inv-data',
          inventoryParameters: {
            defaultRange: '5'
          },
          preferences: {
            pageSize: '120',
            rows: '120'  // Solr-specific parameter discovered from Porsche site
          },
          includePricing: true
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch optimal endpoint: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (data.pageInfo) {
        console.log(`📊 Optimal endpoint info: totalCount=${data.pageInfo.totalCount}, pageSize=${data.pageInfo.pageSize}`);
      }

      if (data.inventory && Array.isArray(data.inventory)) {
        console.log(`✅ Optimal endpoint: ${data.inventory.length} vehicles`);
        return data.inventory.map((vehicle: any) => this.transformDealerComVehicle(vehicle));
      } else {
        console.log(`⚠️ No inventory data found in optimal endpoint`);
        return [];
      }

    } catch (error) {
      console.log(`⚠️ Error fetching optimal endpoint:`, error);
      return [];
    }
  }

  /**
   * Fallback to hybrid approach (MASTER + multi-inventory)
   */
  private async tryHybridApproach(siteId: string): Promise<any[]> {
    console.log(`📡 Falling back to hybrid approach...`);

    // Try MASTER endpoint first
    const masterVehicles = await this.tryMasterEndpoint(siteId);

    if (masterVehicles.length >= 80) {
      console.log(`📊 MASTER endpoint returned ${masterVehicles.length} vehicles`);
      return masterVehicles;
    }

    // Fallback to multi-inventory approach
    console.log(`📡 MASTER endpoint insufficient, trying multi-inventory approach...`);
    return await this.tryMultiInventoryApproach(siteId);
  }

  /**
   * Try the MASTER endpoint with pagination
   */
  private async tryMasterEndpoint(siteId: string): Promise<any[]> {
    const masterEndpoint = {
      name: 'MASTER',
      pageAlias: 'INVENTORY_LISTING_DEFAULT',
      pageId: `${siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_V1_1`
    };

    const allVehicles: any[] = [];
    let totalCount = 0;
    let pageSize = 0;

    // Fetch first page to get pagination info
    try {
      console.log(`📡 Fetching MASTER inventory page 0...`);

      const firstPageResponse = await fetch('https://www.rsmhondaonline.com/api/widget/ws-inv-data/getInventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: siteId,
          locale: 'en_US',
          device: 'DESKTOP',
          pageAlias: masterEndpoint.pageAlias,
          pageId: masterEndpoint.pageId,
          windowId: 'inventory-data-bus2',
          widgetName: 'ws-inv-data',
          inventoryParameters: {},
          includePricing: true
        })
      });

      if (!firstPageResponse.ok) {
        throw new Error(`Failed to fetch first page: ${firstPageResponse.status} ${firstPageResponse.statusText}`);
      }

      const firstPageData = await firstPageResponse.json() as any;

      if (firstPageData.pageInfo) {
        totalCount = firstPageData.pageInfo.totalCount || 0;
        pageSize = firstPageData.pageInfo.pageSize || 35;
        console.log(`📊 Pagination info: totalCount=${totalCount}, pageSize=${pageSize}`);
      }

      if (firstPageData.inventory && Array.isArray(firstPageData.inventory)) {
        console.log(`✅ First page: ${firstPageData.inventory.length} vehicles`);
        allVehicles.push(...firstPageData.inventory);
      }

    } catch (error) {
      console.log(`⚠️ Error fetching first page:`, error);
      return allVehicles;
    }

    // Try to fetch additional pages (but don't fail if pagination doesn't work)
    if (totalCount > pageSize) {
      const totalPages = Math.ceil(totalCount / pageSize);
      console.log(`📄 Attempting to fetch ${totalPages - 1} additional pages...`);

      for (let page = 1; page < totalPages; page++) {
        const pageStart = page * pageSize;

        try {
          console.log(`📡 Fetching MASTER inventory page ${page} (start: ${pageStart})...`);

          const response = await fetch('https://www.rsmhondaonline.com/api/widget/ws-inv-data/getInventory', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              siteId: siteId,
              locale: 'en_US',
              device: 'DESKTOP',
              pageAlias: masterEndpoint.pageAlias,
              pageId: masterEndpoint.pageId,
              windowId: 'inventory-data-bus2',
              widgetName: 'ws-inv-data',
              inventoryParameters: {
                pageStart: pageStart
              },
              includePricing: true
            })
          });

          if (!response.ok) {
            console.log(`⚠️ Failed to fetch page ${page}: ${response.status} ${response.statusText}`);
            break; // Stop trying if pagination fails
          }

          const data = await response.json() as any;

          if (data.inventory && Array.isArray(data.inventory)) {
            console.log(`✅ Page ${page}: ${data.inventory.length} vehicles`);
            allVehicles.push(...data.inventory);
          } else {
            console.log(`⚠️ No inventory data found for page ${page}`);
            break;
          }

        } catch (error) {
          console.log(`⚠️ Error fetching page ${page}:`, error);
          break; // Stop trying if pagination fails
        }
      }
    }

    console.log(`📊 MASTER endpoint total: ${allVehicles.length} vehicles`);
    return allVehicles.map((vehicle: any) => this.transformDealerComVehicle(vehicle));
  }

  /**
   * Fallback to multi-inventory approach
   */
  private async tryMultiInventoryApproach(siteId: string): Promise<any[]> {
    console.log(`📡 Falling back to multi-inventory approach...`);

    // Define all inventory types to fetch
    const inventoryTypes = [
      {
        name: 'NEW',
        pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_NEW',
        pageId: `${siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_NEW_V1_1`
      },
      {
        name: 'USED',
        pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_USED',
        pageId: `${siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_USED_V1_1`
      },
      {
        name: 'CERTIFIED',
        pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_CERTIFIED',
        pageId: `${siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_CERTIFIED_V1_1`
      }
    ];

    const allVehicles: any[] = [];

    // Fetch each inventory type
    for (const inventoryType of inventoryTypes) {
      try {
        console.log(`📡 Fetching ${inventoryType.name} inventory...`);

        const response = await fetch('https://www.rsmhondaonline.com/api/widget/ws-inv-data/getInventory', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            siteId: siteId,
            locale: 'en_US',
            device: 'DESKTOP',
            pageAlias: inventoryType.pageAlias,
            pageId: inventoryType.pageId,
            windowId: 'inventory-data-bus2',
            widgetName: 'ws-inv-data',
            inventoryParameters: {},
            includePricing: true
          })
        });

        if (!response.ok) {
          console.log(`⚠️ Failed to fetch ${inventoryType.name} inventory: ${response.status} ${response.statusText}`);
          continue;
        }

        const data = await response.json() as any;

        if (data.inventory && Array.isArray(data.inventory)) {
          console.log(`✅ ${inventoryType.name} inventory: ${data.inventory.length} vehicles`);
          allVehicles.push(...data.inventory);
        } else {
          console.log(`⚠️ No inventory data found for ${inventoryType.name}`);
        }

      } catch (error) {
        console.log(`⚠️ Error fetching ${inventoryType.name} inventory:`, error);
      }
    }

    console.log(`📊 Multi-inventory approach total: ${allVehicles.length} vehicles`);
    return allVehicles.map((vehicle: any) => this.transformDealerComVehicle(vehicle));
  }

  /**
   * Extract Dealer.com site ID from dealer domain
   * This maps dealer domains to their Dealer.com site IDs
   */
  private extractDealerComSiteId(domain: string): string {
    // Map of known dealer domains to their Dealer.com site IDs
    const dealerSiteIdMap: { [key: string]: string } = {
      'rsmhondaonline.com': 'ranchosan29961santamargaritaparkway',
      // Add more dealers as we discover them
    };

    // Try exact match first
    if (dealerSiteIdMap[domain]) {
      return dealerSiteIdMap[domain];
    }

    // Try partial match
    for (const [dealerDomain, siteId] of Object.entries(dealerSiteIdMap)) {
      if (domain.includes(dealerDomain) || dealerDomain.includes(domain)) {
        return siteId;
      }
    }

    // Default to RSM Honda for now (we'll expand this)
    console.log(`⚠️ No site ID mapping found for domain: ${domain}, using default`);
    return 'ranchosan29961santamargaritaparkway';
  }

  /**
   * Transform Dealer.com vehicle data to our format
   * This extracts all the rich data from the Dealer.com API response
   */
  private transformDealerComVehicle(vehicle: any): any {
    return {
      vin: vehicle.vin,
      dealer_page_url: `https://www.rsmhondaonline.com${vehicle.link}`,

      // 🎯 CRITICAL FIELDS (previously NULL from HomeNet)
      transmission: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'transmission')?.value || null,
      drivetrain: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'driveLine')?.value || null,
      body_style: vehicle.bodyStyle || null,

      // Vehicle details
      stock_number: vehicle.stockNumber || null,
      year: vehicle.year || null,
      make: vehicle.make || null,
      model: vehicle.model || null,
      trim: vehicle.trim || null,
      fuel_type: vehicle.fuelType || null,

      // Performance and efficiency
      mileage: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'odometer')?.value || null,
      city_mpg: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'cityFuelEconomy')?.value || null,
      highway_mpg: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'highwayFuelEconomy')?.value || null,
      combined_mpg: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'combinedFuelEfficiency')?.value || null,

      // Colors
      exterior_color: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'exteriorColor')?.value || null,
      interior_color: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'interiorColor')?.value || null,

      // Engine
      engine: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'engine')?.value || null,
      engine_size: vehicle.trackingAttributes?.find((attr: any) => attr.name === 'engineSize')?.value || null,

      // Pricing
      msrp: vehicle.trackingPricing?.msrp || null,
      internet_price: vehicle.trackingPricing?.internetPrice || null,

      // Media
      images: vehicle.images?.map((img: any) => img.uri) || [],

      // Equipment and specifications
      equipment: vehicle.equipment || [],

      // Incentives
      incentives: vehicle.incentiveIds || [],

      // Additional metadata
      uuid: vehicle.uuid || null,
      chrome_id: vehicle.chromeId || null,
      model_code: vehicle.modelCode || null,
      inventory_date: vehicle.inventoryDate || null,
      off_site: vehicle.offSite || false,
      status: vehicle.status || null,
      type: vehicle.type || null
    };
  }

  /**
   * Match VINs between Dealer.com data and HomeNet vehicles
   * This is the key to 100% accurate data enrichment
   */
  private async matchAndEnrichVehicles(dealerComVehicles: any[], existingVehicles: any[]): Promise<any[]> {
    console.log(`🎯 Matching VINs: ${dealerComVehicles.length} Dealer.com vehicles vs ${existingVehicles.length} HomeNet vehicles`);

    // Create a map of VIN to Dealer.com data for fast lookup
    const dealerComMap = new Map();
    dealerComVehicles.forEach(vehicle => {
      if (vehicle.vin) {
        dealerComMap.set(vehicle.vin, vehicle);
      }
    });

    const enrichedVehicles = [];
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const existingVehicle of existingVehicles) {
      const dealerComData = dealerComMap.get(existingVehicle.vin);

      if (dealerComData) {
        matchedCount++;
        enrichedVehicles.push({
          ...existingVehicle,
          ...dealerComData,
          // Preserve existing HomeNet data that Dealer.com doesn't have
          description: existingVehicle.description,
          mileage: existingVehicle.mileage || dealerComData.mileage,
          price: existingVehicle.price || dealerComData.internet_price
        });

        console.log(`✅ Matched: ${existingVehicle.vin} - ${existingVehicle.year} ${existingVehicle.make} ${existingVehicle.model}`);
      } else {
        unmatchedCount++;
        console.log(`❌ Unmatched: ${existingVehicle.vin} - ${existingVehicle.year} ${existingVehicle.make} ${existingVehicle.model}`);
      }
    }

    console.log(`📊 VIN Matching Results: ${matchedCount} matched, ${unmatchedCount} unmatched (${((matchedCount / existingVehicles.length) * 100).toFixed(1)}% success rate)`);

    return enrichedVehicles;
  }

  private async getDealerInfo(): Promise<any> {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

    const { data, error } = await supabase
      .from('dealers')
      .select('*')
      .eq('id', this.job.dealer_id)
      .single();

    if (error) {
      throw new Error(`Failed to get dealer info: ${error.message}`);
    }

    return data;
  }

  private async getExistingVehicles(): Promise<any[]> {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('dealer_id', this.job.dealer_id);

    if (error) {
      throw new Error(`Failed to get existing vehicles: ${error.message}`);
    }

    return data || [];
  }

  private async updateVehiclesWithEnrichedData(enrichedVehicles: any[]): Promise<{ updated: number }> {
    if (enrichedVehicles.length === 0) {
      return { updated: 0 };
    }

    console.log(`🔄 Updating ${enrichedVehicles.length} vehicles with REVOLUTIONARY Dealer.com data...`);

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

    let updatedCount = 0;

    for (const enrichedVehicle of enrichedVehicles) {
      try {
        console.log(`  🔄 Updating vehicle ${enrichedVehicle.vin} with rich Dealer.com data...`);

        // Update vehicle with REVOLUTIONARY Dealer.com data
        const updateData = {
          // 🎯 CRITICAL FIELDS (previously NULL from HomeNet)
          transmission: enrichedVehicle.transmission || null,
          drivetrain: enrichedVehicle.drivetrain || null,
          body_style: enrichedVehicle.body_style || null,

          // Dealer.com specific data
          dealer_page_url: enrichedVehicle.dealer_page_url || null,
          stock_number: enrichedVehicle.stock_number || null,
          fuel_type: enrichedVehicle.fuel_type || null,

          // Performance and efficiency (from Dealer.com)
          city_mpg: enrichedVehicle.city_mpg ? Math.round(parseFloat(enrichedVehicle.city_mpg)) : null,
          highway_mpg: enrichedVehicle.highway_mpg ? Math.round(parseFloat(enrichedVehicle.highway_mpg)) : null,
          combined_mpg: enrichedVehicle.combined_mpg ? Math.round(parseFloat(enrichedVehicle.combined_mpg)) : null,

          // Engine (from Dealer.com)
          engine_size: enrichedVehicle.engine_size || null,

          // Pricing (from Dealer.com) - convert formatted strings to numbers
          msrp: enrichedVehicle.msrp ? parseInt(enrichedVehicle.msrp.replace(/[$,]/g, '')) : null,
          price: (enrichedVehicle.internet_price || enrichedVehicle.price) ? parseInt((enrichedVehicle.internet_price || enrichedVehicle.price).replace(/[$,]/g, '')) : null,

          // Update timestamp
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('vehicles')
          .update(updateData)
          .eq('dealer_id', this.job.dealer_id)
          .eq('vin', enrichedVehicle.vin);

        if (error) {
          console.log(`    ❌ Failed to update vehicle ${enrichedVehicle.vin}: `, error.message);
        } else {
          console.log(`    ✅ Successfully updated vehicle ${enrichedVehicle.vin} with REVOLUTIONARY data!`);
          console.log(`       Transmission: ${enrichedVehicle.transmission || 'NULL'} → ${updateData.transmission || 'NULL'}`);
          console.log(`       Drivetrain: ${enrichedVehicle.drivetrain || 'NULL'} → ${updateData.drivetrain || 'NULL'}`);
          console.log(`       Body Style: ${enrichedVehicle.body_style || 'NULL'} → ${updateData.body_style || 'NULL'}`);
          updatedCount++;
        }

      } catch (error) {
        console.log(`    ❌ Error updating vehicle ${enrichedVehicle.vin}: `, error instanceof Error ? error.message : String(error));
      }
    }

    console.log(`🎉 REVOLUTIONARY update complete: ${updatedCount}/${enrichedVehicles.length} vehicles updated with rich Dealer.com data!`);
    return { updated: updatedCount };
  }

  /**
   * Store vehicles directly from Dealer.com (Dealer.com-only approach)
   */
  private async storeVehicles(vehicles: any[]): Promise<any[]> {
    if (vehicles.length === 0) {
      return [];
    }

    console.log(`💾 Storing ${vehicles.length} vehicles from Dealer.com...`);

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

    let storedCount = 0;
    const storedVehicles = [];

    for (const vehicle of vehicles) {
      try {
        // Prepare vehicle data for storage (matching actual schema)
        const vehicleData = {
          vin: vehicle.vin,
          dealer_id: this.job.dealer_id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          trim: vehicle.trim,
          stock_number: vehicle.stock_number,
          transmission: vehicle.transmission,
          drivetrain: vehicle.drivetrain,
          body_style: vehicle.body_style,
          fuel_type: vehicle.fuel_type,
          mileage: vehicle.mileage,
          price: vehicle.price,
          color_ext: vehicle.exterior_color,
          color_int: vehicle.interior_color,
          images: vehicle.images,
          updated_at: new Date().toISOString()
        };

        // Use upsert to handle both insert and update
        const { data, error } = await supabase
          .from('vehicles')
          .upsert(vehicleData, {
            onConflict: 'dealer_id,vin',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (error) {
          console.log(`    ❌ Failed to store vehicle ${vehicle.vin}: `, error.message);
        } else {
          console.log(`    ✅ Successfully stored vehicle ${vehicle.vin}`);
          storedVehicles.push(data);
          storedCount++;
        }

      } catch (error) {
        console.log(`    ❌ Error storing vehicle ${vehicle.vin}: `, error instanceof Error ? error.message : String(error));
      }
    }

    console.log(`🎉 Storage complete: ${storedCount}/${vehicles.length} vehicles stored from Dealer.com!`);
    return storedVehicles;
  }
}
