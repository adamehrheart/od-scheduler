/**
 * Dealer Data Sources Configuration
 * 
 * This file manages which data sources are enabled and their priority.
 * We can switch between multi-source and Dealer.com-only approaches using environment variables.
 */

import { env } from '../env.js';

export interface DealerSourceConfig {
  primary: 'multi_source' | 'dealer_com_only';
  dealer_com_only: boolean;
  enabled: {
    dealer_com: boolean;
    homenet: boolean;
    sitemap: boolean;
    scraping: boolean;
    url_shortening: boolean;
  };
  pagination: {
    dealer_com_page_size: number;
    max_pages: number;
  };
}

export const DEALER_SOURCES: DealerSourceConfig = {
  primary: env.PRIMARY_SOURCE,
  dealer_com_only: env.DEALER_COM_ONLY,
  enabled: {
    dealer_com: true, // Always enabled as primary or fallback
    homenet: env.ENABLE_HOMENET,
    sitemap: env.ENABLE_SITEMAP,
    scraping: env.ENABLE_SCRAPING,
    url_shortening: env.ENABLE_URL_SHORTENING
  },
  pagination: {
    dealer_com_page_size: env.DEALER_COM_PAGE_SIZE,
    max_pages: env.DEALER_COM_MAX_PAGES
  }
};

/**
 * Check if we should use Dealer.com-only approach
 */
export function useDealerComOnly(): boolean {
  return DEALER_SOURCES.dealer_com_only || DEALER_SOURCES.primary === 'dealer_com_only';
}

/**
 * Check if a specific source is enabled
 */
export function isSourceEnabled(source: keyof DealerSourceConfig['enabled']): boolean {
  return DEALER_SOURCES.enabled[source];
}

/**
 * Get the current configuration for logging/debugging
 */
export function getCurrentConfig(): string {
  return JSON.stringify({
    primary: DEALER_SOURCES.primary,
    dealer_com_only: useDealerComOnly(),
    enabled_sources: Object.entries(DEALER_SOURCES.enabled)
      .filter(([_, enabled]) => enabled)
      .map(([source]) => source)
  }, null, 2);
}
