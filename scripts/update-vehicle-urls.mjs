import { createClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabaseUrl = process.env.OD_SUPABASE_URL
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function updateVehicleUrls() {
  try {
    console.log('🔄 Updating vehicle URLs from RSM Honda sitemap...')
    
    // Step 1: Get all vehicles with null dealerurls
    const { data: vehiclesWithNullUrls, error: fetchError } = await supabase
      .from('vehicles')
      .select('vin, year, make, model, trim')
      .eq('dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847')
      .is('dealerurl', null)
    
    if (fetchError) {
      throw new Error(`Failed to fetch vehicles: ${fetchError.message}`)
    }
    
    console.log(`📋 Found ${vehiclesWithNullUrls.length} vehicles with null dealerurls`)
    
    // Step 2: Fetch sitemap
    console.log('🗺️ Fetching RSM Honda sitemap...')
    const response = await fetch('https://www.rsmhondaonline.com/sitemap.xml')
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`)
    }
    
    const sitemapXml = await response.text()
    console.log(`✅ Sitemap fetched (${sitemapXml.length} bytes)`)
    
    // Step 3: Parse sitemap
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })
    const parsed = parser.parse(sitemapXml)
    
    if (!parsed.urlset?.url) {
      throw new Error('Invalid sitemap structure')
    }
    
    // Step 4: Extract vehicle detail URLs
    const vehicleUrls = parsed.urlset.url.filter(url => {
      return url.loc.includes('/new/Honda/') && url.loc.endsWith('.htm')
    })
    
    console.log(`🚗 Found ${vehicleUrls.length} vehicle URLs in sitemap`)
    
    // Step 5: Create a mapping of vehicle details to URLs
    const urlMapping = new Map()
    
    for (const urlData of vehicleUrls) {
      const url = urlData.loc
      const urlParts = url.split('/')
      const filename = urlParts[urlParts.length - 1]
      
      // Extract year, make, model from URL
      // Example: "2025-Honda-CR-V-396b2014ac181b197fa0dda54ce7bcb3.htm"
      const filenameParts = filename.split('-')
      if (filenameParts.length >= 4) {
        const year = filenameParts[0]
        const make = filenameParts[1]
        const model = filenameParts[2]
        const trim = filenameParts[3] || ''
        
        const key = `${year}-${make}-${model}-${trim}`.toLowerCase()
        urlMapping.set(key, url)
      }
    }
    
    console.log(`🗂️ Created URL mapping with ${urlMapping.size} entries`)
    
    // Step 6: Update vehicles with matching URLs
    let updatedCount = 0
    let urlShorteningJobs = []
    
    for (const vehicle of vehiclesWithNullUrls) {
      // Create a key to match against the URL mapping
      const vehicleKey = `${vehicle.year}-${vehicle.make}-${vehicle.model}-${vehicle.trim || ''}`.toLowerCase()
      
      const matchingUrl = urlMapping.get(vehicleKey)
      
      if (matchingUrl) {
        console.log(`✅ Found URL for ${vehicle.vin}: ${vehicleKey} -> ${matchingUrl}`)
        
        // Update vehicle with the URL
        const { error: updateError } = await supabase
          .from('vehicles')
          .update({ 
            dealerurl: matchingUrl,
            short_url_status: 'pending',
            short_url_attempts: 0,
            short_url_last_attempt: null
          })
          .eq('vin', vehicle.vin)
          .eq('dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847')
        
        if (updateError) {
          console.error(`❌ Failed to update vehicle ${vehicle.vin}:`, updateError.message)
          continue
        }
        
        updatedCount++
        
        // Create URL shortening job
        urlShorteningJobs.push({
          job_type: 'url_shortening',
          status: 'pending',
          attempts: 0,
          max_attempts: 3,
          payload: {
            dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847',
            vin: vehicle.vin,
            dealerurl: matchingUrl,
            utm: {
              dealerId: '5eb88852-0caa-5656-8a7b-aab53e5b1847',
              vin: vehicle.vin,
              medium: 'LLM',
              source: 'sitemap_update'
            }
          },
          created_at: new Date().toISOString(),
          scheduled_at: new Date().toISOString()
        })
      } else {
        console.log(`❌ No URL found for ${vehicle.vin}: ${vehicleKey}`)
      }
    }
    
    // Step 7: Create URL shortening jobs
    if (urlShorteningJobs.length > 0) {
      const { error: jobError } = await supabase
        .from('job_queue')
        .insert(urlShorteningJobs)
      
      if (jobError) {
        console.error('❌ Failed to create URL shortening jobs:', jobError.message)
      } else {
        console.log(`✅ Created ${urlShorteningJobs.length} URL shortening jobs`)
      }
    }
    
    console.log(`\n🎉 Vehicle URL update completed!`)
    console.log(`   - Vehicles processed: ${vehiclesWithNullUrls.length}`)
    console.log(`   - Vehicles updated: ${updatedCount}`)
    console.log(`   - URL shortening jobs created: ${urlShorteningJobs.length}`)
    
    return {
      success: true,
      vehiclesProcessed: vehiclesWithNullUrls.length,
      vehiclesUpdated: updatedCount,
      jobsCreated: urlShorteningJobs.length
    }
    
  } catch (error) {
    console.error('❌ Error updating vehicle URLs:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

updateVehicleUrls()
