import { NextRequest, NextResponse } from 'next/server'

/**
 * Vehicles API endpoint
 * Uses Database API Service for data access
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dealerId = searchParams.get('dealer_id')
  const platform = searchParams.get('platform')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    // CRITICAL: Test Database API Service connectivity (REQUIRED)
    const dbApiUrl = process.env.OD_DB_API_URL || 'http://localhost:3001'
    const response = await fetch(`${dbApiUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'CRITICAL: Database API Service unavailable',
          details: 'Vehicle data cannot be retrieved - Database API Service is down',
          data_sources: {
            database_api: {
              status: 'disconnected',
              url: dbApiUrl,
              purpose: 'Database API service for data access'
            }
          },
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      )
    }

    // Get real vehicle data from Database API Service
    const vehiclesResponse = await fetch(`${dbApiUrl}/api/v1/vehicles?dealer_id=${dealerId || ''}&limit=${limit}`)

    if (!vehiclesResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'CRITICAL: Failed to fetch vehicle data',
          details: `Database API error: ${vehiclesResponse.status} ${vehiclesResponse.statusText}`,
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      )
    }

    const vehiclesResult = await vehiclesResponse.json()
    const { vehicles, total } = (vehiclesResult as any)?.data || { vehicles: [], total: 0 }

    // Calculate statistics from real data
    const stats = {
      total_vehicles: total,
      total_dealers: vehicles.length > 0 ? new Set(vehicles.map((v: any) => v.dealer_id)).size : 0,
      platforms: vehicles.length > 0 ? Object.fromEntries(
        Object.entries(
          vehicles.reduce((acc: any, v: any) => {
            // Extract platform from dealer_id or use default
            const platform = v.dealer_id ? 'dealer.com' : 'unknown'
            acc[platform] = (acc[platform] || 0) + 1
            return acc
          }, {} as Record<string, number>)
        )
      ) : {},
      average_price: vehicles.length > 0
        ? Math.round(vehicles.reduce((sum: number, v: any) => sum + (parseFloat(v.price) || 0), 0) / vehicles.length)
        : 0,
      recent_updates: vehicles.filter((v: any) =>
        new Date(v.updated_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
      ).length
    }

    return NextResponse.json({
      success: true,
      data: {
        vehicles: vehicles.map((v: any) => ({
          id: v.id,
          dealer_id: v.dealer_id,
          dealer_name: `Dealer ${v.dealer_id?.slice(0, 8) || 'Unknown'}`,
          platform: 'dealer.com', // Default platform
          vin: v.vin,
          make: v.make,
          model: v.model,
          year: v.year,
          price: v.price,
          status: v.status,
          created_at: v.created_at,
          updated_at: v.updated_at,
          processing_history: [
            {
              timestamp: v.updated_at,
              action: 'ingested',
              changes: ['vehicle_data']
            }
          ]
        })),
        pagination: {
          total: total,
          limit: limit,
          returned: vehicles.length,
          has_more: total > vehicles.length
        },
        statistics: stats,
        filters: {
          dealer_id: dealerId,
          platform: platform,
          limit: limit
        }
      },
      source: 'database_api',
      message: 'Real vehicle data from Database API Service',
      data_sources: {
        database_api: {
          status: 'connected',
          url: dbApiUrl,
          purpose: 'Database API service for data access'
        }
      }
    })

  } catch (error) {
    console.error('Vehicles API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'CRITICAL: Failed to retrieve vehicles',
        details: error instanceof Error ? error.message : 'Unknown error',
        data_sources: {
          database_api: {
            status: 'error',
            url: process.env.OD_DB_API_URL || 'http://localhost:3001',
            purpose: 'Database API service for data access'
          }
        },
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
