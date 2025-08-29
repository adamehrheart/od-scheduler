'use client';

import { useState, useEffect } from 'react';

interface ServiceHealth {
  name: string;
  endpoint: string;
  status: 'healthy' | 'unhealthy' | 'checking';
  responseTime: number;
  lastCheck: string;
  httpStatus?: number;
}

interface SystemMetrics {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  healthyServices: number;
  totalServices: number;
  avgResponseTime: number;
  lastUpdate: string;
}

export default function MonitoringDashboard() {
  const [services, setServices] = useState<ServiceHealth[]>([
    { name: 'PostgreSQL', endpoint: 'http://localhost:5432', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'Redis', endpoint: 'http://localhost:6379', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'MinIO', endpoint: 'http://localhost:9000/minio/health/live', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'CMS', endpoint: 'http://localhost:3002/', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'Data API', endpoint: 'http://localhost:3001/health', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'DB API', endpoint: 'http://localhost:3004/health', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'Scheduler', endpoint: 'http://localhost:3003/health', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'Ingestion', endpoint: 'http://localhost:4000/health', status: 'checking', responseTime: 0, lastCheck: '' },
    { name: 'SFTPGo', endpoint: 'http://localhost:8080/healthz', status: 'checking', responseTime: 0, lastCheck: '' },
  ]);

  const [metrics, setMetrics] = useState<SystemMetrics>({
    overallStatus: 'checking' as any,
    healthyServices: 0,
    totalServices: 9,
    avgResponseTime: 0,
    lastUpdate: ''
  });

  const checkServiceHealth = async (service: ServiceHealth): Promise<ServiceHealth> => {
    const startTime = Date.now();

    try {
      // Use a proxy through our Next.js API to avoid CORS issues
      const response = await fetch(`/api/health-check?url=${encodeURIComponent(service.endpoint)}`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;

      return {
        ...service,
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime,
        httpStatus: response.status,
        lastCheck: new Date().toLocaleTimeString()
      };
    } catch (error) {
      return {
        ...service,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toLocaleTimeString()
      };
    }
  };

  const checkAllServices = async () => {
    const updatedServices = await Promise.all(
      services.map(service => checkServiceHealth(service))
    );

    setServices(updatedServices);

    // Calculate metrics
    const healthyCount = updatedServices.filter(s => s.status === 'healthy').length;
    const avgResponseTime = Math.round(
      updatedServices.reduce((sum, s) => sum + s.responseTime, 0) / updatedServices.length
    );

    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const healthPercentage = (healthyCount / updatedServices.length) * 100;
    if (healthPercentage < 50) overallStatus = 'critical';
    else if (healthPercentage < 90) overallStatus = 'degraded';

    setMetrics({
      overallStatus,
      healthyServices: healthyCount,
      totalServices: updatedServices.length,
      avgResponseTime,
      lastUpdate: new Date().toLocaleTimeString()
    });
  };

  useEffect(() => {
    // Initial check
    checkAllServices();

    // Set up interval for continuous monitoring
    const interval = setInterval(checkAllServices, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50';
      case 'unhealthy': return 'text-red-600 bg-red-50';
      case 'checking': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'border-green-500 bg-green-50';
      case 'degraded': return 'border-yellow-500 bg-yellow-50';
      case 'critical': return 'border-red-500 bg-red-50';
      default: return 'border-gray-500 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Open Dealer System Monitor</h1>
          <p className="text-gray-600 mt-2">Real-time enterprise system health monitoring</p>
        </div>

        {/* Overall Status Card */}
        <div className={`rounded-lg border-2 p-6 mb-8 ${getOverallStatusColor(metrics.overallStatus)}`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Overall Status</h3>
              <p className={`text-2xl font-bold capitalize ${
                metrics.overallStatus === 'healthy' ? 'text-green-600' :
                metrics.overallStatus === 'degraded' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {metrics.overallStatus}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Services</h3>
              <p className="text-2xl font-bold text-gray-800">
                {metrics.healthyServices}/{metrics.totalServices}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Avg Response</h3>
              <p className="text-2xl font-bold text-gray-800">{metrics.avgResponseTime}ms</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Last Update</h3>
              <p className="text-2xl font-bold text-gray-800">{metrics.lastUpdate}</p>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{service.name}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(service.status)}`}>
                  {service.status}
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Response Time:</span>
                  <span className="font-medium">{service.responseTime}ms</span>
                </div>
                {service.httpStatus && (
                  <div className="flex justify-between">
                    <span>HTTP Status:</span>
                    <span className="font-medium">{service.httpStatus}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Last Check:</span>
                  <span className="font-medium">{service.lastCheck || 'Checking...'}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  <span>Endpoint: {service.endpoint}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Auto-refresh indicator */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Auto-refreshing every 10 seconds • Last update: {metrics.lastUpdate}
          </p>
          <button
            onClick={checkAllServices}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Refresh Now
          </button>
        </div>
      </div>
    </div>
  );
}
