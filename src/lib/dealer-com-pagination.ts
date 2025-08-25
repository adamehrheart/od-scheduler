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
  logFunction?: (level: string, message: string, data?: any) => void
): Promise<DealerComInventoryResponse> {
  const pageSize = config.pageSize || DEALER_SOURCES.pagination.dealer_com_page_size;

  const requestBody = {
    siteId: config.siteId,
    locale: "en_US",
    device: "DESKTOP",
    pageAlias: "INVENTORY_LISTING_DEFAULT_AUTO_ALL",
    pageId: "v9_INVENTORY_SEARCH_RESULTS_AUTO_ALL_V1_1",
    windowId: "inventory-data-bus2",
    widgetName: "ws-inv-data",
    inventoryParameters: {},
    preferences: {
      pageSize: pageSize.toString(),
      pageStart: pageStart.toString()
    },
    includePricing: true
  };

  logFunction?.('info', `Fetching Dealer.com page ${pageStart / pageSize + 1}`, {
    pageStart,
    pageSize,
    siteId: config.siteId
  });

  try {
    const response = await fetch(`${config.baseUrl}/api/widget/ws-inv-data/getInventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
 * Fetch all Dealer.com inventory using pagination
 */
export async function fetchAllDealerComInventory(
  config: DealerComPaginationConfig,
  logFunction?: (level: string, message: string, data?: any) => void
): Promise<DealerComVehicle[]> {
  const pageSize = config.pageSize || DEALER_SOURCES.pagination.dealer_com_page_size;
  const maxPages = config.maxPages || DEALER_SOURCES.pagination.max_pages;

  let allVehicles: DealerComVehicle[] = [];
  let pageStart = 0;
  let currentPage = 0;
  let totalCount: number | undefined;

  logFunction?.('info', 'Starting Dealer.com pagination', {
    pageSize,
    maxPages,
    siteId: config.siteId
  });

  try {
    do {
      currentPage++;

      if (currentPage > maxPages) {
        logFunction?.('warn', `Reached maximum pages limit (${maxPages})`, {
          totalVehicles: allVehicles.length,
          maxPages,
          siteId: config.siteId
        });
        break;
      }

      const response = await fetchDealerComPage(config, pageStart, logFunction);

      if (response.inventory && response.inventory.length > 0) {
        allVehicles.push(...response.inventory);

        // Update total count from first page
        if (currentPage === 1 && response.pageInfo?.totalCount) {
          totalCount = response.pageInfo.totalCount;
          logFunction?.('info', `Total inventory count: ${totalCount}`, { siteId: config.siteId });
        }
      }

      // Check if we've reached the total count or got less than a full page
      const hasMoreData = response.inventory && 
                         response.inventory.length === pageSize && 
                         allVehicles.length < (totalCount || Infinity);

      if (hasMoreData) {
        pageStart += pageSize;
        logFunction?.('info', `More data available, continuing to next page`, {
          currentPage,
          vehiclesSoFar: allVehicles.length,
          totalCount
        });
      } else {
        logFunction?.('info', `No more data available, pagination complete`, {
          currentPage,
          totalVehicles: allVehicles.length,
          totalCount
        });
        break;
      }

    } while (true);

    logFunction?.('info', 'Dealer.com pagination complete', {
      totalPages: currentPage,
      totalVehicles: allVehicles.length,
      expectedTotal: totalCount,
      siteId: config.siteId
    });

    return allVehicles;

  } catch (error) {
    logFunction?.('error', 'Dealer.com pagination failed', {
      error: error instanceof Error ? error.message : String(error),
      vehiclesRetrieved: allVehicles.length,
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
