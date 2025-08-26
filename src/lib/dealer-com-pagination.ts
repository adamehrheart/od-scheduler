/**
 * Dealer.com Pagination Utility
 * 
 * Handles pagination for Dealer.com API calls to retrieve all vehicles
 * when inventory exceeds the single-page limit (~100 vehicles).
 */

import { DEALER_SOURCES } from '../config/dealer-sources.js';

export interface DealerComPaginationConfig {
  siteId: string;
  baseUrl: string;
  pageSize?: number;
  maxPages?: number;
  usePageNumber?: boolean; // fallback mode for rooftops that ignore pageStart offsets
}

export interface DealerComVehicle {
  vin: string;
  make: string;
  model: string;
  year: number;
  link: string;
  images?: Array<{ uri: string; alt?: string; title?: string }>;
  trackingAttributes?: Array<{ name: string; value: string }>;
  trackingPricing?: {
    internetPrice?: string;
    salePrice?: string;
    msrp?: string;
  };
  bodyStyle?: string;
  fuelType?: string;
  stockNumber?: string;
  certified?: boolean;
  condition?: string;
  [key: string]: any;
}

export interface DealerComInventoryResponse {
  inventory: DealerComVehicle[];
  pageInfo?: {
    totalCount?: number;
    pageSize?: number;
    pageStart?: number;
  };
  error?: string;
}

/**
 * Fetch a single page of Dealer.com inventory
 */
async function fetchDealerComPage(
  config: DealerComPaginationConfig,
  pageStart: number = 0,
  logFunction?: (level: string, message: string, data?: any) => void,
  sortDirection: 'ASC' | 'DESC' = 'ASC'
): Promise<DealerComInventoryResponse> {
  const pageSize = config.pageSize || DEALER_SOURCES.pagination.dealer_com_page_size;

  // Build request bodies per guidance (Widget variants with page/pageSize)
  const pageNumber = Math.floor(pageStart / pageSize) + 1;
  const widgetVariants = [
    {
      pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_NEW',
      pageId: `${config.siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_NEW_V1_1`
    },
    {
      pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_ALL',
      pageId: 'v9_INVENTORY_SEARCH_RESULTS_AUTO_ALL_V1_1'
    }
  ];
  const buildRequestBodyVariantA = (variant: { pageAlias: string; pageId: string }) => ({
    siteId: config.siteId,
    locale: 'en_US',
    device: 'DESKTOP',
    pageAlias: variant.pageAlias,
    pageId: variant.pageId,
    windowId: 'inventory-data-bus2',
    widgetName: 'ws-inv-data',
    includePricing: true,
    inventoryParameters: {
      page: pageNumber,
      pageSize: pageSize,
      sort: { field: 'vin', direction: sortDirection }
    }
  });
  // Fallback body using preferences.pageStart/pageSize (works on some rooftops)
  const buildRequestBodyWithPreferences = (variant: { pageAlias: string; pageId: string }) => ({
    siteId: config.siteId,
    locale: 'en_US',
    device: 'DESKTOP',
    pageAlias: variant.pageAlias,
    pageId: variant.pageId,
    windowId: 'inventory-data-bus2',
    widgetName: 'ws-inv-data',
    includePricing: true,
    inventoryParameters: {},
    preferences: {
      pageSize: pageSize.toString(),
      ...(config.usePageNumber
        ? { page: pageNumber.toString() }
        : { pageStart: pageStart.toString() })
    }
  });

  logFunction?.('info', `Fetching Dealer.com page ${pageStart / pageSize + 1}`, {
    pageStart,
    pageSize,
    siteId: config.siteId
  });

  try {
    const cacheBuster = Date.now();
    // Try variant A with NEW widget, then ALL, then fallback to preferences body
    const tryFetch = async (body: any) => fetch(`${config.baseUrl}/api/widget/ws-inv-data/getInventory?cb=${cacheBuster}&sort=${sortDirection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let response: Response | undefined;
    for (const w of widgetVariants) {
      const requestBodyVariantA = buildRequestBodyVariantA(w);
      response = await tryFetch(requestBodyVariantA);
      if (response && response.ok) break;
      logFunction?.('warn', 'Variant A failed for widget, trying preferences', { status: response ? response.status : undefined, widget: w.pageAlias });
      const requestBodyWithPreferences = buildRequestBodyWithPreferences(w);
      response = await tryFetch(requestBodyWithPreferences);
      if (response && response.ok) break;
    }
    if (!response || !response.ok) {
      const status = response ? response.status : 'no_response';
      const statusText = response ? response.statusText : 'no response received';
      throw new Error(`HTTP ${status}: ${statusText}`);
    }

    const data = await response.json() as DealerComInventoryResponse;

    if (data.error) {
      throw new Error(`Dealer.com API error: ${data.error}`);
    }

    logFunction?.('info', `Retrieved ${data.inventory?.length || 0} vehicles from page ${pageStart / pageSize + 1}`, {
      pageStart,
      pageSize,
      totalInPage: data.inventory?.length || 0,
      totalCount: data.pageInfo?.totalCount
    });

    return data;
  } catch (error) {
    logFunction?.('error', `Failed to fetch Dealer.com page ${pageStart / pageSize + 1}`, {
      error: error instanceof Error ? error.message : String(error),
      pageStart,
      pageSize,
      siteId: config.siteId
    });
    throw error;
  }
}

/**
 * Probe the maximum effective page size supported by the rooftop
 * Tries a list of candidates and returns the largest that the server respects
 */
async function probeMaxPageSize(
  baseConfig: DealerComPaginationConfig,
  candidates: number[],
  logFunction?: (level: string, message: string, data?: any) => void
): Promise<number> {
  for (const candidate of candidates) {
    const testConfig: DealerComPaginationConfig = { ...baseConfig, pageSize: candidate };
    try {
      const res = await fetchDealerComPage(testConfig, 0, logFunction);
      const len = res.inventory?.length || 0;
      logFunction?.('info', 'Probed page size candidate', { candidate, returned: len });
      if (len === candidate) {
        return candidate;
      }
      // If server caps at smaller number (e.g., 100 when asking 120), treat that as hard cap
      if (len > 0 && len < candidate) {
        return len;
      }
    } catch (e) {
      // Ignore and try next candidate
      logFunction?.('warn', 'Page size probe failed, trying next', { candidate });
    }
  }
  // Fallback to default
  return baseConfig.pageSize || DEALER_SOURCES.pagination.dealer_com_page_size;
}

/**
 * Fetch all Dealer.com inventory using pagination
 */
export async function fetchAllDealerComInventory(
  config: DealerComPaginationConfig,
  logFunction?: (level: string, message: string, data?: any) => void
): Promise<{ vehicles: DealerComVehicle[], totalCount: number }> {
  logFunction?.('info', 'Starting Dealer.com inventory fetch with multi-config strategy', {
    siteId: config.siteId
  });

  const seenVins = new Set<string>();
  const allVehicles: DealerComVehicle[] = [];
  let totalCount = 0;

  // Fetch different inventory segments
  const listingConfigs = ['auto-new', 'auto-certified', 'auto-used'];
  let grandTotalCount = 0;

  try {
    for (const listingConfigId of listingConfigs) {
      logFunction?.('info', `Fetching ${listingConfigId} inventory...`);

      const response = await fetchDealerComPageWithConfig(
        { ...config, pageSize: 200 },
        0,
        logFunction,
        'ASC',
        listingConfigId
      );

      const items = response.inventory || [];
      const segmentTotal = response.pageInfo?.totalCount || 0;
      let addedFromSegment = 0;

      for (const vehicle of items) {
        const vin = (vehicle as any).vin;
        if (vin && !seenVins.has(vin)) {
          seenVins.add(vin);
          allVehicles.push(vehicle);
          addedFromSegment++;
        }
      }

      logFunction?.('info', `${listingConfigId} segment complete`, {
        segmentVehicles: items.length,
        segmentTotal,
        addedFromSegment,
        totalAccumulated: allVehicles.length
      });

      grandTotalCount += segmentTotal;
    }

    logFunction?.('info', 'Dealer.com multi-config inventory fetch complete', {
      totalVehicles: allVehicles.length,
      grandTotalCount,
      coverage: `${((allVehicles.length / grandTotalCount) * 100).toFixed(1)}%`,
      siteId: config.siteId
    });

    return { vehicles: allVehicles, totalCount: grandTotalCount };
  } catch (error) {
    logFunction?.('error', 'Error fetching inventory', {
      error: error instanceof Error ? error.message : error,
      siteId: config.siteId
    });
    throw error;
  }
}

/**
 * Fetch Dealer.com inventory with specific listing config
 */
async function fetchDealerComPageWithConfig(
  config: DealerComPaginationConfig,
  pageStart: number = 0,
  logFunction?: (level: string, message: string, data?: any) => void,
  sortDirection: 'ASC' | 'DESC' = 'ASC',
  listingConfigId: string = 'auto-new'
): Promise<DealerComInventoryResponse> {
  const pageSize = config.pageSize || DEALER_SOURCES.pagination.dealer_com_page_size;

  // Build request body with specific listing config
  const pageNumber = Math.floor(pageStart / pageSize) + 1;
  const buildMultiConfigRequestBody = () => ({
    siteId: config.siteId,
    locale: 'en_US',
    device: 'DESKTOP',
    pageAlias: 'INVENTORY_LISTING_DEFAULT_AUTO_NEW',
    pageId: `${config.siteId}_SITEBUILDER_INVENTORY_SEARCH_RESULTS_AUTO_NEW_V1_1`,
    windowId: 'inventory-data-bus1',
    widgetName: 'ws-inv-data',
    includePricing: true,
    inventoryParameters: {},
    preferences: {
      pageSize: pageSize.toString(),
      "listing.config.id": listingConfigId,
      ...(config.usePageNumber
        ? { page: pageNumber.toString() }
        : { pageStart: pageStart.toString() })
    }
  });

  logFunction?.('info', `Fetching ${listingConfigId} page ${pageStart / pageSize + 1}`, {
    pageStart,
    pageSize,
    listingConfigId,
    siteId: config.siteId
  });

  try {
    const cacheBuster = Date.now();
    const url = `${config.baseUrl}/api/widget/ws-inv-data/getInventory?cb=${cacheBuster}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildMultiConfigRequestBody())
    });

    if (!response || !response.ok) {
      const status = response ? response.status : 'no_response';
      const statusText = response ? response.statusText : 'no response received';
      throw new Error(`HTTP ${status}: ${statusText}`);
    }

    const data = await response.json() as DealerComInventoryResponse;

    if (data.error) {
      throw new Error(`Dealer.com API error: ${data.error}`);
    }

    logFunction?.('info', `Retrieved ${data.inventory?.length || 0} ${listingConfigId} vehicles`, {
      pageStart,
      pageSize,
      listingConfigId,
      totalInPage: data.inventory?.length || 0,
      totalCount: data.pageInfo?.totalCount
    });

    return data;
  } catch (error) {
    logFunction?.('error', `Failed to fetch ${listingConfigId} page ${pageStart / pageSize + 1}`, {
      error: error instanceof Error ? error.message : String(error),
      pageStart,
      pageSize,
      listingConfigId,
      siteId: config.siteId
    });
    throw error;
  }
}

/**
 * Get pagination statistics for monitoring
 */
export function getPaginationStats(
  totalVehicles: number,
  pageSize: number,
  totalCount?: number
): {
  pages: number;
  efficiency: number;
  coverage: number;
} {
  const pages = Math.ceil(totalVehicles / pageSize);
  const efficiency = totalVehicles / (pages * pageSize);
  const coverage = totalCount ? (totalVehicles / totalCount) * 100 : 100;

  return {
    pages,
    efficiency: Math.round(efficiency * 100) / 100,
    coverage: Math.round(coverage * 100) / 100
  };
}
