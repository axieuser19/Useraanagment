import React, { useState, useEffect } from 'react';
import { useUnifiedAccess } from '../hooks/useUnifiedAccess';
import { useSecurityMonitoring } from '../hooks/useSecurityMonitoring';
import { 
  Shield, 
  Clock, 
  Crown, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Eye,
  Users,
  Activity
} from 'lucide-react';

export function UnifiedAccessDashboard() {
  const {
    access,
    loading: accessLoading,
    hasAccess,
    accessType,
    canCreateAxieStudio,
    isSuperAdmin,
    isReturningUser,
    trialDaysRemaining,
    trialSecondsRemaining,
    trialStatus,
    subscriptionStatus,
    needsSubscription,
    getUnifiedAccess,
    validateSecurity,
    checkSuperAdmin
  } = useUnifiedAccess();

  const {
    threats,
    systemStatus,
    loading: securityLoading,
    criticalThreats,
    highThreats,
    systemHealthStatus,
    isSystemUnderThreat,
    getUserSecurityLog,
    checkUserSecurityIssues
  } = useSecurityMonitoring();

  const [userSecurityLog, setUserSecurityLog] = useState<any[]>([]);
  const [userSecurityIssues, setUserSecurityIssues] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load user security information
  useEffect(() => {
    const loadUserSecurity = async () => {
      if (access?.user_id) {
        const [securityLog, securityIssues] = await Promise.all([
          getUserSecurityLog(),
          checkUserSecurityIssues()
        ]);
        
        setUserSecurityLog(securityLog);
        setUserSecurityIssues(securityIssues);
      }
    };

    loadUserSecurity();
  }, [access?.user_id, getUserSecurityLog, checkUserSecurityIssues]);

  // Refresh all data
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await getUnifiedAccess();
      if (access?.user_id) {
        const [securityLog, securityIssues] = await Promise.all([
          getUserSecurityLog(),
          checkUserSecurityIssues()
        ]);
        setUserSecurityLog(securityLog);
        setUserSecurityIssues(securityIssues);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Format time remaining
  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Expired';
    
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Get access status color
  const getAccessStatusColor = (type: string) => {
    switch (type) {
      case 'super_admin': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'subscription': return 'text-green-600 bg-green-50 border-green-200';
      case 'subscription_trial': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'trial': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'expired': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Get access status icon
  const getAccessStatusIcon = (type: string) => {
    switch (type) {
      case 'super_admin': return <Crown className="w-5 h-5" />;
      case 'subscription': return <CheckCircle className="w-5 h-5" />;
      case 'subscription_trial': return <CheckCircle className="w-5 h-5" />;
      case 'trial': return <Clock className="w-5 h-5" />;
      case 'expired': return <XCircle className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  if (accessLoading || securityLoading) {
    return (
      <div className="p-6 bg-white border-2 border-black rounded-none">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="font-bold uppercase tracking-wide">LOADING ACCESS STATUS...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Access Status Overview */}
      <div className="bg-white border-2 border-black rounded-none p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold uppercase tracking-wide">UNIFIED ACCESS STATUS</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white border-2 border-black rounded-none hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>

        {access && (
          <>
            {/* Access Type Badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 border-2 rounded-none mb-6 ${getAccessStatusColor(accessType)}`}>
              {getAccessStatusIcon(accessType)}
              <span className="font-bold uppercase tracking-wide">
                ACCESS: {accessType.replace('_', ' ')}
              </span>
            </div>

            {/* Access Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-bold text-blue-800 uppercase">HAS ACCESS</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">
                  {hasAccess ? 'YES' : 'NO'}
                </div>
              </div>

              <div className="bg-green-50 border-2 border-green-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-bold text-green-800 uppercase">AXIESTUDIO</span>
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {canCreateAxieStudio ? 'ALLOWED' : 'BLOCKED'}
                </div>
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm font-bold text-yellow-800 uppercase">TRIAL TIME</span>
                </div>
                <div className="text-2xl font-bold text-yellow-900">
                  {formatTimeRemaining(trialSecondsRemaining)}
                </div>
              </div>

              <div className="bg-purple-50 border-2 border-purple-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-bold text-purple-800 uppercase">SUBSCRIPTION</span>
                </div>
                <div className="text-2xl font-bold text-purple-900">
                  {subscriptionStatus.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Special Status Messages */}
            {isReturningUser && (
              <div className="bg-orange-50 border-2 border-orange-600 rounded-none p-4 mb-4">
                <h3 className="font-bold text-orange-800 uppercase tracking-wide mb-2">RETURNING USER</h3>
                <p className="text-orange-700">
                  🔄 Welcome back! Your previous account was deleted. Trial access is not available for returning users.
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

            {/* System Information */}
            <div className="text-sm text-gray-600 space-y-1">
              <div>User Created: {new Date(access.user_created_at).toLocaleString()}</div>
              <div>Trial Start: {new Date(access.trial_start_date).toLocaleString()}</div>
              <div>Trial End: {new Date(access.trial_end_date).toLocaleString()}</div>
              <div>Last Checked: {new Date(access.last_checked).toLocaleString()}</div>
              <div>System Version: {access.system_version}</div>
            </div>
          </>
        )}
      </div>

      {/* Security Status */}
      {userSecurityIssues && (
        <div className="bg-white border-2 border-black rounded-none p-6">
          <h3 className="text-xl font-bold uppercase tracking-wide mb-4">
            SECURITY STATUS
          </h3>

          {userSecurityIssues.hasIssues ? (
            <div className="bg-red-50 border-2 border-red-200 rounded-none p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="font-bold text-red-800 uppercase">
                  {userSecurityIssues.issueCount} SECURITY ISSUES DETECTED
                </span>
              </div>
              <p className="text-red-700 mb-2">
                Highest Threat Level: {userSecurityIssues.highestThreatLevel}
              </p>
              <div className="space-y-2">
                {userSecurityIssues.issues.slice(0, 3).map((issue: any, index: number) => (
                  <div key={index} className="text-sm text-red-600">
                    • {issue.action} - {issue.threat_level} ({new Date(issue.created_at).toLocaleString()})
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border-2 border-green-200 rounded-none p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-bold text-green-800 uppercase">NO SECURITY ISSUES</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Security Log */}
      {userSecurityLog.length > 0 && (
        <div className="bg-white border-2 border-black rounded-none p-6">
          <h3 className="text-xl font-bold uppercase tracking-wide mb-4">
            RECENT SECURITY LOG ({userSecurityLog.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {userSecurityLog.slice(0, 10).map((log, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-none text-sm">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{log.action}</span>
                </div>
                <span className="text-gray-500">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
