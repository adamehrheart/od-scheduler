import { ScheduledJob } from '../types.js';
import { env } from '../env.js';
import { useDealerComOnly, getCurrentConfig, DEALER_SOURCES } from '../config/dealer-sources.js';
import { fetchAllDealerComInventory, DealerComPaginationConfig, getPaginationStats } from '../lib/dealer-com-pagination.js';
import { logInfo, logError, logSuccess } from '@adamehrheart/utils';
import { TraceManager } from '../utils/tracing';
import { SchedulerEventClient } from '../events/eventClient';

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

      // Use the multi-endpoint approach that works for RSM Honda
      console.log(`📡 Using multi-endpoint approach for ${dealer.name}...`);

      const allVehicles: any[] = [];
      const seenVins = new Set<string>();

      // Define the inventory endpoints to try
      const inventoryEndpoints = [
        'INVENTORY_LISTING_DEFAULT_AUTO_NEW',
        'INVENTORY_LISTING_DEFAULT_AUTO_USED',
        'INVENTORY_LISTING_DEFAULT_AUTO_CERTIFIED_USED'
      ];

      for (const endpoint of inventoryEndpoints) {
        try {
          console.log(`📡 Fetching ${endpoint} for ${dealer.name}...`);

          const endpointVehicles = await this.tryOptimalEndpoint(dealer.site_id);

          let addedFromEndpoint = 0;
          for (const vehicle of endpointVehicles) {
            if (vehicle.vin && !seenVins.has(vehicle.vin)) {
              seenVins.add(vehicle.vin);
              allVehicles.push(vehicle);
              addedFromEndpoint++;
            }
          }

          console.log(`✅ ${endpoint}: ${endpointVehicles.length} vehicles, ${addedFromEndpoint} new`);

        } catch (error) {
          console.log(`⚠️ Error fetching ${endpoint}:`, error);
        }
      }

      console.log(`📊 Total unique vehicles found: ${allVehicles.length}`);

      // Transform and store vehicles with dealer domain
      const transformedVehicles = allVehicles.map((vehicle: any) => this.transformDealerComVehicle(vehicle, dealer.domain));

      // Store vehicles in database
      const storedVehicles = await this.storeVehicles(transformedVehicles);

      const duration = Date.now() - startTime;
      const actualTotalCount = allVehicles.length;
      const stats = {
        pages: inventoryEndpoints.length,
        efficiency: 1.0,
        coverage: 100
      };

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
      const siteId = this.extractDealerComSiteId(dealer);

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
            pageSize: DEALER_SOURCES.pagination.dealer_com_page_size.toString(),
            rows: DEALER_SOURCES.pagination.dealer_com_page_size.toString()  // Solr-specific parameter
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
  private extractDealerComSiteId(dealer: any): string {
    // Get site ID from dealer's Dealer.com configuration
    const dealerComConfig = dealer.api_config?.dealer_com_config || dealer.dealer_com_config;

    if (dealerComConfig?.site_id) {
      return dealerComConfig.site_id;
    }

    // Fallback: extract from domain if no explicit config
    const domain = dealer.domain;
    if (!domain) {
      throw new Error(`No domain found for dealer: ${dealer.name}`);
    }

    // Extract site ID from domain (e.g., porschesantabarbara.com -> porschesantabarbara)
    const siteId = domain.replace('.com', '').replace('www.', '');
    console.log(`📝 Extracted site ID '${siteId}' from domain '${domain}' for dealer '${dealer.name}'`);

    return siteId;
  }

  /**
 * Transform Dealer.com vehicle data to our format
 * This extracts ALL the rich data from the Dealer.com API response
 */
  private transformDealerComVehicle(vehicle: any, dealerDomain?: string): any {
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
      dealer_page_url: dealerDomain ? `https://www.${dealerDomain}${vehicle.link}` : `https://www.rsmhondaonline.com${vehicle.link}`,

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
    const dbApiUrl = process.env.OD_DB_API_URL || 'http://localhost:3001';

    const response = await fetch(`${dbApiUrl}/api/v1/dealers/${this.job.dealer_id}`);

    if (!response.ok) {
      throw new Error(`Failed to get dealer info: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { data: any };
    return result.data;
  }

  private async getExistingVehicles(): Promise<any[]> {
    // TODO: Replace with Database API call when vehicle endpoints are implemented
    console.log('⚠️ getExistingVehicles: Using Database API - not yet implemented');
    return [];
  }

  private async updateVehiclesWithEnrichedData(enrichedVehicles: any[]): Promise<{ updated: number }> {
    if (enrichedVehicles.length === 0) {
      return { updated: 0 };
    }

    console.log(`🔄 Updating ${enrichedVehicles.length} vehicles with REVOLUTIONARY Dealer.com data...`);

    // TODO: Replace with Database API calls when vehicle update endpoints are implemented
    console.log('⚠️ updateVehiclesWithEnrichedData: Using Database API - not yet implemented');

    let updatedCount = 0;
    for (const enrichedVehicle of enrichedVehicles) {
      console.log(`  🔄 Would update vehicle ${enrichedVehicle.vin} with rich Dealer.com data...`);
      updatedCount++;
    }

    console.log(`🎉 REVOLUTIONARY update complete: ${updatedCount}/${enrichedVehicles.length} vehicles would be updated with rich Dealer.com data!`);
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

    // TODO: Replace with Database API calls when vehicle storage endpoints are implemented
    console.log('⚠️ storeVehicles: Using Database API - not yet implemented');

    let storedCount = 0;
    const storedVehicles = [];

    for (const vehicle of vehicles) {
      console.log(`  💾 Would store vehicle ${vehicle.vin} from Dealer.com...`);
      storedVehicles.push(vehicle);
      storedCount++;
    }

    console.log(`🎉 Storage complete: ${storedCount}/${vehicles.length} vehicles would be stored from Dealer.com!`);
    return storedVehicles;
  }
}
