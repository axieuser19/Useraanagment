import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Loader2, Eye, EyeOff, Crown } from 'lucide-react';
import { useAxieStudioAccount } from '../hooks/useAxieStudioAccount';
import { useUserAccess } from '../hooks/useUserAccess';
import { useEnvironment } from '../hooks/useEnvironment';
import { Link } from 'react-router-dom';

interface CreateAxieStudioButtonProps {
  className?: string;
  onAccountCreated?: () => void;
}

export function CreateAxieStudioButton({ className = '', onAccountCreated }: CreateAxieStudioButtonProps) {
  const { showCreateButton, markCreateClicked } = useAxieStudioAccount();
  const { hasAccess, accessStatus } = useUserAccess();
  const { getConfig } = useEnvironment();
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't render if user has already created an account
  if (!showCreateButton) {
    return null;
  }

  // 🚨 BULLETPROOF ACCESS CONTROL: Enhanced security checks
  const isExpiredTrialUser = accessStatus?.trial_status === 'expired' ||
                             accessStatus?.trial_status === 'scheduled_for_deletion';

  // 🚨 CRITICAL FIX: Cancelled subscriptions should have access until period ends
  const hasActiveSubscription = accessStatus?.subscription_status === 'active';
  const hasTrialingSubscription = accessStatus?.subscription_status === 'trialing';
  const hasActiveTrial = accessStatus?.trial_status === 'active' &&
                        accessStatus?.days_remaining > 0;

  // PRODUCTION SECURITY: Multi-layer access verification
  // Note: Cancelled subscriptions (trial_status = 'canceled') still have access until period ends
  const canCreateAxieStudioAccount = hasAccess &&
                                    (hasActiveSubscription || hasTrialingSubscription || hasActiveTrial) &&
                                    !isExpiredTrialUser;
  
  // BLOCK: All unauthorized users from AxieStudio account creation
  if (!canCreateAxieStudioAccount) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`inline-flex items-center gap-3 px-8 py-4 font-bold uppercase tracking-wide border-2 opacity-50 cursor-not-allowed bg-gray-400 border-gray-400 text-gray-600 ${className}`}>
          <UserPlus className="w-5 h-5" />
          CREATE AXIE STUDIO ACCOUNT (DISABLED)
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">
            🔒 AxieStudio account creation requires an active subscription or trial
          </p>
          <p className="text-xs text-red-600 mb-2">
            {isExpiredTrialUser ? 
              '⚠️ Your trial has expired. Subscribe to access AxieStudio features.' :
              !hasActiveSubscription && !hasTrialingSubscription && !hasActiveTrial ?
              '⚠️ Active subscription or trial required for AxieStudio access.' :
              '⚠️ Unable to verify access status.'
            }
          </p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-none font-bold hover:bg-blue-700 transition-colors uppercase tracking-wide text-xs"
          >
            <Crown className="w-4 h-4" />
            SUBSCRIBE TO ACCESS
          </Link>
        </div>
      </div>
    );
  }
  const handleButtonClick = async () => {
    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert('Please log in first');
      return;
    }

    // Show the password modal
    setError(null);
    setShowModal(true);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    setIsCreating(true);

    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please log in first');
        return;
      }

      console.log('🔧 Creating new AxieStudio account...');

      // 🚀 Use centralized environment configuration
      const supabaseUrl = getConfig('VITE_SUPABASE_URL', 'https://othsnnoncnerjogvwjgc.supabase.co');
      console.log('🔍 Using Supabase URL from centralized config:', supabaseUrl);

      const response = await fetch(`${supabaseUrl}/functions/v1/axie-studio-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'create',
          password: password
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create AxieStudio account');
      }

      // Handle existing account case
      if (result.already_exists) {
        console.log('✅ AxieStudio account already exists!');
        setError(`🎉 EXCELLENT! Your AxieStudio account is already created and ready to use!

🔗 Please visit: ${import.meta.env.VITE_AXIESTUDIO_APP_URL || 'your-axiestudio-url'}/login

✅ You can now access all your AI workflows and tools directly.`);

        // Mark that user has clicked create (hides button forever)
        markCreateClicked();

        // Don't close modal immediately - let user see the message
        setTimeout(() => {
          setShowModal(false);
          setPassword('');
          setShowPassword(false);
          setError(null);

          // Notify parent component
          if (onAccountCreated) {
            onAccountCreated();
          }
        }, 5000); // Longer delay to read the message

        return;
      }

      console.log('✅ AxieStudio account created successfully!');

      // Mark that user has clicked create (hides button forever)
      markCreateClicked();

      // Close modal and reset form
      setShowModal(false);
      setPassword('');
      setShowPassword(false);
      setError(null);

      // Notify parent component that account was created
      if (onAccountCreated) {
        onAccountCreated();
      }

    } catch (error: any) {
      console.error('❌ Failed to create AxieStudio account:', error);

      // Handle specific error cases with user-friendly messages
      let userMessage = error.message;

      // Handle access denied error
      if (error.message.includes('ACCESS_REQUIRED') || error.message.includes('requires an active subscription')) {
        userMessage = `🔒 ACCESS REQUIRED

Your free trial has expired or you don't have an active subscription.

To create an AxieStudio account, you need:
✅ Active subscription OR active trial

Please resubscribe to continue using AxieStudio features.`;

        setError(userMessage);
        return;
      }

      if (error.message.includes('username is unavailable') || error.message.includes('already exists')) {
        userMessage = `🎉 EXCELLENT! Your AxieStudio account is already created and ready to use!

🔗 Please visit: ${import.meta.env.VITE_AXIESTUDIO_APP_URL || 'your-axiestudio-url'}/login

✅ You can now access all your AI workflows and tools directly.`;

        // Mark as created since account exists
        markCreateClicked();

        // Show success message and close after delay
        setError(userMessage);
        setTimeout(() => {
          setShowModal(false);
          setPassword('');
          setShowPassword(false);
          setError(null);

          if (onAccountCreated) {
            onAccountCreated();
          }
        }, 5000); // Longer delay to read the message

        return;
      } else if (error.message.includes('400')) {
        userMessage = 'There was an issue with the account creation. Your account may already exist. Please try launching the studio directly.';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        userMessage = 'Authentication error. Please try logging out and back in.';
      } else if (error.message.includes('500')) {
        userMessage = 'Server error. Please try again in a few moments.';
      }

      setError(`Failed to create AxieStudio account: ${userMessage}`);
    } finally {
      setIsCreating(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setPassword('');
    setShowPassword(false);
    setError(null);
    setIsCreating(false);
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={isCreating}
        className={`inline-flex items-center gap-3 px-8 py-4 font-bold transition-colors uppercase tracking-wide border-2 disabled:opacity-50 disabled:cursor-not-allowed bg-green-500 border-green-500 text-white hover:bg-green-600 hover:border-green-600 ${className}`}
      >
        {isCreating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            CREATING ACCOUNT...
          </>
        ) : (
          <>
            <UserPlus className="w-5 h-5" />
            CREATE AXIE STUDIO ACCOUNT
          </>
        )}
      </button>

      {/* Beautiful Password Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            // Close modal if clicking outside
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div 
            className="bg-white border-4 border-black w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform transition-all duration-200 scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-black text-white p-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-white border-2 border-black flex items-center justify-center rounded-none">
                <img
                  src="https://www.axiestudio.se/Axiestudiologo.jpg"
                  alt="Axie Studio"
                  className="w-6 h-6 object-contain"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold uppercase tracking-wide">Create AxieStudio Account</h2>
                <p className="text-sm opacity-90">Enter your account password</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="ml-auto text-white hover:text-gray-300 transition-colors"
                disabled={isCreating}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateAccount} className="p-6 space-y-6">
              {error && (
                <div className={`border-2 rounded-none p-6 ${
                  error.includes('🎉') || error.includes('EXCELLENT') || error.includes('already exists') || error.includes('✅')
                    ? 'bg-gradient-to-r from-green-50 to-blue-50 border-green-300'
                    : 'bg-red-50 border-red-200'
                }`}>
                  {error.includes('🎉') || error.includes('EXCELLENT') ? (
                    <div className="text-center">
                      <div className="text-4xl mb-3">🎉</div>
                      <h3 className="text-lg font-bold text-green-800 mb-3 uppercase tracking-wide">
                        ACCOUNT ALREADY EXISTS!
                      </h3>
                      <div className="bg-white border-2 border-green-300 rounded-none p-4 mb-4">
                        <p className="text-sm font-medium text-green-800 mb-2">
                          ✅ Your AxieStudio account is ready to use!
                        </p>
                        <div className="bg-blue-100 border border-blue-300 rounded-none p-3 mb-3">
                          <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">
                            🔗 CLICK TO ACCESS YOUR ACCOUNT:
                          </p>
                          <a
                            href={`${import.meta.env.VITE_AXIESTUDIO_APP_URL || 'your-axiestudio-url'}/login`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 rounded-none font-bold hover:bg-gray-800 transition-colors uppercase tracking-wide text-sm"
                          >
                            🚀 AXIE STUDIO
                          </a>
                        </div>
                        <p className="text-xs text-green-600">
                          🚀 You can now access all your AI workflows and tools directly.
                        </p>
                      </div>
                      <p className="text-xs text-green-600 font-medium">
                        ⏰ This modal will close automatically in 5 seconds...
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-red-800">
                      {error}
                    </p>
                  )}
                </div>
              )}

              <div className="bg-blue-50 border-2 border-blue-200 rounded-none p-4">
                <p className="text-sm text-blue-800 font-medium mb-2">
                  🔑 <strong>Use the same password</strong> you used to sign up for this account.
                </p>
                <p className="text-xs text-blue-600">
                  This will be your AxieStudio login password for easy access.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-black mb-2 uppercase tracking-wide">
                  Your Account Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-4 py-3 border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-gray-600 transition-colors bg-white pr-12"
                    required
                    disabled={isCreating}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-black transition-colors"
                    disabled={isCreating}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isCreating || !password.trim()}
                  className="flex-1 bg-green-600 text-white py-3 px-6 font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 uppercase tracking-wide border-2 border-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Create Account
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isCreating}
                  className="px-6 py-3 bg-white text-black border-2 border-black font-bold hover:bg-gray-100 transition-colors uppercase tracking-wide disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
