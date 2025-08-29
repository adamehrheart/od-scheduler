'use client'

import { useState } from 'react'

export default function SchedulerDashboard() {
  const [apiData, setApiData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [activeTest, setActiveTest] = useState<string>('')

  const testEndpoint = async (endpoint: string, method: string = 'GET', body?: any) => {
    setLoading(true)
    setActiveTest(endpoint)
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        }
      }

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body)
      }

      const response = await fetch(endpoint, options)
      const data = await response.json()
      setApiData({ endpoint, method, status: response.status, data })
    } catch (error) {
      setApiData({
        endpoint,
        method,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setLoading(false)
      setActiveTest('')
    }
  }

  const testHealth = () => testEndpoint('/api/health')
  const testSimple = () => testEndpoint('/api/simple')
  const testTraces = () => testEndpoint('/api/traces')
  const testTracesWithId = () => testEndpoint('/api/traces?trace_id=abc123')
  const testTracesWithCorrelation = () => testEndpoint('/api/traces?correlation_id=def456')
  const testVehicles = () => testEndpoint('/api/vehicles')
  const testVehiclesWithFilter = () => testEndpoint('/api/vehicles?dealer_id=dealer-123&limit=5')
  const testSchedules = () => testEndpoint('/api/schedules/preview')
  const testSchedulesWithParams = () => testEndpoint('/api/schedules/preview?timezone=America/Los_Angeles&dealers=3')
  const testJobsTrigger = () => testEndpoint('/api/jobs/trigger', 'POST', { force: true })
  const testJobsTriggerSpecific = () => testEndpoint('/api/jobs/trigger', 'POST', { dealer_id: 'dealer-123', force: true, priority: 'high' })
  const testJobsTriggerAsync = () => testEndpoint('/api/jobs/trigger?async=true', 'POST', { force: true })

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            🚀 Open Dealer Scheduler Dashboard
          </h1>
          <a
            href="/api/monitor"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            📊 System Monitor
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Health & Core Endpoints */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Health & Core Endpoints</h2>
            <div className="space-y-3">
              <button
                onClick={testHealth}
                disabled={loading}
                className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/health' ? 'Testing...' : '🏥 Health Check'}
              </button>

              <button
                onClick={testSimple}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/simple' ? 'Testing...' : '🔍 Test Tracing'}
              </button>
            </div>
          </div>

          {/* Tracing Endpoints */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Tracing & Monitoring</h2>
            <div className="space-y-3">
              <button
                onClick={testTraces}
                disabled={loading}
                className="w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/traces' ? 'Loading...' : '📊 All Traces'}
              </button>

              <button
                onClick={testTracesWithId}
                disabled={loading}
                className="w-full bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/traces?trace_id=abc123' ? 'Loading...' : '🔍 Specific Trace'}
              </button>

              <button
                onClick={testTracesWithCorrelation}
                disabled={loading}
                className="w-full bg-purple-400 text-white px-4 py-2 rounded hover:bg-purple-500 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/traces?correlation_id=def456' ? 'Loading...' : '🔗 Correlation Traces'}
              </button>
            </div>
          </div>

          {/* Data Endpoints */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Vehicle Data</h2>
            <div className="space-y-3">
              <button
                onClick={testVehicles}
                disabled={loading}
                className="w-full bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/vehicles' ? 'Loading...' : '🚗 All Vehicles'}
              </button>

              <button
                onClick={testVehiclesWithFilter}
                disabled={loading}
                className="w-full bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/vehicles?dealer_id=dealer-123&limit=5' ? 'Loading...' : '🔍 Filtered Vehicles'}
              </button>
            </div>
          </div>

          {/* Scheduling Endpoints */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Smart Scheduling</h2>
            <div className="space-y-3">
              <button
                onClick={testSchedules}
                disabled={loading}
                className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/schedules/preview' ? 'Loading...' : '📅 Schedule Preview'}
              </button>

              <button
                onClick={testSchedulesWithParams}
                disabled={loading}
                className="w-full bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/schedules/preview?timezone=America/Los_Angeles&dealers=3' ? 'Loading...' : '🌍 Timezone Schedule'}
              </button>
            </div>
          </div>

          {/* Job Execution Endpoints */}
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Job Execution</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={testJobsTrigger}
                disabled={loading}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/jobs/trigger' ? 'Executing...' : '⚡ Trigger All Jobs'}
              </button>

              <button
                onClick={testJobsTriggerSpecific}
                disabled={loading}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/jobs/trigger' ? 'Executing...' : '🎯 Specific Dealer'}
              </button>

              <button
                onClick={testJobsTriggerAsync}
                disabled={loading}
                className="bg-red-400 text-white px-4 py-2 rounded hover:bg-red-500 disabled:opacity-50 text-left"
              >
                {loading && activeTest === '/api/jobs/trigger?async=true' ? 'Triggering...' : '🔄 Async Trigger'}
              </button>
            </div>
          </div>
        </div>

        {/* Results Display */}
        {apiData && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">
              📊 API Response: {apiData.endpoint}
              {apiData.method && apiData.method !== 'GET' && ` (${apiData.method})`}
            </h2>

            {apiData.status && (
              <div className="mb-4">
                <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                  apiData.status >= 200 && apiData.status < 300
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  Status: {apiData.status}
                </span>
              </div>
            )}

            {apiData.error ? (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <h3 className="text-red-800 font-medium mb-2">Error:</h3>
                <pre className="text-red-700 text-sm">{apiData.error}</pre>
              </div>
            ) : (
              <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm max-h-96">
                {JSON.stringify(apiData.data, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Endpoint Documentation */}
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">📚 API Documentation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-semibold mb-2">Core Endpoints</h3>
              <div className="space-y-1">
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/health</code> - Service health check</div>
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/simple</code> - Tracing demo</div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Tracing Endpoints</h3>
              <div className="space-y-1">
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/traces</code> - All traces</div>
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/traces?trace_id=abc123</code> - Specific trace</div>
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/traces?correlation_id=def456</code> - Correlation traces</div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Data Endpoints</h3>
              <div className="space-y-1">
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/vehicles</code> - All vehicles</div>
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/vehicles?dealer_id=123&limit=10</code> - Filtered vehicles</div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Scheduling Endpoints</h3>
              <div className="space-y-1">
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/schedules/preview</code> - Schedule preview</div>
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/schedules/preview?timezone=America/Los_Angeles</code> - Timezone schedule</div>
              </div>
            </div>

            <div className="md:col-span-2">
              <h3 className="font-semibold mb-2">Job Execution Endpoints</h3>
              <div className="space-y-1">
                <div><code className="bg-gray-100 px-2 py-1 rounded">POST /api/jobs/trigger</code> - Trigger all jobs</div>
                <div><code className="bg-gray-100 px-2 py-1 rounded">POST /api/jobs/trigger?async=true</code> - Async trigger</div>
                <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/jobs/trigger</code> - Endpoint documentation</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
