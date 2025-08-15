import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { getProductByPriceId } from '../stripe-config';
import { isSuperAdmin } from '../utils/adminAuth';

export interface UserSubscription {
  customer_id: string;
  subscription_id: string | null;
  subscription_status: 'not_started' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  price_id: string | null;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  product_name?: string;
  is_team_member?: boolean;
  team_name?: string;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    // 👑 SUPER ADMIN OVERRIDE: Give PRO subscription with infinite time
    if (isSuperAdmin(user.id)) {
      console.log('👑 SUPER ADMIN DETECTED: Granting PRO subscription with infinite time');
      const adminSubscription: UserSubscription = {
        customer_id: 'cus_admin_' + user.id,
        subscription_id: 'sub_admin_pro_' + user.id,
        subscription_status: 'active',
        price_id: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'your_stripe_pro_price_id_here',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 60 * 60), // 100 years
        cancel_at_period_end: false,
        payment_method_brand: 'Admin',
        payment_method_last4: '****',
        product_name: 'Go Pro'
      };

      setSubscription(adminSubscription);
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔄 Fetching subscription for user:', user.id);

        // 👥 CHECK TEAM MEMBERSHIP FIRST (SIMPLIFIED TO AVOID RLS RECURSION)
        let teamMembership = null;
        try {
          // First, check if user is a team member
          const { data: memberData, error: memberError } = await supabase
            .from('team_members')
            .select('team_id, role, status')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();

          if (memberData && !memberError) {
            // Then get team and subscription info separately
            const { data: teamData, error: teamError } = await supabase
              .from('teams')
              .select('name, admin_user_id, status')
              .eq('id', memberData.team_id)
              .single();

            const { data: teamSubData, error: teamSubError } = await supabase
              .from('team_subscriptions')
              .select('stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, price_id')
              .eq('team_id', memberData.team_id)
              .single();

            if (teamData && teamSubData && !teamError && !teamSubError) {
              teamMembership = {
                ...memberData,
                teams: {
                  ...teamData,
                  team_subscriptions: teamSubData
                }
              };
            }
          }
        } catch (error) {
          console.warn('⚠️ Team membership check failed (using fallback):', error);
        }

        // 🎯 TEAM MEMBER SUBSCRIPTION: If user is active team member
        if (teamMembership?.teams?.team_subscriptions?.status === 'active') {
          console.log('👥 TEAM MEMBER DETECTED: Using team subscription');
          const teamSubscription: UserSubscription = {
            customer_id: teamMembership.teams.team_subscriptions.stripe_customer_id,
            subscription_id: teamMembership.teams.team_subscriptions.stripe_subscription_id,
            subscription_status: 'active',
            price_id: teamMembership.teams.team_subscriptions.price_id,
            current_period_start: teamMembership.teams.team_subscriptions.current_period_start,
            current_period_end: teamMembership.teams.team_subscriptions.current_period_end,
            cancel_at_period_end: teamMembership.teams.team_subscriptions.cancel_at_period_end,
            payment_method_brand: 'Team',
            payment_method_last4: '****',
            product_name: 'Team Pro (Member)',
            is_team_member: true,
            team_name: teamMembership.teams.name
          };

          setSubscription(teamSubscription);
          setLoading(false);
          return;
        }

        // Try the view first, fallback to base tables if not available
        let data, fetchError;

        try {
          const result = await supabase
            .from('stripe_user_subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          data = result.data;
          fetchError = result.error;
        } catch (viewError) {
          console.warn('View not available, using fallback:', viewError);
          fetchError = viewError;
        }

        if (data && !fetchError) {
          console.log('✅ Successfully fetched from fixed stripe_user_subscriptions view:', data);

          // Add product name if we have a price_id
          const product = data.price_id ? getProductByPriceId(data.price_id) : null;
          setSubscription({
            ...data,
            product_name: product?.name,
          });
          return;
        }

        console.log('⚠️ Fixed view failed, trying base tables fallback:', fetchError);

        // Fallback: Query base tables directly with manual join
        const { data: customerData, error: customerError } = await supabase
          .from('stripe_customers')
          .select('customer_id')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .maybeSingle();

        if (customerError) {
          console.warn('Customer query failed:', customerError);
          setSubscription(null);
          return;
        }

        if (customerData) {
          // Query most recent active subscription
          const { data: subscriptionData, error: subscriptionError } = await supabase
            .from('stripe_subscriptions')
            .select('*')
            .eq('customer_id', customerData.customer_id)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (subscriptionError) {
            console.warn('Subscription query failed:', subscriptionError);
            setSubscription(null);
            return;
          }

          const enrichedData: UserSubscription = {
            customer_id: customerData.customer_id,
            subscription_id: subscriptionData?.subscription_id || null,
            subscription_status: subscriptionData?.status || 'not_started',
            price_id: subscriptionData?.price_id || null,
            current_period_start: subscriptionData?.current_period_start || null,
            current_period_end: subscriptionData?.current_period_end || null,
            cancel_at_period_end: subscriptionData?.cancel_at_period_end || false,
            payment_method_brand: subscriptionData?.payment_method_brand || null,
            payment_method_last4: subscriptionData?.payment_method_last4 || null,
          };

          // Add product name if we have a price_id
          const product = enrichedData.price_id ? getProductByPriceId(enrichedData.price_id) : null;
          setSubscription({
            ...enrichedData,
            product_name: product?.name,
          });

          console.log('✅ Fallback: Successfully fetched from base tables:', enrichedData);
        } else {
          console.log('ℹ️ No customer found for user');
          setSubscription(null);
        }
      } catch (err) {
        console.error('Error fetching subscription:', err);
        setSubscription(null);
        setError(null); // Don't show errors to user
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [user]);

  const hasActiveSubscription = subscription?.subscription_status === 'active';
  const isTrialing = subscription?.subscription_status === 'trialing';
  const isPastDue = subscription?.subscription_status === 'past_due';
  const isCanceled = subscription?.cancel_at_period_end === true || subscription?.subscription_status === 'canceled';

  return {
    subscription,
    loading,
    error,
    hasActiveSubscription,
    isTrialing,
    isPastDue,
    isCanceled,
    refetch: () => {
      if (user) {
        setLoading(true);
      }
    },
  };
}