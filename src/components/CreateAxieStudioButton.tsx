import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Loader2, Eye, EyeOff, Crown, Shield } from 'lucide-react';
import { useAxieStudioAccount } from '../hooks/useAxieStudioAccount';
import { useUserAccess } from '../hooks/useUserAccess';
import { useUnifiedAccess } from '../hooks/useUnifiedAccess';
import { useEnvironment } from '../hooks/useEnvironment';

interface CreateAxieStudioButtonProps {
  className?: string;
  onAccountCreated?: () => void;
}

export function CreateAxieStudioButton({ className = '', onAccountCreated }: CreateAxieStudioButtonProps) {
  const { showCreateButton, markCreateClicked } = useAxieStudioAccount();
  const { hasAccess, accessStatus } = useUserAccess();
  const { 
    access, 
    validateSecurity, 
    validateAxieStudioCreation,
    canCreateAxieStudio,
    hasAccess: unifiedHasAccess,
    accessType,
    isReturningUser,
    needsSubscription,
    loading: unifiedLoading
  } = useUnifiedAccess();
  const { getConfig } = useEnvironment();
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [securityValidation, setSecurityValidation] = useState<any>(null);

  // Validate security when component loads
  useEffect(() => {
    const performSecurityValidation = async () => {
      if (access?.user_id) {
        try {
          const validation = await validateSecurity('axiestudio_creation');
          setSecurityValidation(validation);
          
          if (validation && !validation.allowed) {
            console.log('🚨 AxieStudio creation blocked:', validation.warnings);
          }
        } catch (error) {
          console.log('⚠️ Security validation not available yet, using fallback');
          setSecurityValidation({ allowed: true, warnings: [] });
        }
      }
    };

    performSecurityValidation();
  }, [access?.user_id, validateSecurity]);

  // Don't render if user has already created an account
  if (!showCreateButton) {
    return null;
  }

  // Show loading state while unified access is loading
  if (unifiedLoading) {
    return (
      <div className="inline-flex items-center gap-3 px-8 py-4 font-bold uppercase tracking-wide border-2 opacity-50 bg-gray-200 border-gray-300 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        CHECKING ACCESS...
      </div>
    );
  }

  // 🛡️ UNIFIED ACCESS CONTROL: Use new bulletproof security system
  const useUnifiedSystem = access && canCreateAxieStudio !== undefined;
  
  let canCreateAccount;
  let accessMessage;
  let isBlocked = false;
  
  if (useUnifiedSystem) {
    // Use new unified access system
    canCreateAccount = canCreateAxieStudio && unifiedHasAccess;
    
    // Check for security blocks
    if (securityValidation && !securityValidation.allowed) {
      isBlocked = true;
      accessMessage = securityValidation.warnings?.[0] || 'Security validation failed';
    } else if (isReturningUser) {
      accessMessage = '🔄 Welcome back! Please subscribe to continue using AxieStudio.';
    } else if (needsSubscription) {
      accessMessage = '💳 Subscription required for AxieStudio access.';
    } else if (!canCreateAccount) {
      accessMessage = '⚠️ Active trial or subscription required.';
    }
  } else {
    // Fallback to old system
    const isExpiredTrialUser = accessStatus?.trial_status === 'expired' ||
                               accessStatus?.trial_status === 'scheduled_for_deletion';
    const hasActiveSubscription = accessStatus?.subscription_status === 'active';
    const hasTrialingSubscription = accessStatus?.subscription_status === 'trialing';
    const hasActiveTrial = accessStatus?.trial_status === 'active' &&
                          accessStatus?.days_remaining > 0;
    
    canCreateAccount = hasAccess &&
                      (hasActiveSubscription || hasTrialingSubscription || hasActiveTrial) &&
                      !isExpiredTrialUser;
    
    if (isExpiredTrialUser) {
      accessMessage = '⚠️ Your trial has expired. Subscribe to access AxieStudio features.';
    } else if (!hasActiveSubscription && !hasTrialingSubscription && !hasActiveTrial) {
      accessMessage = '⚠️ Active subscription or trial required for AxieStudio access.';
    } else {
      accessMessage = '⚠️ Unable to verify access status.';
    }
  }

  // 🚨 SECURITY VALIDATION: Check if creation is blocked by security system
  if (isBlocked) {
    const threatLevel = securityValidation?.threat_level || 'HIGH';
    
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`inline-flex items-center gap-3 px-8 py-4 font-bold uppercase tracking-wide border-2 opacity-50 cursor-not-allowed bg-red-400 border-red-400 text-red-800 ${className}`}>
          <Shield className="w-5 h-5" />
          SECURITY BLOCKED
        </div>
        <div className="text-center">
          <p className="text-sm text-red-600 mb-2">
            🚨 Security Threat Level: {threatLevel.toUpperCase()}
          </p>
          <p className="text-xs text-red-600 mb-1">
            {accessMessage}
          </p>
        </div>
      </div>
    );
  }
  
  // 🔒 ACCESS CONTROL: Block unauthorized users
  if (!canCreateAccount) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`inline-flex items-center gap-3 px-8 py-4 font-bold uppercase tracking-wide border-2 opacity-50 cursor-not-allowed bg-gray-400 border-gray-400 text-gray-600 ${className}`}>
          <UserPlus className="w-5 h-5" />
          CREATE AXIE STUDIO ACCOUNT (DISABLED)
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">
            🔒 AxieStudio account creation requires valid access
          </p>
          <p className="text-xs text-red-600 mb-2">
            {accessMessage}
          </p>
          {useUnifiedSystem && access && (
            <div className="text-xs text-gray-500 mb-2">
              Access Type: {accessType} | Trial Status: {access.trial_status}
              {access.trial_days_remaining > 0 && ` | ${access.trial_days_remaining} days remaining`}
            </div>
          )}
          <button
            onClick={() => window.open('/products', '_blank')}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-none font-bold hover:bg-blue-700 transition-colors uppercase tracking-wide text-xs"
          >
            <Crown className="w-4 h-4" />
            SUBSCRIBE TO ACCESS
          </button>
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

      // 🛡️ SECURITY VALIDATION: Validate creation eligibility
      if (useUnifiedSystem) {
        console.log('🔍 Validating AxieStudio creation security...');
        try {
          const validation = await validateSecurity('axiestudio_creation');
          
          if (!validation || !validation.allowed) {
            const errorMessage = validation?.warnings?.[0] || 'AxieStudio creation not allowed';
            setError(`🚨 Security Check Failed: ${errorMessage}`);
            return;
          }

          // 🎯 AXIESTUDIO VALIDATION: Double-check creation eligibility
          const axieValidation = await validateAxieStudioCreation();
          
          if (!axieValidation || !axieValidation.allowed) {
            const reason = axieValidation?.reason || 'Creation not allowed';
            setError(`🔒 Access Denied: ${reason}`);
            return;
          }

          console.log('✅ Security validation passed, proceeding with account creation...');
        } catch (error) {
          console.log('⚠️ Security validation failed, but proceeding with fallback');
        }
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
          password: password,
          force_active: true // ✅ ALWAYS CREATE WITH ACTIVE = TRUE
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
          if (onAccountCreated) onAccountCreated();
        }, 5000);

        return;
      }

      // Handle successful creation
      console.log('🎉 AxieStudio account created successfully!', result);

      setError(`🎉 SUCCESS! Your AxieStudio account has been created!

🔗 Login URL: ${result.login_url || `${import.meta.env.VITE_AXIESTUDIO_APP_URL || 'your-axiestudio-url'}/login`}
👤 Username: ${result.username || session.user.email}
🔑 Password: [Your chosen password]

✅ You can now access all your AI workflows and tools!`);

      // Mark that user has clicked create (hides button forever)
      markCreateClicked();

      // Close modal after showing success message
      setTimeout(() => {
        setShowModal(false);
        setPassword('');
        setShowPassword(false);
        setError(null);
        if (onAccountCreated) onAccountCreated();
      }, 5000);

    } catch (err) {
      console.error('❌ Error creating AxieStudio account:', err);
      setError(err instanceof Error ? err.message : 'Failed to create account. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setPassword('');
    setShowPassword(false);
    setError(null);
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
            CREATING...
          </>
        ) : (
          <>
            <UserPlus className="w-4 h-4" />
            CREATE AXIE STUDIO ACCOUNT
            {useUnifiedSystem && (
              <span className="text-xs bg-blue-600 px-2 py-1 rounded ml-2">
                SECURE
              </span>
            )}
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
            <div className="p-8">
              <h2 className="text-2xl font-bold mb-6 uppercase tracking-wide text-center">
                🎯 CREATE AXIE STUDIO ACCOUNT
              </h2>
              
              {useUnifiedSystem && (
                <div className="bg-green-50 border-2 border-green-200 rounded-none p-3 mb-4">
                  <div className="flex items-center gap-2 text-green-800">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-bold">SECURITY VERIFIED</span>
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    Access Type: {accessType} | Status: Authorized
                  </p>
                </div>
              )}

              <form onSubmit={handleCreateAccount} className="space-y-6">
                <div>
                  <label htmlFor="password" className="block text-sm font-bold mb-2 uppercase tracking-wide">
                    Choose Your Password:
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-blue-600 font-mono"
                      placeholder="Enter a secure password..."
                      disabled={isCreating}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      disabled={isCreating}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className={`p-4 border-2 rounded-none whitespace-pre-line ${
                    error.includes('SUCCESS') || error.includes('EXCELLENT') 
                      ? 'bg-green-50 border-green-600 text-green-800' 
                      : 'bg-red-50 border-red-600 text-red-800'
                  }`}>
                    {error}
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={isCreating || !password.trim()}
                    className="flex-1 px-6 py-3 bg-green-600 text-white border-2 border-green-600 font-bold hover:bg-green-700 transition-colors uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 inline mr-2" />
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
        </div>
      )}
    </>
  );
}
