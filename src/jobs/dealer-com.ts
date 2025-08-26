import { ScheduledJob } from '../types.js';
import { env } from '../env.js';
import { useDealerComOnly, getCurrentConfig } from '../config/dealer-sources.js';
import { fetchAllDealerComInventory, DealerComPaginationConfig, getPaginationStats } from '../lib/dealer-com-pagination.js';
import { createSupabaseClientFromEnv, logInfo, logError, logSuccess } from '@adamehrheart/utils';

export class DealerComJobRunner {
  private job: ScheduledJob;

  constructor(job: ScheduledJob) {
    this.job = job;
  }

  async execute(): Promise<any> {
    const startTime = Date.now();

    try {
      logInfo('DealerComJobRunner: Starting with feature flags');
      logInfo('Current configuration', getCurrentConfig());

      // Get dealer information from the database
      const dealer = await this.getDealerInfo();
      if (!dealer) {
        throw new Error(`Dealer not found: ${this.job.dealer_id}`);
      }

      // Check if we should use Dealer.com-only approach
      if (useDealerComOnly()) {
        logInfo('Using Dealer.com-only approach');
        return await this.executeDealerComOnly(dealer);
      } else {
        logInfo('Using multi-source approach (existing logic)');
        return await this.executeMultiSource(dealer);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Dealer.com job failed', {
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
      const paginationResult = await fetchAllDealerComInventory(config, (level: string, message: string, data?: any) => {
        console.log(`[${level.toUpperCase()}] ${message}`, data);
      });

      const allVehicles = paginationResult.vehicles;
      const actualTotalCount = paginationResult.totalCount;

      // Transform and store vehicles
      const transformedVehicles = allVehicles.map((vehicle: any) => this.transformDealerComVehicle(vehicle));

      // Store vehicles in database
      const storedVehicles = await this.storeVehicles(transformedVehicles);

      const duration = Date.now() - startTime;
      const stats = getPaginationStats(allVehicles.length, config.pageSize || 100, actualTotalCount);

      console.log('🎉 Dealer.com-only approach completed successfully!', {
        dealer_id: this.job.dealer_id,
        dealer_name: dealer.name,
        actual_total_count: actualTotalCount,
        fetched_vehicles: allVehicles.length,
        stored_vehicles: storedVehicles.length,
        pagination_stats: stats,
        duration_ms: duration
      });

      return {
        success: true,
        approach: 'dealer_com_only',
        actual_total_count: actualTotalCount,
        fetched_vehicles: allVehicles.length,
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
 * This extracts ALL the rich data from the Dealer.com API response
 */
  private transformDealerComVehicle(vehicle: any): any {
    // Helper function to extract tracking attribute
    const getTrackingAttr = (name: string) => {
      return vehicle.trackingAttributes?.find((attr: any) => attr.name === name)?.value || null;
    };

    // Helper function to extract equipment by category
    const getEquipmentByCategory = (category: string) => {
      const categoryData = vehicle.equipment?.find((eq: any) => eq.category === category);
      return categoryData?.specifications?.map((spec: any) => spec.description) || null;
    };

    // Build description from title and key attributes
    const description = [
      vehicle.title?.join(' '),
      vehicle.trim,
      vehicle.trackingAttributes?.find((attr: any) => attr.name === 'engine')?.value,
      vehicle.trackingAttributes?.find((attr: any) => attr.name === 'transmission')?.value
    ].filter(Boolean).join(' - ');

    return {
      // Core vehicle identification
      vin: vehicle.vin,
      stock_number: vehicle.stockNumber || null,
      year: vehicle.year || null,
      make: vehicle.make || null,
      model: vehicle.model || null,
      trim: vehicle.trim || null,

      // Rich description
      description: description,

      // Pricing & Financial - Enhanced mapping from raw pricing data
      price: this.extractPrice(vehicle.pricing),
      msrp: this.extractMSRP(vehicle.pricing),

      // Dealer information
      dealer_page_url: `https://www.rsmhondaonline.com${vehicle.link}`,

      // Vehicle condition & status
      condition: vehicle.condition || null,
      availability_status: vehicle.status || null,
      certified: vehicle.certified || false,

      // Performance & efficiency
      mileage: getTrackingAttr('odometer') ? parseInt(getTrackingAttr('odometer').replace(/[,\s]/g, '')) : null,
      city_mpg: getTrackingAttr('cityFuelEconomy') ? Math.round(parseFloat(getTrackingAttr('cityFuelEconomy'))) : null,
      highway_mpg: getTrackingAttr('highwayFuelEconomy') ? Math.round(parseFloat(getTrackingAttr('highwayFuelEconomy'))) : null,
      combined_mpg: this.calculateCombinedMPG(getTrackingAttr('cityFuelEconomy'), getTrackingAttr('highwayFuelEconomy')),

      // Engine & drivetrain
      engine_size: getTrackingAttr('engineSize'),
      engine_cylinder_count: this.extractCylinderCount(getTrackingAttr('engine')),
      engine_specification: getTrackingAttr('engine'),
      transmission: getTrackingAttr('transmission'),
      drivetrain: getTrackingAttr('driveLine'),

      // Body & styling
      body_style: vehicle.bodyStyle || null,
      fuel_type: vehicle.fuelType || null,
      color_ext: getTrackingAttr('exteriorColor'),
      color_int: getTrackingAttr('interiorColor'),

      // Features & specifications (arrays as per schema)
      features: vehicle.equipment?.map((eq: any) => eq.category) || null,
      safety_features: getEquipmentByCategory('Safety and Security'),
      technology_features: getEquipmentByCategory('Entertainment Features'),
      comfort_features: getEquipmentByCategory('Convenience Features'),

      // Passenger & cargo
      passenger_capacity: getTrackingAttr('maxSeatingCapacity') ? parseInt(getTrackingAttr('maxSeatingCapacity')) : 5,

      // Incentives & packages (arrays as per schema)
      incentives: this.extractIncentives(vehicle.pricing) || vehicle.packages || null,
      factory_options: vehicle.packages || null,
      option_packages: vehicle.packages || null,

      // Financial information (not available in Dealer.com API)
      monthly_payment: null, // Not provided by Dealer.com
      down_payment: null, // Not provided by Dealer.com
      financing_available: null, // Not provided by Dealer.com

      // Media & links (arrays as per schema)
      images: vehicle.images?.map((img: any) => ({ url: img.uri, alt: img.alt, title: img.title, id: img.id })) || null,
      video_links: vehicle.videoLinks || null,

      // Carfax & reports
      carfax_report_url: vehicle.callout?.find((c: any) => c.badgeClasses?.includes('carfax'))?.href || null,

      // Inventory tracking
      days_in_inventory: vehicle.inventoryDate ? this.calculateDaysInInventory(vehicle.inventoryDate) : null,
      expected_arrival_date: vehicle.expectedArrivalDate || null,
      offsite_location: vehicle.offSite || false,

      // Additional metadata (arrays as per schema)
      vehicle_category: vehicle.classification || null,
      dealer_highlights: this.extractDealerHighlights(vehicle),
      key_features: vehicle.highlightedAttributes?.map((attr: any) => attr.labeledValue) || null,

      // Raw data for debugging
      raw: vehicle,

      // Source tracking
      source_priority: 1, // 1 = dealer_com (highest priority)
      url_source: 'api-indirect' // We're using Dealer.com API indirectly
    };
  }

  /**
   * Calculate days in inventory from inventory date
   */
  private calculateDaysInInventory(inventoryDate: string): number | null {
    try {
      const [month, day, year] = inventoryDate.split('/');
      const inventoryDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - inventoryDateTime.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch (error) {
      return null;
    }
  }

  /**
 * Extract cylinder count from engine description
 */
  private extractCylinderCount(engineDescription: string | null): number | null {
    if (!engineDescription) return null;

    // If it's just a number (like "4"), return it directly
    if (/^\d+$/.test(engineDescription)) {
      return parseInt(engineDescription);
    }

    // Match patterns like "2L i-4", "V6", "4-Cylinder", "I4", etc.
    const patterns = [
      /(\d+)-Cylinder/i,
      /i-(\d+)/i,
      /I(\d+)/i,  // Match "I4", "I6", etc.
      /V(\d+)/i,
      /(\d+)L.*i-(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = engineDescription.match(pattern);
      if (match) {
        return parseInt(match[1] || match[2]);
      }
    }

    return null;
  }

  /**
   * Extract sale price from Dealer.com pricing data
   */
  private extractPrice(pricing: any): number | null {
    if (!pricing?.dprice) return null;

    // Look for internet price or sale price first
    const internetPrice = pricing.dprice.find((p: any) => p.typeClass === 'internetPrice');
    if (internetPrice?.value) {
      return parseInt(internetPrice.value.replace(/[$,]/g, ''));
    }

    // For new vehicles, use retail price if no internet price
    if (pricing.retailPrice) {
      return parseInt(pricing.retailPrice.replace(/[$,]/g, ''));
    }

    return null;
  }

  /**
   * Extract MSRP from Dealer.com pricing data
   */
  private extractMSRP(pricing: any): number | null {
    if (!pricing?.dprice) return null;

    // Look for MSRP in dprice array
    const msrpPrice = pricing.dprice.find((p: any) => p.typeClass === 'msrp');
    if (msrpPrice?.value) {
      return parseInt(msrpPrice.value.replace(/[$,]/g, ''));
    }

    return null;
  }

  /**
 * Extract incentives from Dealer.com pricing data
 */
  private extractIncentives(pricing: any): string[] | null {
    if (!pricing?.dprice) return null;

    const incentives: string[] = [];

    // Extract conditional offers and other incentives
    pricing.dprice.forEach((p: any) => {
      if (p.type === 'SICCI' && p.label && p.value) {
        incentives.push(`${p.label}: ${p.value}`);
      }
    });

    return incentives.length > 0 ? incentives : null;
  }

  /**
   * Calculate combined MPG from city and highway MPG
   */
  private calculateCombinedMPG(cityMPG: string | null, highwayMPG: string | null): number | null {
    if (!cityMPG || !highwayMPG) return null;

    const city = parseFloat(cityMPG);
    const highway = parseFloat(highwayMPG);

    if (isNaN(city) || isNaN(highway)) return null;

    // EPA formula: 55% city, 45% highway
    return Math.round((city * 0.55) + (highway * 0.45));
  }

  /**
   * Extract dealer highlights from vehicle data
   */
  private extractDealerHighlights(vehicle: any): string[] | null {
    const highlights: string[] = [];

    // Featured promotion
    if (vehicle.featuredPromotion) {
      highlights.push('Featured Vehicle');
    }

    // Spotlighted vehicle
    if (vehicle.spotlightedVehicle) {
      highlights.push('Spotlighted Vehicle');
    }

    // New car boost
    if (vehicle.newCarBoost || vehicle.isNewCarBoost) {
      highlights.push('New Car Boost');
    }

    // Callouts (like Carfax badges)
    if (vehicle.callout?.length > 0) {
      vehicle.callout.forEach((callout: any) => {
        if (callout.badgeClasses?.includes('carfax')) {
          highlights.push('Carfax Report Available');
        }
      });
    }

    return highlights.length > 0 ? highlights : null;
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
    const supabase = createSupabaseClientFromEnv();

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
    const supabase = createSupabaseClientFromEnv();

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

    const supabase = createSupabaseClientFromEnv();

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

    const supabase = createSupabaseClientFromEnv();

    let storedCount = 0;
    const storedVehicles = [];

    for (const vehicle of vehicles) {
      try {
        // Prepare vehicle data for storage with fields that actually exist in the database
        const vehicleData = {
          // Core identification (these exist)
          vin: vehicle.vin,
          dealer_id: this.job.dealer_id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          trim: vehicle.trim,
          stock_number: vehicle.stock_number,

          // Basic fields that exist
          price: vehicle.price,
          mileage: vehicle.mileage,
          color_ext: vehicle.color_ext,
          color_int: vehicle.color_int,
          body_style: vehicle.body_style,
          drivetrain: vehicle.drivetrain,
          transmission: vehicle.transmission,
          fuel_type: vehicle.fuel_type,
          images: vehicle.images,

          // Fields that exist in the database
          features: vehicle.features,
          source_priority: vehicle.source_priority,
          raw: vehicle.raw,
          url_source: vehicle.url_source,
          msrp: vehicle.msrp,
          description: vehicle.description,
          dealerslug: vehicle.dealerslug,
          condition: vehicle.condition,
          availability_status: vehicle.availability_status,
          certified: vehicle.certified,
          city_mpg: vehicle.city_mpg,
          highway_mpg: vehicle.highway_mpg,
          combined_mpg: vehicle.combined_mpg,
          engine_size: vehicle.engine_size,
          engine_cylinder_count: vehicle.engine_cylinder_count,
          engine_specification: vehicle.engine_specification,
          passenger_capacity: vehicle.passenger_capacity,
          incentives: vehicle.incentives,
          safety_features: vehicle.safety_features,
          technology_features: vehicle.technology_features,
          comfort_features: vehicle.comfort_features,
          vehicle_category: vehicle.vehicle_category,
          factory_options: vehicle.factory_options,
          option_packages: vehicle.option_packages,
          video_links: vehicle.video_links,
          dealer_highlights: vehicle.dealer_highlights,
          key_features: vehicle.key_features,
          carfax_report_url: vehicle.carfax_report_url,
          days_in_inventory: vehicle.days_in_inventory,
          expected_arrival_date: vehicle.expected_arrival_date,
          dealer_page_url: vehicle.dealer_page_url,

          // Update timestamp
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
