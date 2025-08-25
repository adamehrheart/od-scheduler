/**
 * Dealer Data Sources Configuration
 * 
 * This file manages which data sources are enabled and their priority.
 * We can switch between multi-source and Dealer.com-only approaches using environment variables.
 */

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
  primary: (process.env.PRIMARY_SOURCE as 'multi_source' | 'dealer_com_only') || 'multi_source',
  dealer_com_only: process.env.DEALER_COM_ONLY === 'true',
  enabled: {
    dealer_com: true, // Always enabled as primary or fallback
    homenet: process.env.ENABLE_HOMENET !== 'false',
    sitemap: process.env.ENABLE_SITEMAP !== 'false',
    scraping: process.env.ENABLE_SCRAPING !== 'false',
    url_shortening: process.env.ENABLE_URL_SHORTENING !== 'false'
  },
  pagination: {
    dealer_com_page_size: parseInt(process.env.DEALER_COM_PAGE_SIZE || '100'),
    max_pages: parseInt(process.env.DEALER_COM_MAX_PAGES || '10')
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
