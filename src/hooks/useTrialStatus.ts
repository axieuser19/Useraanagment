import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useUnifiedAccess } from './useUnifiedAccess';

export interface TrialInfo {
  user_id: string;
  trial_start_date: string;
  trial_end_date: string;
  trial_status: 'active' | 'expired' | 'converted_to_paid' | 'scheduled_for_deletion' | 'canceled' | 'not_eligible';
  deletion_scheduled_at: string | null;
  seconds_remaining: number;
  days_remaining: number;
  is_returning_user: boolean;
  trial_allowed: boolean;
}

export function useTrialStatus() {
  const { user } = useAuth();
  const {
    access,
    loading: accessLoading,
    getSecureTrialRemaining,
    ensureCorrectTrialDates
  } = useUnifiedAccess();

  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get secure trial information using new unified system
  const getTrialInfo = useCallback(async () => {
    if (!user?.id) {
      setTrialInfo(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Getting secure trial info for user:', user.id);

      // Use the new secure trial calculation
      const secureTrialData = await getSecureTrialRemaining();

      if (!secureTrialData) {
        setError('Failed to get trial information');
        return;
      }

      // Convert to TrialInfo format
      const trialInfo: TrialInfo = {
        user_id: user.id,
        trial_start_date: secureTrialData.trial_start_date || access?.trial_start_date || '',
        trial_end_date: secureTrialData.trial_end_date || access?.trial_end_date || '',
        trial_status: secureTrialData.trial_status || 'expired',
        deletion_scheduled_at: null, // Will be set by subscription system
        seconds_remaining: secureTrialData.seconds_remaining || 0,
        days_remaining: secureTrialData.days_remaining || 0,
        is_returning_user: secureTrialData.is_returning_user || false,
        trial_allowed: secureTrialData.trial_allowed || false
      };

      console.log('✅ Secure trial info retrieved:', trialInfo);
      setTrialInfo(trialInfo);

    } catch (err) {
      console.error('❌ Error getting secure trial info:', err);
      setError(err instanceof Error ? err.message : 'Failed to get trial info');
      setTrialInfo(null);
    } finally {
      setLoading(false);
    }
  }, [user, getSecureTrialRemaining, access]);

  // Initialize trial info
  useEffect(() => {
    if (user?.id && !accessLoading) {
      getTrialInfo();
    }
  }, [user?.id, accessLoading, getTrialInfo]);

  // Update trial info when unified access changes
  useEffect(() => {
    if (access && user?.id) {
      const trialInfo: TrialInfo = {
        user_id: user.id,
        trial_start_date: access.trial_start_date || '',
        trial_end_date: access.trial_end_date || '',
        trial_status: access.trial_status || 'expired',
        deletion_scheduled_at: null,
        seconds_remaining: access.trial_seconds_remaining || 0,
        days_remaining: access.trial_days_remaining || 0,
        is_returning_user: access.is_returning_user || false,
        trial_allowed: !access.is_returning_user
      };

      setTrialInfo(trialInfo);
      setLoading(false);
    }
  }, [access, user]);

  return {
    trialInfo,
    loading: loading || accessLoading,
    error,
    getTrialInfo,

    // Computed properties using new unified system
    isTrialActive: trialInfo?.trial_status === 'active',
    isTrialExpired: trialInfo?.trial_status === 'expired',
    isTrialNotEligible: trialInfo?.trial_status === 'not_eligible',
    isReturningUser: trialInfo?.is_returning_user || false,
    trialAllowed: trialInfo?.trial_allowed || false,
    daysRemaining: trialInfo?.days_remaining || 0,
    secondsRemaining: trialInfo?.seconds_remaining || 0,
    trialEndDate: trialInfo?.trial_end_date,
    trialStartDate: trialInfo?.trial_start_date,
    isDeletionScheduled: !!trialInfo?.deletion_scheduled_at,

    // Enhanced properties from unified access
    hasAccess: access?.has_access || false,
    accessType: access?.access_type || 'expired',
    canCreateAxieStudio: access?.can_create_axiestudio_account || false,
    subscriptionStatus: access?.subscription_status || 'none',

    // Legacy compatibility
    isScheduledForDeletion: trialInfo?.trial_status === 'scheduled_for_deletion',
    hasConvertedToPaid: trialInfo?.trial_status === 'converted_to_paid',
    isCanceled: trialInfo?.trial_status === 'canceled'
  };
}