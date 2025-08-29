/**
 * Enterprise Dashboard - Interactive HTML Interface
 * Shopify-inspired comprehensive service monitoring
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const dashboardHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Open Dealer - Enterprise API Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
            color: white;
        }

        .header h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }

        .status-overview {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .status-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            text-align: center;
            transition: transform 0.3s ease;
        }

        .status-card:hover {
            transform: translateY(-5px);
        }

        .status-icon {
            font-size: 3rem;
            margin-bottom: 15px;
        }

        .status-value {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .status-label {
            color: #666;
            font-size: 1rem;
        }

        .services-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 25px;
            margin-bottom: 40px;
        }

        .service-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }

        .service-card:hover {
            transform: translateY(-5px);
        }

        .service-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .service-name {
            font-size: 1.3rem;
            font-weight: bold;
        }

        .service-status {
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
            text-transform: uppercase;
        }

        .status-healthy { background: #d4edda; color: #155724; }
        .status-degraded { background: #fff3cd; color: #856404; }
        .status-down { background: #f8d7da; color: #721c24; }

        .service-description {
            color: #666;
            margin-bottom: 15px;
            font-size: 0.95rem;
        }

        .service-metrics {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
        }

        .metric {
            text-align: center;
        }

        .metric-value {
            font-size: 1.4rem;
            font-weight: bold;
            color: #2563eb;
        }

        .metric-label {
            font-size: 0.8rem;
            color: #666;
        }

        .service-actions {
            display: flex;
            gap: 10px;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition: all 0.3s ease;
        }

        .btn-primary {
            background: #2563eb;
            color: white;
        }

        .btn-primary:hover {
            background: #1d4ed8;
        }

        .btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }

        .btn-secondary:hover {
            background: #e5e7eb;
        }

        .api-endpoints {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            margin-bottom: 40px;
        }

        .endpoints-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }

        .endpoint-category {
            background: #f8fafc;
            border-radius: 10px;
            padding: 20px;
        }

        .category-title {
            font-size: 1.2rem;
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .endpoint-list {
            list-style: none;
        }

        .endpoint-item {
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
        }

        .endpoint-method {
            color: #059669;
            font-weight: bold;
            margin-right: 10px;
        }

        .refresh-info {
            text-align: center;
            background: white;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .last-updated {
            color: #666;
            font-size: 0.9rem;
        }

        .error-message {
            background: #f8d7da;
            color: #721c24;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Open Dealer Enterprise API Dashboard</h1>
            <p>Real-time service monitoring & API health tracking</p>
        </div>

        <div class="refresh-info">
            <div id="loading" class="loading" style="display: none;"></div>
            <span id="status-text">Loading dashboard data...</span>
            <br>
            <span id="last-updated" class="last-updated"></span>
        </div>

        <div id="error-container"></div>

        <div id="status-overview" class="status-overview">
            <!-- Status cards will be populated by JavaScript -->
        </div>

        <div id="services-container" class="services-grid">
            <!-- Service cards will be populated by JavaScript -->
        </div>

        <div class="api-endpoints">
            <h2 style="margin-bottom: 25px; color: #1e293b;">📋 Available API Endpoints</h2>
            <div class="endpoints-grid">
                <div class="endpoint-category">
                    <div class="category-title">
                        🔍 Unified Search APIs
                    </div>
                    <ul class="endpoint-list">
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/search
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/search/vehicles
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/search/global
                        </li>
                    </ul>
                </div>

                <div class="endpoint-category">
                    <div class="category-title">
                        📊 Business Intelligence APIs
                    </div>
                    <ul class="endpoint-list">
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/analytics/performance
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/analytics/trends
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/analytics/dealer-ranking
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/reports/executive
                        </li>
                    </ul>
                </div>

                <div class="endpoint-category">
                    <div class="category-title">
                        🔄 Bulk Operations APIs
                    </div>
                    <ul class="endpoint-list">
                        <li class="endpoint-item">
                            <span class="endpoint-method">POST</span>/api/v1/bulk/operations
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">POST</span>/api/v1/sync/all-services
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/sync/status
                        </li>
                    </ul>
                </div>

                <div class="endpoint-category">
                    <div class="category-title">
                        🧠 AI Recommendations APIs
                    </div>
                    <ul class="endpoint-list">
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/recommendations/dealers/:id/actions
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/recommendations/vehicles/:id/pricing
                        </li>
                        <li class="endpoint-item">
                            <span class="endpoint-method">GET</span>/api/v1/recommendations/jobs/optimization
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <script>
        let refreshInterval;

        async function loadDashboard() {
            const statusText = document.getElementById('status-text');
            const loading = document.getElementById('loading');
            const errorContainer = document.getElementById('error-container');

            try {
                loading.style.display = 'inline-block';
                statusText.textContent = 'Refreshing dashboard data...';
                errorContainer.innerHTML = '';

                const response = await fetch('/api/health-dashboard');
                const result = await response.json();

                if (result.success) {
                    renderDashboard(result.data);
                    statusText.textContent = \`Dashboard updated - Overall status: \${result.data.overall_status.toUpperCase()}\`;
                } else {
                    throw new Error(result.error || 'Unknown error');
                }

            } catch (error) {
                console.error('Dashboard load error:', error);
                errorContainer.innerHTML = \`
                    <div class="error-message">
                        ❌ Failed to load dashboard: \${error.message}
                        <br>Will retry automatically in 30 seconds...
                    </div>
                \`;
                statusText.textContent = 'Dashboard error - retrying...';
            } finally {
                loading.style.display = 'none';
                document.getElementById('last-updated').textContent =
                    \`Last updated: \${new Date().toLocaleString()}\`;
            }
        }

        function renderDashboard(data) {
            renderStatusOverview(data);
            renderServices(data.services);
        }

        function renderStatusOverview(data) {
            const container = document.getElementById('status-overview');
            const { summary, system_metrics } = data;

            container.innerHTML = \`
                <div class="status-card">
                    <div class="status-icon">🟢</div>
                    <div class="status-value">\${summary.healthy_services}/\${summary.total_services}</div>
                    <div class="status-label">Services Healthy</div>
                </div>

                <div class="status-card">
                    <div class="status-icon">⚡</div>
                    <div class="status-value">\${system_metrics.avg_response_time_ms}ms</div>
                    <div class="status-label">Avg Response Time</div>
                </div>

                <div class="status-card">
                    <div class="status-icon">📊</div>
                    <div class="status-value">\${system_metrics.uptime_percentage}%</div>
                    <div class="status-label">System Uptime</div>
                </div>

                <div class="status-card">
                    <div class="status-icon">⚠️</div>
                    <div class="status-value">\${summary.degraded_services + summary.down_services}</div>
                    <div class="status-label">Issues Detected</div>
                </div>
            \`;
        }

        function renderServices(services) {
            const container = document.getElementById('services-container');

            container.innerHTML = Object.entries(services).map(([key, service]) => \`
                <div class="service-card">
                    <div class="service-header">
                        <div class="service-name">\${service.name}</div>
                        <div class="service-status status-\${service.status}">\${service.status}</div>
                    </div>

                    <div class="service-description">\${service.description}</div>

                    <div class="service-metrics">
                        <div class="metric">
                            <div class="metric-value">\${service.response_time_ms}ms</div>
                            <div class="metric-label">Response Time</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">\${service.critical ? 'Critical' : 'Optional'}</div>
                            <div class="metric-label">Priority</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">\${new Date(service.last_check).toLocaleTimeString()}</div>
                            <div class="metric-label">Last Check</div>
                        </div>
                    </div>

                    <div class="service-actions">
                        <a href="\${service.external_url}" target="_blank" class="btn btn-primary">
                            🔗 Test Health
                        </a>
                        <button class="btn btn-secondary" onclick="testService('\${key}', '\${service.external_url}')">
                            ⚡ Quick Test
                        </button>
                    </div>

                    \${service.error ? \`<div style="margin-top: 10px; color: #dc2626; font-size: 0.9rem;">❌ \${service.error}</div>\` : ''}
                </div>
            \`).join('');
        }

        async function testService(serviceName, url) {
            console.log(\`Testing \${serviceName} at \${url}\`);
            // Could implement quick service test here
            alert(\`Testing \${serviceName} - check browser console for details\`);
        }

        // Initialize dashboard
        loadDashboard();

        // Auto-refresh every 30 seconds (Shopify-style live updates)
        refreshInterval = setInterval(loadDashboard, 30000);

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (refreshInterval) clearInterval(refreshInterval);
        });
    </script>
</body>
</html>`;

  return new NextResponse(dashboardHTML, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

export const dynamic = 'force-dynamic';
