import { useState } from 'react';
import { AlertTriangle, X, Loader2, RefreshCw, Crown, ArrowRight } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useUserAccess } from '../hooks/useUserAccess';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export function SubscriptionManagement() {
  const { subscription, hasActiveSubscription, isCanceled, refetch } = useSubscription();
  const { isPaidUser, isTrialing, isFreeTrialing } = useUserAccess();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [resubscribing, setResubscribing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleCancelSubscription = async () => {
    if (!subscription?.subscription_id) {
      setError('No subscription ID found');
      return;
    }

    setCanceling(true);
    setError(null);

    try {
      console.log('🔄 Canceling subscription:', subscription.subscription_id);

      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: { subscription_id: subscription.subscription_id }
      });

      console.log('📡 Function response:', { data, error });

      if (error) {
        console.error('❌ Function error:', error);
        throw new Error(error.message || 'Failed to cancel subscription');
      }

      if (data?.error) {
        console.error('❌ Data error:', data.error);
        throw new Error(data.error);
      }

      console.log('✅ Subscription canceled successfully:', data);
      alert('✅ Subscription canceled! Your account will be deleted when your current period ends.');
      setShowCancelModal(false);
      refetch(); // Refresh subscription data

      // 🔧 FIX: Use state management instead of hard reload
      // Trigger global state refresh
      window.dispatchEvent(new CustomEvent('userSubscriptionChanged', {
        detail: { action: 'cancelled', timestamp: Date.now() }
      }));
    } catch (err) {
      console.error('❌ Error canceling subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setCanceling(false);
    }
  };

  const handleManageSubscription = async () => {
    setOpeningPortal(true);
    setError(null);

    try {
      console.log('🔄 Creating authenticated Stripe portal session...');

      // Use the API to create an authenticated portal session
      const { data, error } = await supabase.functions.invoke('create-portal-session');

      console.log('📡 Portal response:', { data, error });

      if (error) {
        console.error('❌ Portal error:', error);
        throw new Error(error.message || 'Failed to open customer portal');
      }

      if (data?.error) {
        console.error('❌ Portal data error:', data.error);
        throw new Error(data.error);
      }

      if (data?.portal_url) {
        console.log('✅ Opening STRIPE CUSTOMER PORTAL:', data.portal_url);
        console.log('🔗 This is the official Stripe Customer Portal where users can manage their subscription');
        window.open(data.portal_url, '_blank');
      } else {
        throw new Error('No portal URL received');
      }

    } catch (err) {
      console.error('❌ Error opening portal:', err);
      setError(err instanceof Error ? err.message : 'Failed to open customer portal');
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleResubscribe = async () => {
    setResubscribing(true);
    setError(null);

    try {
      console.log('🔄 Starting bulletproof resubscribe process...');

      // BULLETPROOF FIX: Always create NEW subscription for proper billing
      const { data, error } = await supabase.functions.invoke('create-new-subscription', {
        body: { 
          price_id: import.meta.env.VITE_STRIPE_PRO_PRICE_ID 
        }
      });

      console.log('📡 Bulletproof resubscribe response:', { data, error });

      if (error) {
        console.error('❌ Resubscribe error:', error);
        throw new Error(error.message || 'Failed to create new subscription');
      }

      if (data?.error) {
        console.error('❌ Resubscribe data error:', data.error);
        throw new Error(data.error);
      }

      if (data?.checkout_url) {
        console.log('✅ Bulletproof resubscribe checkout created');
        // Redirect to Stripe checkout for NEW subscription (proper billing)
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }

    } catch (err) {
      console.error('❌ Error in bulletproof resubscribe:', err);
      setError(err instanceof Error ? err.message : 'Failed to create new subscription');
    } finally {
      setResubscribing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      refetch();
      console.log('✅ Subscription status refreshed');
      // 🔧 FIX: Use state management instead of hard reload
      window.dispatchEvent(new CustomEvent('forceRefreshAllData'));
    } catch (err) {
      console.error('❌ Error refreshing subscription:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // 🎯 CLEAR SUBSCRIPTION LOGIC
  // Check if user has EVER had a subscription (current or past)
  const hasEverSubscribed = subscription?.subscription_id || subscription?.customer_id || isPaidUser;

  // Check if user is team member
  const isTeamMember = subscription?.is_team_member || false;

  // Determine current state
  const isCurrentlyActive = hasActiveSubscription && !isCanceled;
  const isCurrentlyCancelled = isCanceled || subscription?.cancel_at_period_end;
  const isTrialOnly = (isFreeTrialing || isTrialing) && !hasEverSubscribed && !isTeamMember;

  // Debug logging (remove in production)
  console.log('🎯 SUBSCRIPTION MANAGEMENT LOGIC:', {
    hasEverSubscribed,
    isCurrentlyActive,
    isCurrentlyCancelled,
    isTrialOnly
  });

  return (
    <>
      {/* TEAM MEMBER STATUS TEMPORARILY HIDDEN */}
      {/* {isTeamMember && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-none">
              <Users className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-blue-900 uppercase tracking-wide">TEAM MEMBER ACCESS</h3>
              <p className="text-blue-700 text-sm mt-1">
                You have Pro access through your team membership: {subscription?.team_name}
              </p>
            </div>
            <Link
              to="/team"
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-none font-bold hover:bg-blue-700 transition-colors uppercase tracking-wide"
            >
              <Users className="w-4 h-4" />
              TEAM DASHBOARD
            </Link>
          </div>

          <div className="mt-4 pt-4 border-t-2 border-blue-300">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-blue-800 font-bold">TEAM BENEFITS:</p>
                <ul className="text-blue-700 mt-1 space-y-1">
                  <li>• Full Pro feature access</li>
                  <li>• AxieStudio account included</li>
                  <li>• Team collaboration tools</li>
                </ul>
              </div>
              <div>
                <p className="text-blue-800 font-bold">BILLING:</p>
                <p className="text-blue-700 mt-1">
                  Managed by your team administrator. No individual billing required.
                </p>
              </div>
            </div>
          </div>
        </div>
      )} */}

      {/* 🎯 SITUATION 1: Trial User (Never Subscribed) - Show Upgrade */}
      {isTrialOnly && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-none p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-none">
              <Crown className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-blue-900 uppercase tracking-wide">UPGRADE TO PRO</h3>
              <p className="text-blue-700 text-sm mt-1">
                Unlock unlimited access to all AI workflow features
              </p>
            </div>
            <Link
              to="/products"
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-none font-bold hover:bg-blue-700 transition-colors uppercase tracking-wide"
            >
              UPGRADE NOW
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* 🎯 SITUATION 2: Active Premium User - Show Portal + Cancellation */}
      {hasEverSubscribed && isCurrentlyActive && (
        <div className="space-y-4">
          <div className="bg-green-50 border-2 border-green-200 rounded-none p-4">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
              <div>
                <p className="text-green-800 font-bold">Premium Subscription Active</p>
                <p className="text-green-700 text-sm">Your premium subscription is active and ready to use.</p>
              </div>
            </div>
          </div>

          {/* Subscription Management Portal */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="font-bold text-blue-900 uppercase tracking-wide">💳 STRIPE CUSTOMER PORTAL</h3>
                <p className="text-blue-700 text-sm mt-1">
                  Access the official Stripe Customer Portal to manage your subscription, update payment methods, and view invoices.
                </p>
                <div className="mt-3 flex gap-3 items-center">
                  <button
                    onClick={handleManageSubscription}
                    disabled={openingPortal}
                    className="bg-blue-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-blue-700 disabled:bg-blue-400 transition-colors border-2 border-blue-700"
                  >
                    {openingPortal ? '🔄 OPENING STRIPE PORTAL...' : '🔗 OPEN STRIPE PORTAL'}
                  </button>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="bg-gray-600 text-white px-3 py-2 font-bold uppercase tracking-wide hover:bg-gray-700 disabled:bg-gray-400 transition-colors border-2 border-gray-700"
                    title="Refresh subscription status"
                  >
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>


          {/* Cancel Subscription Option */}
          <div className="bg-red-50 border-2 border-red-200 rounded-none p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-900 uppercase tracking-wide">CANCEL SUBSCRIPTION</h3>
                <p className="text-red-700 text-sm mt-1">
                  Cancel your subscription. Your account will remain active until the current period ends.
                </p>
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="mt-3 bg-red-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-red-700 transition-colors border-2 border-red-700"
                >
                  �️ CANCEL SUBSCRIPTION
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 SITUATION 3: Cancelled User - Show Portal + Resubscribe */}
      {hasEverSubscribed && isCurrentlyCancelled && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-none p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="text-yellow-800 font-bold">Subscription Cancelled</p>
                <p className="text-yellow-700 text-sm">Your subscription is cancelled and will end at the current period.</p>
              </div>
            </div>
          </div>

          {/* Portal Access */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="font-bold text-blue-900 uppercase tracking-wide">💳 STRIPE CUSTOMER PORTAL</h3>
                <p className="text-blue-700 text-sm mt-1">
                  Access the official Stripe Customer Portal to view your subscription details and billing history.
                </p>
                <button
                  onClick={handleManageSubscription}
                  disabled={openingPortal}
                  className="mt-3 bg-blue-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-blue-700 disabled:bg-blue-400 transition-colors border-2 border-blue-700"
                >
                  {openingPortal ? '🔄 OPENING STRIPE PORTAL...' : '🔗 OPEN STRIPE PORTAL'}
                </button>
              </div>
            </div>
          </div>

          {/* Resubscribe option */}
          <div className="bg-green-50 border-2 border-green-200 rounded-none p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="font-bold text-green-900 uppercase tracking-wide">🔄 REACTIVATE SUBSCRIPTION</h3>
                <p className="text-green-700 text-sm mt-1">
                  Changed your mind? Reactivate your subscription and get credit for remaining time!
                </p>
                <button
                  onClick={handleResubscribe}
                  disabled={resubscribing}
                  className="mt-3 bg-green-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-green-700 disabled:bg-green-400 transition-colors border-2 border-green-700"
                >
                  {resubscribing ? '🔄 REACTIVATING...' : '✅ RE-SUBSCRIBE NOW'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-none p-4 mt-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-red-800 font-bold">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-4 border-black max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase tracking-wide">⚠️ CANCEL SUBSCRIPTION</h2>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-gray-500 hover:text-black"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-red-50 border-2 border-red-600 p-6">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-red-900 font-bold text-lg mb-2">🚨 CRITICAL WARNING: ACCOUNT CONSEQUENCES</p>
                    <p className="text-red-800 font-medium mb-3">
                      Canceling your subscription will have the following consequences:
                    </p>
                  </div>
                </div>

                <div className="bg-red-100 border-2 border-red-300 p-4 mb-4">
                  <h4 className="text-red-900 font-bold mb-2">📅 IMMEDIATE EFFECTS:</h4>
                  <ul className="text-red-800 text-sm space-y-1">
                    <li>• ✅ Your subscription will be marked for cancellation</li>
                    <li>• ✅ You keep access until your current period ends</li>
                    <li>• ⏰ Account deletion scheduled 24 hours after period ends</li>
                  </ul>
                </div>

                <div className="bg-red-200 border-2 border-red-400 p-4 mb-4">
                  <h4 className="text-red-900 font-bold mb-2">🗑️ AFTER PERIOD ENDS + 24 HOURS:</h4>
                  <ul className="text-red-800 text-sm space-y-1">
                    <li>• ❌ Your main account will be permanently deleted</li>
                    <li>• ❌ All subscription and billing data removed</li>
                    <li>• ⚠️ Your AxieStudio account will be DEACTIVATED (not deleted)</li>
                    <li>• 💾 AxieStudio data preserved but requires admin reactivation</li>
                  </ul>
                </div>

                <div className="bg-yellow-100 border-2 border-yellow-400 p-4">
                  <h4 className="text-yellow-900 font-bold mb-2">🔄 RESUBSCRIPTION POLICY:</h4>
                  <ul className="text-yellow-800 text-sm space-y-1">
                    <li>• ✅ You can resubscribe with the same email</li>
                    <li>• ⚠️ AxieStudio account requires manual reactivation</li>
                    <li>• 📧 Contact support to restore AxieStudio access</li>
                    <li>• 💰 No free trial - immediate subscription required</li>
                  </ul>
                </div>
              </div>

              {error && (
                <div className="bg-red-100 border-2 border-red-300 p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 bg-gray-200 text-black px-4 py-2 font-bold uppercase tracking-wide hover:bg-gray-300 transition-colors border-2 border-gray-400"
                >
                  KEEP SUBSCRIPTION
                </button>
                <button
                  onClick={handleCancelSubscription}
                  disabled={canceling}
                  className="flex-1 bg-red-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-red-700 transition-colors border-2 border-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {canceling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      CREATING SUBSCRIPTION...
                    </>
                  ) : (
                    'CREATE NEW SUBSCRIPTION'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 UNIVERSAL: ANY user who has EVER subscribed gets portal access */}
      {hasEverSubscribed && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-4 uppercase tracking-wide">💳 SUBSCRIPTION MANAGEMENT</h3>

          {/* Always show Stripe Portal for anyone who has ever subscribed */}
          <div className="bg-white border-2 border-blue-300 rounded-none p-4 mb-4">
            <h4 className="font-bold text-blue-900 uppercase tracking-wide mb-2">🔗 STRIPE CUSTOMER PORTAL</h4>
            <p className="text-blue-700 text-sm mb-3">
              Access the official Stripe Customer Portal to manage your subscription, payment methods, and billing history.
            </p>
            <button
              onClick={handleManageSubscription}
              disabled={openingPortal}
              className="bg-blue-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-blue-700 disabled:bg-blue-400 transition-colors border-2 border-blue-700 mr-3"
            >
              {openingPortal ? '🔄 OPENING STRIPE PORTAL...' : '🔗 OPEN STRIPE PORTAL'}
            </button>
          </div>

          {/* Show Cancel/Resubscribe buttons based on current status */}
          <div className="bg-white border-2 border-blue-300 rounded-none p-4">
            <h4 className="font-bold text-blue-900 uppercase tracking-wide mb-2">⚙️ SUBSCRIPTION ACTIONS</h4>
            <div className="flex gap-3">
              {isCurrentlyActive && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="bg-red-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-red-700 transition-colors border-2 border-red-700"
                >
                  ❌ CANCEL SUBSCRIPTION
                </button>
              )}

              {isCurrentlyCancelled && (
                <button
                  onClick={handleResubscribe}
                  disabled={resubscribing}
                  className="bg-green-600 text-white px-4 py-2 font-bold uppercase tracking-wide hover:bg-green-700 disabled:bg-green-400 transition-colors border-2 border-green-700"
                >
                  {resubscribing ? '🔄 RESUBSCRIBING...' : '✅ RESUBSCRIBE'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🎯 FALLBACK: Only for users who have NEVER subscribed */}
      {!hasEverSubscribed && !isTrialOnly && (
        <div className="bg-gray-50 border-2 border-gray-200 rounded-none p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">GET STARTED</h3>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Start your journey with our premium AI workflow platform.
            </p>
            <div className="mt-4">
              <Link
                to="/products"
                className="bg-blue-600 text-white px-4 py-2 rounded-none font-bold hover:bg-blue-700 transition-colors uppercase tracking-wide"
              >
                VIEW PLANS
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
