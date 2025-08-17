import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface ThreatMonitor {
  created_at: string;
  user_id?: string;
  action: string;
  details: any;
  email?: string;
  threat_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_score: number;
  recommended_action: string;
}

export interface AutomatedThreatResponse {
  critical_threats_1h: number;
  high_threats_1h: number;
  actions_taken: Array<{
    threat_id: string;
    action: string;
    risk_score: number;
  }>;
  system_status: 'NORMAL' | 'ELEVATED' | 'HIGH_ALERT' | 'UNDER_ATTACK';
  timestamp: string;
}

export function useSecurityMonitoring() {
  const { user } = useAuth();
  const [threats, setThreats] = useState<ThreatMonitor[]>([]);
  const [systemStatus, setSystemStatus] = useState<AutomatedThreatResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get security threat monitor data
  const getThreatMonitor = useCallback(async (limit: number = 50) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: threatError } = await supabase
        .from('security_threat_monitor')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (threatError) {
        console.error('❌ Failed to get threat monitor:', threatError);
        setError(threatError.message);
        return;
      }

      console.log('🔍 Threat monitor data:', data);
      setThreats(data || []);
    } catch (error: any) {
      console.error('❌ Exception getting threat monitor:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get automated threat response status
  const getAutomatedThreatResponse = useCallback(async () => {
    try {
      const { data, error: responseError } = await supabase.rpc('automated_threat_response');

      if (responseError) {
        console.error('❌ Failed to get automated response:', responseError);
        return null;
      }

      console.log('🤖 Automated threat response:', data);
      setSystemStatus(data);
      return data;
    } catch (error: any) {
      console.error('❌ Exception getting automated response:', error);
      return null;
    }
  }, []);

  // Get security audit log for specific user
  const getUserSecurityLog = useCallback(async (userId?: string, limit: number = 20) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return [];

    try {
      const { data, error: logError } = await supabase
        .from('security_audit_log')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (logError) {
        console.error('❌ Failed to get security log:', logError);
        return [];
      }

      return data || [];
    } catch (error: any) {
      console.error('❌ Exception getting security log:', error);
      return [];
    }
  }, [user]);

  // Get critical threats (HIGH and CRITICAL only)
  const getCriticalThreats = useCallback(async () => {
    try {
      const { data, error: criticalError } = await supabase
        .from('security_threat_monitor')
        .select('*')
        .in('threat_level', ['HIGH', 'CRITICAL'])
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false });

      if (criticalError) {
        console.error('❌ Failed to get critical threats:', criticalError);
        return [];
      }

      return data || [];
    } catch (error: any) {
      console.error('❌ Exception getting critical threats:', error);
      return [];
    }
  }, []);

  // Get threat statistics
  const getThreatStatistics = useCallback(async () => {
    try {
      const { data, error: statsError } = await supabase
        .from('security_threat_monitor')
        .select('threat_level')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

      if (statsError) {
        console.error('❌ Failed to get threat statistics:', statsError);
        return null;
      }

      const stats = (data || []).reduce((acc, threat) => {
        acc[threat.threat_level] = (acc[threat.threat_level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        critical: stats.CRITICAL || 0,
        high: stats.HIGH || 0,
        medium: stats.MEDIUM || 0,
        low: stats.LOW || 0,
        total: data?.length || 0
      };
    } catch (error: any) {
      console.error('❌ Exception getting threat statistics:', error);
      return null;
    }
  }, []);

  // Check if user has any security issues
  const checkUserSecurityIssues = useCallback(async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return null;

    try {
      const { data, error: issuesError } = await supabase
        .from('security_threat_monitor')
        .select('*')
        .eq('user_id', targetUserId)
        .in('threat_level', ['HIGH', 'CRITICAL'])
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order('created_at', { ascending: false });

      if (issuesError) {
        console.error('❌ Failed to check user security issues:', issuesError);
        return null;
      }

      return {
        hasIssues: (data?.length || 0) > 0,
        issueCount: data?.length || 0,
        issues: data || [],
        highestThreatLevel: data?.[0]?.threat_level || 'LOW'
      };
    } catch (error: any) {
      console.error('❌ Exception checking user security issues:', error);
      return null;
    }
  }, [user]);

  // Initialize monitoring
  useEffect(() => {
    const initialize = async () => {
      await Promise.all([
        getThreatMonitor(),
        getAutomatedThreatResponse()
      ]);
    };

    initialize();

    // Set up periodic refresh (every 2 minutes)
    const interval = setInterval(() => {
      getThreatMonitor();
      getAutomatedThreatResponse();
    }, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [getThreatMonitor, getAutomatedThreatResponse]);

  // Real-time subscription to security events
  useEffect(() => {
    const subscription = supabase
      .channel('security_monitoring')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'security_audit_log'
        },
        (payload) => {
          console.log('🚨 New security event:', payload.new);
          // Refresh threat monitor when new security events occur
          getThreatMonitor();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [getThreatMonitor]);

  // Computed properties
  const criticalThreats = threats.filter(t => t.threat_level === 'CRITICAL');
  const highThreats = threats.filter(t => t.threat_level === 'HIGH');
  const recentThreats = threats.filter(t => {
    const threatTime = new Date(t.created_at).getTime();
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return threatTime > oneHourAgo;
  });

  const systemHealthStatus = systemStatus?.system_status || 'NORMAL';
  const isSystemUnderThreat = ['HIGH_ALERT', 'UNDER_ATTACK'].includes(systemHealthStatus);

  return {
    // State
    threats,
    systemStatus,
    loading,
    error,
    
    // Actions
    getThreatMonitor,
    getAutomatedThreatResponse,
    getUserSecurityLog,
    getCriticalThreats,
    getThreatStatistics,
    checkUserSecurityIssues,
    
    // Computed
    criticalThreats,
    highThreats,
    recentThreats,
    systemHealthStatus,
    isSystemUnderThreat,
    criticalThreatCount: criticalThreats.length,
    highThreatCount: highThreats.length,
    recentThreatCount: recentThreats.length,
    totalThreats: threats.length
  };
}
