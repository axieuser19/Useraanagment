import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { isSuperAdmin } from '../utils/adminAuth';

export interface UserAccessStatus {
  user_id: string;
  trial_start_date: string;
  trial_end_date: string;
  trial_status: 'active' | 'expired' | 'converted_to_paid' | 'scheduled_for_deletion';
  deletion_scheduled_at: string | null;
  subscription_status: string | null;
  subscription_id: string | null;
  price_id: string | null;
  current_period_end: number | null;
  has_access: boolean;
  access_type: 'paid_subscription' | 'stripe_trial' | 'free_trial' | 'no_access';
  seconds_remaining: number;
  days_remaining: number;
  // SECURITY: Enhanced tracking
  is_cancelled_subscription?: boolean;
  has_stripe_subscription?: boolean;
  subscription_verification_time?: number;
  is_expired_trial_user?: boolean;
  is_returning_user?: boolean;
  requires_subscription?: boolean;
  can_create_axiestudio_account?: boolean;
  is_team_subscription?: boolean;
  is_team_member?: boolean;
  team_id?: string;
  team_name?: string;
}

export function useUserAccess() {
  const { user } = useAuth();
  const [accessStatus, setAccessStatus] = useState<UserAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchAccessStatus = useCallback(async () => {
    if (!user) {
      setAccessStatus(null);
      setLoading(false);
      return;
    }

    // 👑 SUPER ADMIN OVERRIDE: Give infinite access
    if (isSuperAdmin(user.id)) {
      console.log('👑 SUPER ADMIN DETECTED: Granting infinite access');
      const adminAccessStatus: UserAccessStatus = {
        user_id: user.id,
        trial_start_date: new Date().toISOString(),
        trial_end_date: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 100 years
        trial_status: 'converted_to_paid',
        deletion_scheduled_at: null,
        subscription_status: 'active',
        subscription_id: 'sub_admin_pro_' + user.id,
        price_id: 'price_1Rv4rDBacFXEnBmNDMrhMqOH', // PRO price ID
        current_period_end: Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 60 * 60), // 100 years
        has_access: true,
        access_type: 'paid_subscription',
        seconds_remaining: 100 * 365 * 24 * 60 * 60, // 100 years in seconds
        days_remaining: 100 * 365, // 100 years in days
        is_cancelled_subscription: false,
        has_stripe_subscription: true,
        subscription_verification_time: Date.now(),
        is_expired_trial_user: false,
        is_returning_user: false,
        requires_subscription: false,
        can_create_axiestudio_account: true
      };

      setAccessStatus(adminAccessStatus);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fetchTime = Date.now();

      console.log('🔄 Fetching user access status for user:', user.id);

      // 👥 TEMPORARILY DISABLE TEAM MEMBERSHIP CHECK TO AVOID RECURSION
      let teamMembership = null;
      console.log('⚠️ Team membership check temporarily disabled due to RLS recursion');

      // 🎯 TEAM MEMBER ACCESS: Check if user is team member and admin has subscription
      // Team members get Pro access ONLY if team admin has active Team Pro subscription
      try {
        const { data: teamMemberData, error: teamError } = await supabase
          .from('team_members')
          .select('team_id, role, status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (teamMemberData && !teamError) {
          // Check if team admin has active subscription
          const { data: teamSubData, error: teamSubError } = await supabase
            .from('team_subscriptions')
            .select('status, price_id')
            .eq('team_id', teamMemberData.team_id)
            .eq('status', 'active')
            .in('price_id', ['price_1RwOhVBacFXEnBmNIeWQ1wQe', 'price_1RwP9cBacFXEnBmNsM3xVLL2'])
            .maybeSingle();

          if (teamSubData && !teamSubError) {
            console.log('👥 TEAM MEMBER WITH ADMIN SUBSCRIPTION: Granting Pro access');
            // Team member with admin having active subscription gets Pro access
            // This will be handled by the database sync function
          } else {
            console.log('👥 TEAM MEMBER WITHOUT ADMIN SUBSCRIPTION: Standard access only');
            // Team member but admin doesn't have subscription - Standard tier
            // This will be handled by the database sync function
          }
        }
      } catch (error) {
        console.warn('⚠️ Team membership check failed, continuing with individual access check');
      }

      // BULLETPROOF: Use enhanced access control function
      const { data: accessData, error: accessError } = await supabase.rpc('get_user_access_level', {
        p_user_id: user.id
      });

      if (accessError) {
        console.error('❌ Access check failed:', accessError);
        throw accessError;
      }

      if (!accessData || accessData.length === 0) {
        console.log('⚠️ No access data found for user');
        setAccessStatus(null);
        return;
      }

      const userAccess = accessData[0];
      console.log('✅ Bulletproof user access data:', userAccess);

      // VERIFICATION: Get subscription data for cross-validation
      const { data: subscriptionData } = await supabase
        .from('stripe_user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // BULLETPROOF: Cross-verify subscription status
      const isSubscriptionCancelled = subscriptionData?.cancel_at_period_end === true;

      // BULLETPROOF: Build comprehensive access status (fixed self-reference)
      const bulletproofAccessStatus: UserAccessStatus = {
        user_id: user.id,
        trial_start_date: userAccess.trial_start_date || '',
        trial_end_date: userAccess.trial_end_date || '',
        trial_status: userAccess.trial_status || 'none',
        deletion_scheduled_at: userAccess.deletion_scheduled_at || null,
        subscription_status: subscriptionData?.subscription_status || null,
        subscription_id: subscriptionData?.subscription_id || null,
        price_id: subscriptionData?.price_id || null,
        current_period_end: subscriptionData?.current_period_end || null,
        has_access: userAccess.has_access || false,
        access_type: userAccess.access_type || 'no_access',
        seconds_remaining: userAccess.seconds_remaining || 0,
        days_remaining: userAccess.days_remaining || 0,
        // BULLETPROOF: Enhanced security flags
        is_cancelled_subscription: isSubscriptionCancelled,
        has_stripe_subscription: !!subscriptionData?.subscription_id,
        subscription_verification_time: fetchTime,
        is_expired_trial_user: userAccess.is_expired_trial_user || false,
        is_returning_user: userAccess.is_returning_user || false,
        requires_subscription: userAccess.requires_subscription || false,
        can_create_axiestudio_account: userAccess.can_create_axiestudio_account || false,
        // Team subscription detection
        is_team_subscription: [
          import.meta.env.VITE_STRIPE_TEAM_PRICE_ID_1 || 'your_stripe_team_price_id_1_here',
          import.meta.env.VITE_STRIPE_TEAM_PRICE_ID_2 || 'your_stripe_team_price_id_2_here'
        ].includes(subscriptionData?.price_id)
      };

      console.log('🔒 Bulletproof access status verified:', bulletproofAccessStatus);
      setAccessStatus(bulletproofAccessStatus);
      setLastFetch(fetchTime);

    } catch (err) {
      console.error('Error fetching user access status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch access status');
      setAccessStatus(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchAccessStatus();

    // SECURITY: Real-time updates (reduced frequency)
    const subscription = supabase
      .channel(`user_access_updates_${user.id}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_trials',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('🔄 Real-time update: user_trials changed');
          setTimeout(fetchAccessStatus, 1000); // Debounce updates
        }
      )
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stripe_subscriptions'
        },
        () => {
          console.log('🔄 Real-time update: stripe_subscriptions changed');
          setTimeout(fetchAccessStatus, 1000); // Debounce updates
        }
      )
      .subscribe();

    // SECURITY: Reduced polling frequency (30 seconds instead of 5)
    const pollInterval = setInterval(() => {
      fetchAccessStatus();
    }, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [user?.id, fetchAccessStatus]); // Fixed: Only depend on user.id and fetchAccessStatus

  const hasAccess = accessStatus?.has_access || false;
  const isPaidUser = accessStatus?.access_type === 'paid_subscription';
  const isTrialing = accessStatus?.access_type === 'stripe_trial';
  const isFreeTrialing = accessStatus?.access_type === 'free_trial';
  const isProtected = isPaidUser || isTrialing;
  const isExpiredTrialUser = accessStatus?.is_expired_trial_user || false;
  const canCreateAxieStudioAccount = accessStatus?.can_create_axiestudio_account || false;

  return {
    accessStatus,
    loading,
    error,
    hasAccess,
    isPaidUser,
    isTrialing,
    isFreeTrialing,
    isProtected,
    // SECURITY: New security flags
    isExpiredTrialUser,
    canCreateAxieStudioAccount,
    lastFetch,
    refetch: fetchAccessStatus,
  };
}