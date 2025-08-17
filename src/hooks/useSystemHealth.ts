import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Enhanced interfaces for new security system
export interface UnifiedUserAccess {
  user_id: string;
  user_created_at: string;
  has_access: boolean;
  access_type: 'super_admin' | 'subscription' | 'subscription_trial' | 'trial' | 'expired';
  can_create_axiestudio_account: boolean;
  is_super_admin: boolean;
  is_returning_user: boolean;
  trial_days_remaining: number;
  trial_seconds_remaining: number;
  trial_start_date: string;
  trial_end_date: string;
  trial_status: 'active' | 'expired' | 'not_eligible';
  subscription_status: string;
  subscription_period_end?: string;
  subscription_cancel_at_period_end: boolean;
  deletion_history?: {
    deleted_at: string;
    deletion_reason: string;
  };
  last_checked: string;
  system_version: string;
}

export interface SecurityValidation {
  user_id: string;
  action: string;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  warnings: string[];
  access_info: UnifiedUserAccess;
  timestamp: string;
  allowed: boolean;
}

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

export interface SystemHealth {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  timestamp: string;
  metrics: {
    total_users: number;
    active_trials: number;
    active_subscriptions: number;
    failed_operations_1h: number;
    system_load_ops_per_min: number;
  };
  alerts: string[];
}

export interface SystemError {
  id: string;
  error_type: string;
  error_message: string;
  error_context: any;
  user_id?: string;
  function_name?: string;
  retry_count: number;
  max_retries: number;
  resolved: boolean;
  created_at: string;
}

export function useSystemHealth() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  // Check system health
  const checkHealth = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('system_health_check');
      
      if (error) {
        console.error('❌ Health check failed:', error);
        await logError('HEALTH_CHECK_FAILED', error.message, { error });
        return;
      }

      setHealth(data);
      setLastCheck(new Date());
      
      // Log critical status
      if (data.status === 'CRITICAL') {
        await logError('SYSTEM_CRITICAL', 'System health is critical', { health: data });
      }
      
    } catch (error: any) {
      console.error('❌ Health check exception:', error);
      await logError('HEALTH_CHECK_EXCEPTION', error.message, { error });
    }
  }, []);

  // Get recent errors
  const getRecentErrors = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_errors')
        .select('*')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('❌ Failed to fetch errors:', error);
        return;
      }

      setErrors(data || []);
    } catch (error: any) {
      console.error('❌ Error fetching errors:', error);
    }
  }, []);

  // Log system error
  const logError = useCallback(async (
    errorType: string,
    errorMessage: string,
    errorContext: any = {},
    userId?: string,
    functionName?: string
  ) => {
    try {
      const { data, error } = await supabase.rpc('log_system_error', {
        p_error_type: errorType,
        p_error_message: errorMessage,
        p_error_context: errorContext,
        p_user_id: userId || null,
        p_function_name: functionName || null
      });

      if (error) {
        console.error('❌ Failed to log error:', error);
        return null;
      }

      // Refresh errors list
      await getRecentErrors();
      
      return data;
    } catch (error: any) {
      console.error('❌ Exception logging error:', error);
      return null;
    }
  }, [getRecentErrors]);

  // Resolve error
  const resolveError = useCallback(async (errorId: string) => {
    try {
      const { error } = await supabase
        .from('system_errors')
        .update({ 
          resolved: true, 
          resolved_at: new Date().toISOString() 
        })
        .eq('id', errorId);

      if (error) {
        console.error('❌ Failed to resolve error:', error);
        return false;
      }

      // Refresh errors list
      await getRecentErrors();
      return true;
    } catch (error: any) {
      console.error('❌ Exception resolving error:', error);
      return false;
    }
  }, [getRecentErrors]);

  // Retry failed operation
  const retryOperation = useCallback(async (errorId: string) => {
    try {
      // Increment retry count
      const { error } = await supabase
        .from('system_errors')
        .update({ 
          retry_count: supabase.sql`retry_count + 1`
        })
        .eq('id', errorId);

      if (error) {
        console.error('❌ Failed to update retry count:', error);
        return false;
      }

      // Refresh errors list
      await getRecentErrors();
      return true;
    } catch (error: any) {
      console.error('❌ Exception retrying operation:', error);
      return false;
    }
  }, [getRecentErrors]);

  // Get cached data
  const getCachedData = useCallback(async (cacheKey: string, ttlMinutes: number = 5) => {
    try {
      const { data, error } = await supabase.rpc('get_cached_data', {
        p_cache_key: cacheKey,
        p_ttl_minutes: ttlMinutes
      });

      if (error) {
        console.error('❌ Failed to get cached data:', error);
        return null;
      }

      return data;
    } catch (error: any) {
      console.error('❌ Exception getting cached data:', error);
      return null;
    }
  }, []);

  // Set cached data
  const setCachedData = useCallback(async (
    cacheKey: string, 
    cacheValue: any, 
    ttlMinutes: number = 5
  ) => {
    try {
      const { data, error } = await supabase.rpc('set_cached_data', {
        p_cache_key: cacheKey,
        p_cache_value: cacheValue,
        p_ttl_minutes: ttlMinutes
      });

      if (error) {
        console.error('❌ Failed to set cached data:', error);
        return false;
      }

      return data;
    } catch (error: any) {
      console.error('❌ Exception setting cached data:', error);
      return false;
    }
  }, []);

  // Validate data
  const validateData = useCallback(async (tableName: string, data: any) => {
    try {
      const { data: validationResult, error } = await supabase.rpc('validate_data', {
        p_table_name: tableName,
        p_data: data
      });

      if (error) {
        console.error('❌ Failed to validate data:', error);
        return { is_valid: false, errors: [{ field: 'system', message: 'Validation failed' }] };
      }

      return validationResult;
    } catch (error: any) {
      console.error('❌ Exception validating data:', error);
      return { is_valid: false, errors: [{ field: 'system', message: 'Validation exception' }] };
    }
  }, []);

  // Export user data (GDPR compliance)
  const exportUserData = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('export_user_data', {
        p_user_id: userId
      });

      if (error) {
        console.error('❌ Failed to export user data:', error);
        await logError('USER_DATA_EXPORT_FAILED', error.message, { userId, error });
        return null;
      }

      return data;
    } catch (error: any) {
      console.error('❌ Exception exporting user data:', error);
      await logError('USER_DATA_EXPORT_EXCEPTION', error.message, { userId, error });
      return null;
    }
  }, [logError]);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      await Promise.all([
        checkHealth(),
        getRecentErrors()
      ]);
      setLoading(false);
    };

    initialize();

    // Set up periodic health checks (every 5 minutes)
    const healthInterval = setInterval(checkHealth, 5 * 60 * 1000);

    // Set up error monitoring (every minute)
    const errorInterval = setInterval(getRecentErrors, 60 * 1000);

    return () => {
      clearInterval(healthInterval);
      clearInterval(errorInterval);
    };
  }, [checkHealth, getRecentErrors]);

  return {
    // State
    health,
    errors,
    loading,
    lastCheck,
    
    // Actions
    checkHealth,
    getRecentErrors,
    logError,
    resolveError,
    retryOperation,
    
    // Utilities
    getCachedData,
    setCachedData,
    validateData,
    exportUserData,
    
    // Computed
    isHealthy: health?.status === 'HEALTHY',
    hasWarnings: health?.status === 'WARNING',
    isCritical: health?.status === 'CRITICAL',
    unresolvedErrorCount: errors.length,
    systemLoad: health?.metrics?.system_load_ops_per_min || 0
  };
}
