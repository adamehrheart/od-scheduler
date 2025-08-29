import { Pool, PoolClient } from 'pg'

/**
 * PostgreSQL Database Client for Open Dealer Scheduler
 * Connects to local Docker PostgreSQL instances and DigitalOcean Managed PostgreSQL
 */

interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
}

class DatabaseManager {
  private static instance: DatabaseManager
  private pools: Map<string, Pool> = new Map()

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  /**
   * Get PostgreSQL connection pool for SFTPGo database (local Docker)
   */
  getSftpGoPool(): Pool {
    const poolKey = 'sftpgo'
    if (!this.pools.has(poolKey)) {
      const pool = new Pool({
        host: process.env.SFTPGO_DB_HOST || 'localhost',
        port: parseInt(process.env.SFTPGO_DB_PORT || '5433'),
        database: process.env.SFTPGO_DB_NAME || 'sftpgo',
        user: process.env.SFTPGO_DB_USER || 'sftpgo',
        password: process.env.SFTPGO_DB_PASSWORD || 'sftpgo',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
      this.pools.set(poolKey, pool)
    }
    return this.pools.get(poolKey)!
  }

  /**
   * Get PostgreSQL connection pool for main database (local Docker)
   */
  getMainPool(): Pool {
    const poolKey = 'main'
    if (!this.pools.has(poolKey)) {
      const pool = new Pool({
        host: process.env.MAIN_DB_HOST || 'localhost',
        port: parseInt(process.env.MAIN_DB_PORT || '5432'),
        database: process.env.MAIN_DB_NAME || 'postgres',
        user: process.env.MAIN_DB_USER || 'postgres',
        password: process.env.MAIN_DB_PASSWORD || 'postgres',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
      this.pools.set(poolKey, pool)
    }
    return this.pools.get(poolKey)!
  }

  /**
   * Get PostgreSQL connection pool for DigitalOcean Managed PostgreSQL
   */
  getDigitalOceanPool(): Pool {
    const poolKey = 'digitalocean'
    if (!this.pools.has(poolKey)) {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
      this.pools.set(poolKey, pool)
    }
    return this.pools.get(poolKey)!
  }

  /**
   * Test database connectivity
   */
  async testConnection(pool: Pool): Promise<boolean> {
    try {
      const client = await pool.connect()
      await client.query('SELECT 1')
      client.release()
      return true
    } catch (error) {
      console.error('Database connection test failed:', error)
      return false
    }
  }

  /**
   * Execute a query with error handling
   */
  async executeQuery<T = any>(
    pool: Pool,
    query: string,
    params: any[] = []
  ): Promise<{ data: T[] | null; error: string | null }> {
    try {
      const result = await pool.query(query, params)
      return { data: result.rows, error: null }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error'
      console.error('Database query error:', errorMessage)
      return { data: null, error: errorMessage }
    }
  }

  /**
   * Close all database connections
   */
  async closeAll(): Promise<void> {
    for (const [key, pool] of this.pools.entries()) {
      try {
        await pool.end()
        console.log(`Closed database pool: ${key}`)
      } catch (error) {
        console.error(`Error closing database pool ${key}:`, error)
      }
    }
    this.pools.clear()
  }
}

export const databaseManager = DatabaseManager.getInstance()

/**
 * Utility functions for common database operations
 */
export const databaseUtils = {
  /**
   * Execute a query with error handling
   */
  async executeQuery<T = any>(
    pool: Pool,
    query: string,
    params: any[] = []
  ): Promise<{ data: T[] | null; error: string | null }> {
    try {
      const result = await pool.query(query, params)
      return { data: result.rows, error: null }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error'
      console.error('Database query error:', errorMessage)
      return { data: null, error: errorMessage }
    }
  },

  /**
   * Get vehicle statistics from SFTPGo database
   */
  async getVehicleStats(): Promise<{
    total_vehicles: number
    total_dealers: number
    recent_updates: number
    average_price: number
  }> {
    const pool = databaseManager.getSftpGoPool()

    const statsQuery = `
      SELECT
        COUNT(*) as total_vehicles,
        COUNT(DISTINCT dealer_id) as total_dealers,
        COUNT(CASE WHEN updated_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_updates,
        AVG(price) as average_price
      FROM vehicles
      WHERE status = 'available'
    `

    const { data, error } = await this.executeQuery(pool, statsQuery)

    if (error || !data || data.length === 0) {
      return {
        total_vehicles: 0,
        total_dealers: 0,
        recent_updates: 0,
        average_price: 0
      }
    }

    const row = data[0]
    return {
      total_vehicles: parseInt(row.total_vehicles) || 0,
      total_dealers: parseInt(row.total_dealers) || 0,
      recent_updates: parseInt(row.recent_updates) || 0,
      average_price: parseFloat(row.average_price) || 0
    }
  },

  /**
   * Get vehicles with filtering
   */
  async getVehicles(options: {
    dealerId?: string
    limit?: number
    offset?: number
  } = {}): Promise<{
    vehicles: any[]
    total: number
  }> {
    const pool = databaseManager.getSftpGoPool()

    let whereClause = "WHERE status = 'available'"
    const params: any[] = []
    let paramIndex = 1

    if (options.dealerId) {
      whereClause += ` AND dealer_id = $${paramIndex}`
      params.push(options.dealerId)
      paramIndex++
    }

    const countQuery = `SELECT COUNT(*) as total FROM vehicles ${whereClause}`
    const { data: countData, error: countError } = await this.executeQuery(pool, countQuery, params)

    if (countError || !countData) {
      return { vehicles: [], total: 0 }
    }

    const total = parseInt(countData[0].total) || 0

    const vehiclesQuery = `
      SELECT
        id,
        dealer_id,
        vin,
        year,
        make,
        model,
        trim,
        price,
        msrp,
        condition,
        status,
        created_at,
        updated_at,
        ingestion_metadata
      FROM vehicles
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    const limit = options.limit || 50
    const offset = options.offset || 0
    params.push(limit, offset)

    const { data: vehiclesData, error: vehiclesError } = await this.executeQuery(pool, vehiclesQuery, params)

    if (vehiclesError || !vehiclesData) {
      return { vehicles: [], total }
    }

    return {
      vehicles: vehiclesData,
      total
    }
  },

  /**
   * Get dealer statistics from PayloadCMS
   */
  async getDealerStats(): Promise<{
    total_dealers: number
    active_dealers: number
    sftp_enabled: number
    provisioning_status: Record<string, number>
  }> {
    try {
      const cmsUrl = process.env.OD_CMS_URL || 'http://localhost:3002'
      const response = await fetch(`${cmsUrl}/api/dealers`)

      if (!response.ok) {
        throw new Error(`CMS API error: ${response.status}`)
      }

      const result = await response.json()
      const dealers = (result as any)?.data || []

      const stats = {
        total_dealers: dealers.length,
        active_dealers: dealers.filter((d: any) => d.status === 'active').length,
        sftp_enabled: dealers.filter((d: any) => d.sftpConfig?.enabled).length,
        provisioning_status: dealers.reduce((acc: Record<string, number>, dealer: any) => {
          const status = dealer.metadata?.sftpProvisioningStatus || 'unknown'
          acc[status] = (acc[status] || 0) + 1
          return acc
        }, {})
      }

      return stats
    } catch (error) {
      console.error('Error fetching dealer stats from CMS:', error)
      return {
        total_dealers: 0,
        active_dealers: 0,
        sftp_enabled: 0,
        provisioning_status: {}
      }
    }
  }
}
