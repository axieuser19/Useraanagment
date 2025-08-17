import React from 'react';
import { useUnifiedAccess } from '../hooks/useUnifiedAccess';
import { useSecurityMonitoring } from '../hooks/useSecurityMonitoring';
import { Shield, Clock, Crown, AlertTriangle, CheckCircle } from 'lucide-react';

export function UnifiedAccessTest() {
  const {
    access,
    loading,
    error,
    hasAccess,
    accessType,
    canCreateAxieStudio,
    isSuperAdmin,
    isReturningUser,
    trialDaysRemaining,
    trialSecondsRemaining,
    subscriptionStatus,
    needsSubscription
  } = useUnifiedAccess();

  const {
    threats,
    systemHealthStatus,
    criticalThreats,
    loading: securityLoading
  } = useSecurityMonitoring();

  if (loading || securityLoading) {
    return (
      <div className="p-6 bg-white border-2 border-black rounded-none">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
          <p className="font-bold uppercase tracking-wide">LOADING UNIFIED ACCESS...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border-2 border-red-600 rounded-none">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h3 className="font-bold text-red-800 uppercase">ERROR</h3>
        </div>
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return 'Expired';
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getAccessColor = (type: string) => {
    switch (type) {
      case 'super_admin': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'subscription': return 'text-green-600 bg-green-50 border-green-200';
      case 'trial': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'expired': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Unified Access Status */}
      <div className="bg-white border-2 border-black rounded-none p-6">
        <h2 className="text-2xl font-bold uppercase tracking-wide mb-6">
          🛡️ UNIFIED ACCESS STATUS
        </h2>

        {/* Access Type Badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 border-2 rounded-none mb-6 ${getAccessColor(accessType)}`}>
          {isSuperAdmin && <Crown className="w-5 h-5" />}
          {accessType === 'trial' && <Clock className="w-5 h-5" />}
          {accessType === 'subscription' && <CheckCircle className="w-5 h-5" />}
          <span className="font-bold uppercase tracking-wide">
            {accessType.replace('_', ' ')}
          </span>
        </div>

        {/* Access Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold text-blue-800 uppercase">ACCESS</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {hasAccess ? 'GRANTED' : 'DENIED'}
            </div>
          </div>

          <div className="bg-green-50 border-2 border-green-200 rounded-none p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-bold text-green-800 uppercase">AXIESTUDIO</span>
            </div>
            <div className="text-2xl font-bold text-green-900">
              {canCreateAxieStudio ? 'ALLOWED' : 'BLOCKED'}
            </div>
          </div>

          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-none p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <span className="text-sm font-bold text-yellow-800 uppercase">TRIAL</span>
            </div>
            <div className="text-lg font-bold text-yellow-900">
              {formatTime(trialSecondsRemaining)}
            </div>
          </div>

          <div className="bg-purple-50 border-2 border-purple-200 rounded-none p-4">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-bold text-purple-800 uppercase">SUBSCRIPTION</span>
            </div>
            <div className="text-lg font-bold text-purple-900">
              {subscriptionStatus.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {isReturningUser && (
          <div className="bg-orange-50 border-2 border-orange-600 rounded-none p-4 mb-4">
            <h3 className="font-bold text-orange-800 uppercase tracking-wide mb-2">RETURNING USER</h3>
            <p className="text-orange-700">
              🔄 Welcome back! Your previous account was deleted. Trial access is not available.
            </p>
          </div>
        )}

        {needsSubscription && (
          <div className="bg-red-50 border-2 border-red-600 rounded-none p-4 mb-4">
            <h3 className="font-bold text-red-800 uppercase tracking-wide mb-2">SUBSCRIPTION REQUIRED</h3>
            <p className="text-red-700">
              💳 A subscription is required to access AxieStudio features.
            </p>
          </div>
        )}

        {isSuperAdmin && (
          <div className="bg-purple-50 border-2 border-purple-600 rounded-none p-4 mb-4">
            <h3 className="font-bold text-purple-800 uppercase tracking-wide mb-2">SUPER ADMIN ACCESS</h3>
            <p className="text-purple-700">
              👑 You have super admin privileges with unlimited access.
            </p>
          </div>
        )}

        {/* Raw Access Data */}
        {access && (
          <div className="bg-gray-50 border-2 border-gray-200 rounded-none p-4">
            <h3 className="font-bold text-gray-800 uppercase tracking-wide mb-2">SYSTEM DATA</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <div>User ID: {access.user_id}</div>
              <div>Created: {new Date(access.user_created_at).toLocaleString()}</div>
              <div>Trial Start: {new Date(access.trial_start_date).toLocaleString()}</div>
              <div>Trial End: {new Date(access.trial_end_date).toLocaleString()}</div>
              <div>Last Checked: {new Date(access.last_checked).toLocaleString()}</div>
              <div>System Version: {access.system_version}</div>
            </div>
          </div>
        )}
      </div>

      {/* Security Status */}
      <div className="bg-white border-2 border-black rounded-none p-6">
        <h2 className="text-2xl font-bold uppercase tracking-wide mb-6">
          🔒 SECURITY STATUS
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold text-blue-800 uppercase">SYSTEM HEALTH</span>
            </div>
            <div className="text-lg font-bold text-blue-900">
              {systemHealthStatus}
            </div>
          </div>

          <div className="bg-red-50 border-2 border-red-200 rounded-none p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-bold text-red-800 uppercase">CRITICAL THREATS</span>
            </div>
            <div className="text-2xl font-bold text-red-900">
              {criticalThreats.length}
            </div>
          </div>

          <div className="bg-gray-50 border-2 border-gray-200 rounded-none p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-bold text-gray-800 uppercase">TOTAL THREATS</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {threats.length}
            </div>
          </div>
        </div>

        {criticalThreats.length > 0 && (
          <div className="mt-4 bg-red-50 border-2 border-red-600 rounded-none p-4">
            <h3 className="font-bold text-red-800 uppercase tracking-wide mb-2">
              🚨 CRITICAL THREATS DETECTED
            </h3>
            <div className="space-y-2">
              {criticalThreats.slice(0, 3).map((threat, index) => (
                <div key={index} className="text-sm text-red-700">
                  • {threat.action} - Risk Score: {threat.risk_score}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Test Actions */}
      <div className="bg-white border-2 border-black rounded-none p-6">
        <h2 className="text-2xl font-bold uppercase tracking-wide mb-6">
          🧪 SYSTEM TESTS
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 border-2 rounded-none ${hasAccess ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h3 className="font-bold uppercase tracking-wide mb-2">ACCESS TEST</h3>
            <p className={`text-sm ${hasAccess ? 'text-green-700' : 'text-red-700'}`}>
              {hasAccess ? '✅ User has access to the system' : '❌ User access denied'}
            </p>
          </div>

          <div className={`p-4 border-2 rounded-none ${canCreateAxieStudio ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h3 className="font-bold uppercase tracking-wide mb-2">AXIESTUDIO TEST</h3>
            <p className={`text-sm ${canCreateAxieStudio ? 'text-green-700' : 'text-red-700'}`}>
              {canCreateAxieStudio ? '✅ AxieStudio creation allowed' : '❌ AxieStudio creation blocked'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
