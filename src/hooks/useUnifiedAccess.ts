import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

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

export function useUnifiedAccess() {
  const { user } = useAuth();
  const [access, setAccess] = useState<UnifiedUserAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Get unified user access information
  const getUnifiedAccess = useCallback(async (userId?: string) => {
    if (!userId && !user?.id) return null;

    try {
      setLoading(true);
      setError(null);

      const { data, error: accessError } = await supabase.rpc('get_unified_user_access', {
        p_user_id: userId || user!.id
      });

      if (accessError) {
        console.error('❌ Failed to get unified access:', accessError);
        setError(accessError.message);
        return null;
      }

      console.log('✅ Unified access retrieved:', data);
      setAccess(data);
      setLastRefresh(new Date());
      return data;
    } catch (error: any) {
      console.error('❌ Exception getting unified access:', error);
      setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Validate user security for specific action
  const validateSecurity = useCallback(async (action: string, userId?: string): Promise<SecurityValidation | null> => {
    if (!userId && !user?.id) return null;

    try {
      const { data, error: securityError } = await supabase.rpc('validate_user_security', {
        p_user_id: userId || user!.id,
        p_action: action
      });

      if (securityError) {
        console.error('❌ Security validation failed:', securityError);
        return null;
      }

      console.log(`🔍 Security validation for ${action}:`, data);
      return data;
    } catch (error: any) {
      console.error('❌ Exception validating security:', error);
      return null;
    }
  }, [user]);

  // Calculate secure trial remaining time
  const getSecureTrialRemaining = useCallback(async (userId?: string) => {
    if (!userId && !user?.id) return null;

    try {
      const { data, error: trialError } = await supabase.rpc('calculate_secure_trial_remaining', {
        p_user_id: userId || user!.id
      });

      if (trialError) {
        console.error('❌ Failed to calculate trial remaining:', trialError);
        return null;
      }

      console.log('⏰ Secure trial calculation:', data);
      return data;
    } catch (error: any) {
      console.error('❌ Exception calculating trial:', error);
      return null;
    }
  }, [user]);

  // Perform atomic user state update
  const atomicStateUpdate = useCallback(async (operation: string, parameters: any = {}) => {
    if (!user?.id) return null;

    try {
      const { data, error: updateError } = await supabase.rpc('atomic_user_state_update', {
        p_user_id: user.id,
        p_operation: operation,
        p_parameters: parameters
      });

      if (updateError) {
        console.error('❌ Atomic update failed:', updateError);
        return null;
      }

      console.log(`⚡ Atomic operation ${operation}:`, data);
      
      // Refresh access after state change
      if (data.success) {
        await getUnifiedAccess();
      }
      
      return data;
    } catch (error: any) {
      console.error('❌ Exception in atomic update:', error);
      return null;
    }
  }, [user, getUnifiedAccess]);

  // Check if user is super admin
  const checkSuperAdmin = useCallback(async (userId?: string) => {
    if (!userId && !user?.id) return false;

    try {
      const { data, error: adminError } = await supabase.rpc('is_super_admin', {
        p_user_id: userId || user!.id
      });

      if (adminError) {
        console.error('❌ Failed to check super admin:', adminError);
        return false;
      }

      return data || false;
    } catch (error: any) {
      console.error('❌ Exception checking super admin:', error);
      return false;
    }
  }, [user]);

  // Ensure correct trial dates
  const ensureCorrectTrialDates = useCallback(async (userId?: string) => {
    if (!userId && !user?.id) return null;

    try {
      const { data, error: trialError } = await supabase.rpc('ensure_correct_trial_dates', {
        p_user_id: userId || user!.id
      });

      if (trialError) {
        console.error('❌ Failed to ensure trial dates:', trialError);
        return null;
      }

      console.log('📅 Trial dates ensured:', data);
      
      // Refresh access after trial date correction
      await getUnifiedAccess();
      
      return data;
    } catch (error: any) {
      console.error('❌ Exception ensuring trial dates:', error);
      return null;
    }
  }, [user, getUnifiedAccess]);

  // Validate AxieStudio creation eligibility
  const validateAxieStudioCreation = useCallback(async (userId?: string) => {
    if (!userId && !user?.id) return null;

    try {
      const { data, error: validationError } = await supabase.rpc('validate_axiestudio_creation', {
        p_user_id: userId || user!.id
      });

      if (validationError) {
        console.error('❌ AxieStudio validation failed:', validationError);
        return null;
      }

      console.log('🎯 AxieStudio validation:', data);
      return data;
    } catch (error: any) {
      console.error('❌ Exception validating AxieStudio:', error);
      return null;
    }
  }, [user]);

  // Initialize and set up real-time updates
  useEffect(() => {
    if (user?.id) {
      // Initial load
      getUnifiedAccess();
      
      // Ensure trial dates are correct
      ensureCorrectTrialDates();

      // Set up periodic refresh (every 30 seconds for real-time countdown)
      const interval = setInterval(() => {
        getUnifiedAccess();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [user?.id, getUnifiedAccess, ensureCorrectTrialDates]);

  // Real-time subscription to user state changes
  useEffect(() => {
    if (!user?.id) return;

    const subscription = supabase
      .channel('user_state_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_account_state',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('🔄 User state changed, refreshing access...');
          getUnifiedAccess();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stripe_subscriptions',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('🔄 Subscription changed, refreshing access...');
          getUnifiedAccess();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, getUnifiedAccess]);

  return {
    // State
    access,
    loading,
    error,
    lastRefresh,
    
    // Actions
    getUnifiedAccess,
    validateSecurity,
    getSecureTrialRemaining,
    atomicStateUpdate,
    checkSuperAdmin,
    ensureCorrectTrialDates,
    validateAxieStudioCreation,
    
    // Computed properties
    hasAccess: access?.has_access || false,
    accessType: access?.access_type || 'expired',
    canCreateAxieStudio: access?.can_create_axiestudio_account || false,
    isSuperAdmin: access?.is_super_admin || false,
    isReturningUser: access?.is_returning_user || false,
    trialDaysRemaining: access?.trial_days_remaining || 0,
    trialSecondsRemaining: access?.trial_seconds_remaining || 0,
    trialStatus: access?.trial_status || 'expired',
    subscriptionStatus: access?.subscription_status || 'none',
    isTrialActive: access?.trial_status === 'active',
    isSubscriptionActive: access?.subscription_status === 'active',
    needsSubscription: !access?.has_access && access?.is_returning_user
  };
}
