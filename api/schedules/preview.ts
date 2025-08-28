import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSupabaseClientFromEnv, logInfo, logError } from '@adamehrheart/utils'
import { TimezoneAwareScheduler, type DealerTimezoneConfig } from '../../src/timezone-scheduler.js'

/**
 * Preview Timezone-Aware Schedule Endpoint
 *
 * This endpoint demonstrates the new timezone-aware scheduling system by:
 * - Fetching all active dealers with timezone information
 * - Calculating optimal run times based on their local timezone
 * - Showing the distribution of dealers across time zones
 * - Providing a preview of when each dealer's job would run
 *
 * GET /api/schedules/preview
 *
 * Query Parameters:
 * - date: Optional target date (YYYY-MM-DD format), defaults to today
 * - timezone: Optional filter to show only dealers in specific timezone
 * - priority: Optional filter by priority level (premium, standard, economy)
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    logInfo('Timezone-aware schedule preview requested')

    // Parse query parameters
    const targetDateParam = req.query.date as string
    const timezoneFilter = req.query.timezone as string
    const priorityFilter = req.query.priority as string

    // Parse target date or use today
    const targetDate = targetDateParam ? new Date(targetDateParam) : new Date()
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      })
    }

    // Get dealer data from Supabase
    const supabase = createSupabaseClientFromEnv()

    const { data: dealers, error } = await supabase
      .from('dealers')
      .select(`
        id,
        name,
        contact_address,
        sftp_config_schedule_timezone,
        sftp_config_schedule_preferred_time,
        sftp_config_schedule_frequency,
        status
      `)
      .eq('status', 'active')

    if (error) {
      throw new Error(`Failed to fetch dealers: ${error.message}`)
    }

    logInfo(`Fetched ${dealers.length} active dealers for schedule preview`)

    // Convert to dealer timezone configs
    const dealerConfigs: DealerTimezoneConfig[] = []

    for (const dealer of dealers) {
      // Detect timezone if not explicitly set
      let timezone = dealer.sftp_config_schedule_timezone
      if (!timezone && dealer.contact_address) {
        timezone = TimezoneAwareScheduler.detectTimezoneFromAddress(dealer.contact_address)
      }
      if (!timezone) {
        timezone = 'America/New_York' // Default fallback
      }

      // Apply filters
      if (timezoneFilter && timezone !== timezoneFilter) {
        continue
      }

      // Determine priority (for now, randomly assign for demo purposes)
      const priorities = ['premium', 'standard', 'economy'] as const
      const priority = priorities[Math.floor(Math.random() * priorities.length)]

      if (priorityFilter && priority !== priorityFilter) {
        continue
      }

      // Get frequency
      const frequency = dealer.sftp_config_schedule_frequency || 'daily'

      dealerConfigs.push({
        dealerId: dealer.id,
        dealerName: dealer.name,
        timezone,
        preferredTime: dealer.sftp_config_schedule_preferred_time || '01:00',
        address: dealer.contact_address,
        priority,
        frequency: frequency as any
      })
    }

    logInfo(`Processing ${dealerConfigs.length} dealers after filtering`)

    // Generate optimal schedules
    const schedules = TimezoneAwareScheduler.generateOptimalSchedule(dealerConfigs, targetDate)

    // Calculate timezone distribution
    const distribution = TimezoneAwareScheduler.calculateTimezoneDistribution(dealerConfigs)

    // Group schedules by hour for visualization
    const schedulesByHour = new Map<string, typeof schedules>()

    for (const schedule of schedules) {
      const hour = schedule.optimalRunTime.toISOString().substring(11, 16) // HH:MM format
      if (!schedulesByHour.has(hour)) {
        schedulesByHour.set(hour, [])
      }
      schedulesByHour.get(hour)!.push(schedule)
    }

    // Convert to array and sort by time
    const hourlySchedules = Array.from(schedulesByHour.entries())
      .map(([hour, dealers]) => ({
        utcTime: hour,
        dealerCount: dealers.length,
        dealers: dealers.map(d => ({
          id: d.dealerId,
          name: dealerConfigs.find(dc => dc.dealerId === d.dealerId)?.dealerName || 'Unknown',
          localTime: d.localRunTime,
          timezone: d.timezone,
          priority: d.priority
        }))
      }))
      .sort((a, b) => a.utcTime.localeCompare(b.utcTime))

    // Calculate summary statistics
    const summary = {
      totalDealers: dealerConfigs.length,
      datePreview: targetDate.toISOString().split('T')[0],
      timezonesRepresented: distribution.length,
      priorityDistribution: {
        premium: dealerConfigs.filter(d => d.priority === 'premium').length,
        standard: dealerConfigs.filter(d => d.priority === 'standard').length,
        economy: dealerConfigs.filter(d => d.priority === 'economy').length
      },
      processingWindow: {
        earliest: schedules[0]?.optimalRunTime.toISOString(),
        latest: schedules[schedules.length - 1]?.optimalRunTime.toISOString(),
        durationHours: schedules.length > 0 ?
          Math.round((schedules[schedules.length - 1].optimalRunTime.getTime() - schedules[0].optimalRunTime.getTime()) / (1000 * 60 * 60) * 10) / 10 : 0
      }
    }

    const response = {
      success: true,
      data: {
        summary,
        timezoneDistribution: distribution,
        hourlySchedules,
        individualSchedules: schedules.slice(0, 50), // Limit to first 50 for readability
        totalSchedules: schedules.length
      },
      message: schedules.length > 50 ?
        `Showing first 50 of ${schedules.length} schedules. Use filters to narrow results.` :
        `Generated ${schedules.length} optimal schedules`
    }

    res.status(200).json(response)

    logInfo('Schedule preview generated successfully', {
      totalDealers: summary.totalDealers,
      totalSchedules: schedules.length,
      timezones: distribution.length,
      processingDuration: summary.processingWindow.durationHours
    })

  } catch (error) {
    logError('Failed to generate schedule preview', error)

    res.status(500).json({
      success: false,
      error: 'Failed to generate schedule preview',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
