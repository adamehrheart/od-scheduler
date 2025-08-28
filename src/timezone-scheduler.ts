import { logInfo, logError, logSuccess } from '@adamehrheart/utils'
import type { ScheduledJob } from './types.js'

// ============================================================================
// TIMEZONE-AWARE SCHEDULING TYPES
// ============================================================================

export interface DealerTimezoneConfig {
  dealerId: string
  dealerName: string
  timezone: string                    // IANA timezone (e.g., "America/New_York")
  preferredTime: string              // HH:MM format (e.g., "01:00")
  address?: string                   // For timezone detection if not explicit
  priority: 'premium' | 'standard' | 'economy'
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'ondemand'
}

export interface SmartScheduleResult {
  dealerId: string
  optimalRunTime: Date              // UTC time when job should run
  localRunTime: string             // Human-readable local time
  timezone: string
  priority: string
  estimatedFeedUpdate: string      // When dealer's feed likely updates
  processingWindow: {
    start: Date
    end: Date
    durationMinutes: number
  }
}

export interface TimezoneDistribution {
  timezone: string
  utcOffset: number
  dealerCount: number
  scheduleWindow: {
    start: string                   // UTC time like "05:30"
    end: string                     // UTC time like "06:30"
  }
}

// ============================================================================
// TIMEZONE MAPPING AND DETECTION
// ============================================================================

/**
 * Common US dealer timezone mappings
 * Most feeds update between 12:00 AM - 2:00 AM local time
 */
export const DEALER_TIMEZONE_MAP = {
  // US Timezones (most common)
  'America/New_York': { offset: -5, commonStates: ['NY', 'FL', 'GA', 'NC', 'SC', 'VA', 'MD', 'PA', 'NJ', 'CT', 'MA', 'VT', 'NH', 'ME', 'RI', 'DE', 'WV', 'OH', 'MI', 'IN', 'KY', 'TN'] },
  'America/Chicago': { offset: -6, commonStates: ['TX', 'IL', 'MO', 'WI', 'MN', 'IA', 'AR', 'LA', 'MS', 'AL', 'OK', 'KS', 'NE', 'ND', 'SD'] },
  'America/Denver': { offset: -7, commonStates: ['CO', 'WY', 'MT', 'UT', 'NM', 'AZ'] },
  'America/Los_Angeles': { offset: -8, commonStates: ['CA', 'NV', 'WA', 'OR'] },

  // Canada
  'America/Toronto': { offset: -5, commonStates: ['ON', 'QC'] },
  'America/Winnipeg': { offset: -6, commonStates: ['MB', 'SK'] },
  'America/Edmonton': { offset: -7, commonStates: ['AB', 'NT'] },
  'America/Vancouver': { offset: -8, commonStates: ['BC', 'YT'] },
  'America/Halifax': { offset: -4, commonStates: ['NS', 'NB', 'PE', 'NL'] },
} as const

/**
 * Optimal feed processing windows
 * Based on when dealer inventory feeds typically update
 */
export const FEED_UPDATE_WINDOWS = {
  'midnight_plus_30': { localTime: '00:30', description: 'Most common - 30 min after midnight' },
  'midnight_plus_60': { localTime: '01:00', description: 'Standard - 1 hour after midnight' },
  'midnight_plus_90': { localTime: '01:30', description: 'Conservative - 1.5 hours after midnight' },
  'early_morning': { localTime: '02:00', description: 'Early morning fallback' },
} as const

// ============================================================================
// TIMEZONE-AWARE SCHEDULING ENGINE
// ============================================================================

export class TimezoneAwareScheduler {

  /**
   * Detect timezone from dealer address
   */
  static detectTimezoneFromAddress(address: string): string {
    if (!address) return 'America/New_York' // Default to Eastern

    const upperAddress = address.toUpperCase()

    // State-based detection
    for (const [timezone, config] of Object.entries(DEALER_TIMEZONE_MAP)) {
      for (const state of config.commonStates) {
        if (upperAddress.includes(state) || upperAddress.includes(`, ${state} `) || upperAddress.includes(` ${state},`)) {
          logInfo(`Detected timezone ${timezone} for address containing state: ${state}`)
          return timezone
        }
      }
    }

    // City-based detection for major metros
    const cityTimezones = {
      'NEW YORK': 'America/New_York',
      'CHICAGO': 'America/Chicago',
      'DENVER': 'America/Denver',
      'LOS ANGELES': 'America/Los_Angeles',
      'SEATTLE': 'America/Los_Angeles',
      'MIAMI': 'America/New_York',
      'HOUSTON': 'America/Chicago',
      'PHOENIX': 'America/Denver',
      'TORONTO': 'America/Toronto',
      'VANCOUVER': 'America/Vancouver',
    }

    for (const [city, timezone] of Object.entries(cityTimezones)) {
      if (upperAddress.includes(city)) {
        logInfo(`Detected timezone ${timezone} for address containing city: ${city}`)
        return timezone
      }
    }

    logInfo(`Could not detect timezone from address: ${address}, defaulting to America/New_York`)
    return 'America/New_York' // Default fallback
  }

  /**
   * Calculate optimal run time for a dealer based on their timezone and feed update patterns
   */
  static calculateOptimalRunTime(config: DealerTimezoneConfig, targetDate?: Date): SmartScheduleResult {
    const today = targetDate || new Date()
    const dealerTimezone = config.timezone

    // Use preferred time or default to 30 minutes after midnight
    const preferredLocalTime = config.preferredTime || '00:30'
    const [hours, minutes] = preferredLocalTime.split(':').map(Number)

    // Create target date in dealer's timezone
    // We'll calculate when their "preferred time" occurs in UTC
    const localTargetTime = new Date(today)
    localTargetTime.setHours(hours, minutes, 0, 0)

    // Convert to UTC based on timezone offset
    const timezoneInfo = DEALER_TIMEZONE_MAP[dealerTimezone as keyof typeof DEALER_TIMEZONE_MAP]
    let utcOffset: number
    if (!timezoneInfo) {
      logError(`Unknown timezone: ${dealerTimezone}, using default offset`)
      // Fallback to Eastern time offset
      utcOffset = -5
    } else {
      utcOffset = timezoneInfo.offset
    }

    // Adjust for UTC (note: offset is negative for US timezones)
    const utcRunTime = new Date(localTargetTime)
    utcRunTime.setUTCHours(utcRunTime.getUTCHours() - utcOffset)

    // Create processing window (30 minutes for processing)
    const windowStart = new Date(utcRunTime)
    const windowEnd = new Date(utcRunTime.getTime() + (30 * 60 * 1000)) // 30 minutes later

    const result: SmartScheduleResult = {
      dealerId: config.dealerId,
      optimalRunTime: utcRunTime,
      localRunTime: `${preferredLocalTime} ${dealerTimezone}`,
      timezone: dealerTimezone,
      priority: config.priority,
      estimatedFeedUpdate: '00:00', // Midnight local time
      processingWindow: {
        start: windowStart,
        end: windowEnd,
        durationMinutes: 30
      }
    }

    logInfo(`Calculated optimal run time for dealer ${config.dealerName}`, {
      dealerId: config.dealerId,
      localTime: result.localRunTime,
      utcTime: utcRunTime.toISOString(),
      timezone: dealerTimezone
    })

    return result
  }

  /**
   * Calculate timezone distribution across all dealers
   */
  static calculateTimezoneDistribution(dealers: DealerTimezoneConfig[]): TimezoneDistribution[] {
    const distribution = new Map<string, TimezoneDistribution>()

    for (const dealer of dealers) {
      const timezone = dealer.timezone
      const timezoneInfo = DEALER_TIMEZONE_MAP[timezone as keyof typeof DEALER_TIMEZONE_MAP]
      const utcOffset = timezoneInfo?.offset || -5

      if (!distribution.has(timezone)) {
        // Calculate when "01:00 local" occurs in UTC
        const sampleLocalTime = new Date()
        sampleLocalTime.setUTCHours(1 - utcOffset, 0, 0, 0) // 1 AM local = ? UTC

        const startHour = String(sampleLocalTime.getUTCHours()).padStart(2, '0')
        const endHour = String((sampleLocalTime.getUTCHours() + 1) % 24).padStart(2, '0')

        distribution.set(timezone, {
          timezone,
          utcOffset,
          dealerCount: 0,
          scheduleWindow: {
            start: `${startHour}:00`,
            end: `${endHour}:00`
          }
        })
      }

      const entry = distribution.get(timezone)!
      entry.dealerCount++
    }

    const result = Array.from(distribution.values()).sort((a, b) => a.utcOffset - b.utcOffset)

    logSuccess(`Calculated timezone distribution for ${dealers.length} dealers across ${result.length} timezones`)
    result.forEach(tz => {
      logInfo(`${tz.timezone}: ${tz.dealerCount} dealers, processing window ${tz.scheduleWindow.start}-${tz.scheduleWindow.end} UTC`)
    })

    return result
  }

  /**
   * Generate optimal schedule for all dealers with staggered timing
   */
  static generateOptimalSchedule(dealers: DealerTimezoneConfig[], targetDate?: Date): SmartScheduleResult[] {
    const schedules: SmartScheduleResult[] = []

    // Group dealers by timezone for efficient processing
    const dealersByTimezone = new Map<string, DealerTimezoneConfig[]>()

    for (const dealer of dealers) {
      const timezone = dealer.timezone
      if (!dealersByTimezone.has(timezone)) {
        dealersByTimezone.set(timezone, [])
      }
      dealersByTimezone.get(timezone)!.push(dealer)
    }

    // Calculate schedules for each timezone group
    for (const [timezone, timezoneGroup] of dealersByTimezone) {
      logInfo(`Processing ${timezoneGroup.length} dealers in ${timezone}`)

      // Stagger dealers within the same timezone to avoid overload
      // Premium dealers get priority slots, standard dealers get later slots
      const premiumDealers = timezoneGroup.filter(d => d.priority === 'premium')
      const standardDealers = timezoneGroup.filter(d => d.priority === 'standard')
      const economyDealers = timezoneGroup.filter(d => d.priority === 'economy')

      let offsetMinutes = 0

      // Process premium dealers first (1:00 AM local)
      for (const dealer of premiumDealers) {
        const config = { ...dealer, preferredTime: '01:00' }
        const schedule = this.calculateOptimalRunTime(config, targetDate)

        // Add stagger offset
        schedule.optimalRunTime = new Date(schedule.optimalRunTime.getTime() + (offsetMinutes * 60 * 1000))

        schedules.push(schedule)
        offsetMinutes += 2 // 2-minute stagger for premium
      }

      offsetMinutes = 20 // 20-minute gap between tiers

      // Process standard dealers (1:20 AM local + stagger)
      for (const dealer of standardDealers) {
        const config = { ...dealer, preferredTime: '01:20' }
        const schedule = this.calculateOptimalRunTime(config, targetDate)

        schedule.optimalRunTime = new Date(schedule.optimalRunTime.getTime() + (offsetMinutes * 60 * 1000))

        schedules.push(schedule)
        offsetMinutes += 3 // 3-minute stagger for standard
      }

      offsetMinutes = 60 // 1-hour gap for economy

      // Process economy dealers (2:00 AM local + stagger)
      for (const dealer of economyDealers) {
        const config = { ...dealer, preferredTime: '02:00' }
        const schedule = this.calculateOptimalRunTime(config, targetDate)

        schedule.optimalRunTime = new Date(schedule.optimalRunTime.getTime() + (offsetMinutes * 60 * 1000))

        schedules.push(schedule)
        offsetMinutes += 5 // 5-minute stagger for economy
      }
    }

    // Sort all schedules by optimal run time
    schedules.sort((a, b) => a.optimalRunTime.getTime() - b.optimalRunTime.getTime())

    logSuccess(`Generated optimal schedule for ${schedules.length} dealers across ${dealersByTimezone.size} timezones`)

    return schedules
  }
}
