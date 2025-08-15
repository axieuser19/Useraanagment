import React, { useState } from 'react';
import { StripeProduct } from '../stripe-config';
import { Check, Loader2, Crown, Gift, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserAccess } from '../hooks/useUserAccess';

interface ProductCardProps {
  product: StripeProduct;
  isCurrentPlan?: boolean;
}

export function ProductCard({ product, isCurrentPlan = false }: ProductCardProps) {
  const [loading, setLoading] = useState(false);
  const { refetch: refetchAccess } = useUserAccess();

  const isStandardProduct = false; // Standard plan hidden
  const isLimitedTimeProduct = product.name === 'Limited Time';

  const cardColor = isStandardProduct ? 'border-green-600' :
                   isLimitedTimeProduct ? 'border-purple-600' : 'border-black';
  const shadowColor = isStandardProduct ? 'rgba(34,197,94,1)' :
                     isLimitedTimeProduct ? 'rgba(147,51,234,1)' : 'rgba(0,0,0,1)';
  const iconBg = isStandardProduct ? 'bg-green-600' :
                isLimitedTimeProduct ? 'bg-purple-600' : 'bg-black';
  const buttonBg = isStandardProduct ? 'bg-green-600 hover:bg-green-700' :
                  isLimitedTimeProduct ? 'bg-purple-600 hover:bg-purple-700' : 'bg-black hover:bg-gray-800';

  const handlePurchase = async () => {
    // Handle standard product differently
    if (product.id === 'standard_product') {
      const confirmPause = confirm('Switching to Standard will pause your AxieStudio access but keep your account and data safe. You can reactivate anytime. Continue?');
      if (!confirmPause) return;
    }

    try {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to continue');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          price_id: product.priceId,
          mode: product.mode,
          success_url: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: window.location.href,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();

      if (url) {
        // Refresh access status before redirecting
        refetchAccess();
        window.location.href = url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      alert(error.message || 'Failed to start checkout process');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative bg-white border-4 ${cardColor} rounded-none shadow-[12px_12px_0px_0px_${shadowColor}] transition-all duration-300 hover:shadow-[16px_16px_0px_0px_${shadowColor}] hover:translate-x-[-4px] hover:translate-y-[-4px] ${
      isCurrentPlan
        ? isStandardProduct ? 'bg-green-50' : 'bg-green-50'
        : 'hover:bg-gray-50'
    }`}>
      {isStandardProduct && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <div className="bg-green-600 text-white px-6 py-2 rounded-none text-sm font-bold uppercase tracking-wide flex items-center gap-2 border-2 border-green-600">
            <Gift className="w-4 h-4" />
            FREE TIER
          </div>
        </div>
      )}

      {isCurrentPlan && !isStandardProduct && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <div className="bg-black text-white px-6 py-2 rounded-none text-sm font-bold uppercase tracking-wide flex items-center gap-2 border-2 border-black">
            <Check className="w-4 h-4" />
            ACTIVE
          </div>
        </div>
      )}

      <div className="p-8">
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-20 h-20 ${iconBg} text-white rounded-none mb-6`}>
            {isStandardProduct ? <Gift className="w-10 h-10" /> :
             isLimitedTimeProduct ? <Zap className="w-10 h-10" /> :
             <Crown className="w-10 h-10" />}
          </div>
          <h3 className="text-3xl font-bold text-black mb-3 uppercase tracking-wide">{product.name}</h3>
          <p className="text-gray-600 mb-6 text-lg">{product.description}</p>

          <div className="mb-8">
            {isStandardProduct ? (
              <>
                <span className="text-5xl font-bold text-green-600">FREE</span>
                <div className="mt-3 inline-block bg-green-100 text-green-800 px-4 py-2 border-2 border-green-800 rounded-none">
                  <span className="text-sm font-bold uppercase tracking-wide">PAUSE SUBSCRIPTION</span>
                </div>
              </>
            ) : (
              <>
                <span className="text-5xl font-bold text-black">${product.price}</span>
                {product.mode === 'subscription' && (
                  <span className="text-gray-600 ml-2 text-xl">/month</span>
                )}
                <div className="mt-3 inline-block bg-green-100 text-green-800 px-4 py-2 border-2 border-green-800 rounded-none">
                  <span className="text-sm font-bold uppercase tracking-wide">FULL ACCESS</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4 mb-8">
          {isStandardProduct ? (
            <>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-600 flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">Keep your account & data safe</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-600 flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">No monthly charges</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-600 flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">Reactivate anytime</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-600 flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">AxieStudio access paused</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-black flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">Advanced AI workflow builder</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-black flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">Custom integrations & APIs</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-black flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">Unlimited workflow executions</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-black flex items-center justify-center rounded-none">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-black font-medium">7-day free trial included</span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handlePurchase}
          disabled={loading || (isCurrentPlan && !isStandardProduct)}
          className={`w-full py-4 px-6 rounded-none font-bold uppercase tracking-wide transition-all duration-200 border-2 ${
            isStandardProduct
              ? `border-green-600 ${
                  isCurrentPlan
                    ? 'bg-green-100 text-green-800 cursor-not-allowed'
                    : loading
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-[4px_4px_0px_0px_rgba(34,197,94,0.3)] hover:translate-x-[-2px] hover:translate-y-[-2px]'
                }`
              : isLimitedTimeProduct
              ? `border-purple-600 ${
                  isCurrentPlan
                    ? 'bg-green-100 text-green-800 cursor-not-allowed'
                    : loading
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-[4px_4px_0px_0px_rgba(147,51,234,0.3)] hover:translate-x-[-2px] hover:translate-y-[-2px]'
                }`
              : `border-black ${
                  isCurrentPlan
                    ? 'bg-green-100 text-green-800 cursor-not-allowed'
                    : loading
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-black text-white hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[-2px] hover:translate-y-[-2px]'
                }`
          }`}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              PROCESSING...
            </div>
          ) : isCurrentPlan ? (
            isStandardProduct ? 'CURRENT PLAN' : 'CURRENT PLAN'
          ) : (
            isStandardProduct ? 'PAUSE SUBSCRIPTION' : `GET ${product.name.toUpperCase()}`
          )}
        </button>
      </div>
    </div>
  );
}