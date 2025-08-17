import React, { useState } from 'react';
import { useSystemHealth } from '../hooks/useSystemHealth';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Users, 
  Clock, 
  CreditCard,
  TrendingUp,
  Download,
  AlertCircle
} from 'lucide-react';

export function SystemMonitoringDashboard() {
  const {
    health,
    errors,
    loading,
    lastCheck,
    checkHealth,
    resolveError,
    retryOperation,
    exportUserData,
    isHealthy,
    hasWarnings,
    isCritical,
    unresolvedErrorCount,
    systemLoad
  } = useSystemHealth();

  const [exportingUserId, setExportingUserId] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const handleExportUserData = async () => {
    if (!exportingUserId.trim()) return;
    
    setExportLoading(true);
    try {
      const userData = await exportUserData(exportingUserId);
      if (userData) {
        // Create download link
        const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_data_${exportingUserId}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setExportLoading(false);
      setExportingUserId('');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'text-green-600 bg-green-50 border-green-200';
      case 'WARNING': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'CRITICAL': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'HEALTHY': return <CheckCircle className="w-5 h-5" />;
      case 'WARNING': return <AlertTriangle className="w-5 h-5" />;
      case 'CRITICAL': return <XCircle className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white border-2 border-black rounded-none">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="font-bold uppercase tracking-wide">LOADING SYSTEM STATUS...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Health Overview */}
      <div className="bg-white border-2 border-black rounded-none p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold uppercase tracking-wide">SYSTEM HEALTH MONITOR</h2>
          <button
            onClick={checkHealth}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white border-2 border-black rounded-none hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            REFRESH
          </button>
        </div>

        {health && (
          <>
            {/* Status Badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 border-2 rounded-none mb-6 ${getStatusColor(health.status)}`}>
              {getStatusIcon(health.status)}
              <span className="font-bold uppercase tracking-wide">
                SYSTEM STATUS: {health.status}
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-bold text-blue-800 uppercase">TOTAL USERS</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">
                  {health.metrics.total_users.toLocaleString()}
                </div>
              </div>

              <div className="bg-green-50 border-2 border-green-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-bold text-green-800 uppercase">ACTIVE TRIALS</span>
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {health.metrics.active_trials.toLocaleString()}
                </div>
              </div>

              <div className="bg-purple-50 border-2 border-purple-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-bold text-purple-800 uppercase">SUBSCRIPTIONS</span>
                </div>
                <div className="text-2xl font-bold text-purple-900">
                  {health.metrics.active_subscriptions.toLocaleString()}
                </div>
              </div>

              <div className="bg-red-50 border-2 border-red-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-bold text-red-800 uppercase">ERRORS (1H)</span>
                </div>
                <div className="text-2xl font-bold text-red-900">
                  {health.metrics.failed_operations_1h}
                </div>
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm font-bold text-yellow-800 uppercase">LOAD (OPS/MIN)</span>
                </div>
                <div className="text-2xl font-bold text-yellow-900">
                  {health.metrics.system_load_ops_per_min.toFixed(1)}
                </div>
              </div>
            </div>

            {/* Alerts */}
            {health.alerts && health.alerts.length > 0 && (
              <div className="bg-red-50 border-2 border-red-600 rounded-none p-4 mb-6">
                <h3 className="font-bold text-red-800 uppercase tracking-wide mb-2">ACTIVE ALERTS</h3>
                <ul className="space-y-1">
                  {health.alerts.map((alert, index) => (
                    <li key={index} className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">{alert.replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Last Check */}
            {lastCheck && (
              <div className="text-sm text-gray-600">
                Last updated: {lastCheck.toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>

      {/* Error Management */}
      <div className="bg-white border-2 border-black rounded-none p-6">
        <h3 className="text-xl font-bold uppercase tracking-wide mb-4">
          ERROR MANAGEMENT ({unresolvedErrorCount} UNRESOLVED)
        </h3>

        {errors.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">NO UNRESOLVED ERRORS</span>
          </div>
        ) : (
          <div className="space-y-3">
            {errors.map((error) => (
              <div key={error.id} className="bg-red-50 border-2 border-red-200 rounded-none p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="font-bold text-red-800 uppercase">
                        {error.error_type.replace('_', ' ')}
                      </span>
                      <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">
                        RETRY {error.retry_count}/{error.max_retries}
                      </span>
                    </div>
                    <p className="text-red-700 mb-2">{error.error_message}</p>
                    <div className="text-xs text-red-600">
                      {error.function_name && <span>Function: {error.function_name} | </span>}
                      {new Date(error.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {error.retry_count < error.max_retries && (
                      <button
                        onClick={() => retryOperation(error.id)}
                        className="px-3 py-1 bg-yellow-600 text-white text-xs border border-black rounded-none hover:bg-yellow-700"
                      >
                        RETRY
                      </button>
                    )}
                    <button
                      onClick={() => resolveError(error.id)}
                      className="px-3 py-1 bg-green-600 text-white text-xs border border-black rounded-none hover:bg-green-700"
                    >
                      RESOLVE
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Export (GDPR Compliance) */}
      <div className="bg-white border-2 border-black rounded-none p-6">
        <h3 className="text-xl font-bold uppercase tracking-wide mb-4">
          USER DATA EXPORT (GDPR)
        </h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter User ID"
            value={exportingUserId}
            onChange={(e) => setExportingUserId(e.target.value)}
            className="flex-1 px-3 py-2 border-2 border-black rounded-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleExportUserData}
            disabled={!exportingUserId.trim() || exportLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white border-2 border-black rounded-none hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {exportLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            EXPORT
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Export all user data for GDPR compliance. Downloads as JSON file.
        </p>
      </div>
    </div>
  );
}
