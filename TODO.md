# Open Dealer Scheduler - TODO

## Current Work
- [x] URL shortening system with Rebrandly integration
- [x] Asynchronous job queue architecture
- [x] Sitemap processor for RSM Honda
- [ ] Fix job processing "Unknown error" issue
- [ ] **NEW: Investigate Dealer.com inventory feeds** - Verify if RSM Honda's detailed JSON inventory feed is available for all Dealer.com dealerships

## Next Steps
- [ ] Geocoding worker for dealers without location
- [ ] Data API: nearby search (lat,lng,radius) + distance in results
- [ ] Feeds/JSON-LD: offeredBy PostalAddress + GeoCoordinates
- [ ] Distribution: sitemaps per type + IndexNow pinger job
- [ ] Robots split: stack bots vs Google/Bing; add canonicals if needed
- [ ] Monitoring: queue depth/age tiles in CMS + bot logs dashboard

## Dealer.com Inventory Feed Investigation
- [ ] **Verify RSM Honda inventory feed**: Check if the detailed JSON feed we discovered is still available
- [ ] **Test other Dealer.com sites**: Verify if this feed architecture is consistent across all Dealer.com dealerships
- [ ] **Assess feed efficiency**: Compare single JSON feed vs individual product detail page scraping
- [ ] **Design async architecture**: If feed exists, create new batch process for inventory data ingestion
- [ ] **Fallback strategy**: If feed unavailable, enhance product detail page scraping with Dealer.com object extraction

## Architecture Enhancements
- [ ] **Primary**: Dealer.com inventory feed processor (if available)
- [ ] **Secondary**: Enhanced product detail page scraper with Dealer.com object extraction
- [ ] **Integration**: Connect inventory feed data with existing HomeNet data for comprehensive vehicle profiles
