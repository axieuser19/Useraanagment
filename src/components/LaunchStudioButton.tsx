import React, { useState } from 'react';
import { ExternalLink, Zap, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useEnvironment } from '../hooks/useEnvironment';

interface LaunchStudioButtonProps {
  className?: string;
  variant?: 'primary' | 'secondary';
}

export function LaunchStudioButton({ className = '', variant = 'primary' }: LaunchStudioButtonProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const { getConfig } = useEnvironment();

  const handleLaunchStudio = async () => {
    setIsLaunching(true);
    console.log('🚀 Starting AxieStudio launch via our API...');

    try {
      // Get current user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('❌ No active session found');
        // Fallback to manual login
        const axiestudioUrl = getConfig('VITE_AXIESTUDIO_APP_URL');
        const loginUrl = `${axiestudioUrl}/login`;
        console.log('🔗 Redirecting to manual login:', loginUrl);
        window.open(loginUrl, '_blank');
        return;
      }

      // Get user info
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('❌ Could not get user info');
        const axiestudioUrl = getConfig('VITE_AXIESTUDIO_APP_URL');
        const loginUrl = `${axiestudioUrl}/login`;
        window.open(loginUrl, '_blank');
        return;
      }

      // Call our simple redirect function
      console.log('📡 Calling axiestudio-redirect function...');
      const { data, error } = await supabase.functions.invoke('axiestudio-redirect', {
        body: {
          user_email: user.email,
          user_id: user.id
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('📥 API Response:', { data, error });

      if (error) {
        console.error('❌ Launch API failed:', error);
        // Fallback to manual login
        const axiestudioUrl = getConfig('VITE_AXIESTUDIO_APP_URL');
        const loginUrl = `${axiestudioUrl}/login`;
        console.log('🔗 Fallback to manual login:', loginUrl);
        window.open(loginUrl, '_blank');
        return;
      }

      console.log('🔍 Response analysis:', {
        hasData: !!data,
        success: data?.success,
        hasRedirectUrl: !!data?.redirect_url,
        hasFallbackUrl: !!data?.fallback_url,
        message: data?.message
      });

      if (data?.success && data?.redirect_url) {
        console.log('✅ Redirecting to AxieStudio login:', data.redirect_url);
        window.open(data.redirect_url, '_blank');
      } else if (data?.fallback_url) {
        console.log('🔗 Using fallback URL:', data.fallback_url);
        window.open(data.fallback_url, '_blank');
      } else {
        console.warn('⚠️ Unexpected response, falling back to manual login');
        console.warn('⚠️ Full response data:', data);
        const axiestudioUrl = getConfig('VITE_AXIESTUDIO_APP_URL');
        const loginUrl = `${axiestudioUrl}/login`;
        console.log('🔗 Fallback to manual login:', loginUrl);
        window.open(loginUrl, '_blank');
      }
    } catch (error) {
      console.error('❌ Launch failed:', error);
      // Fallback to manual login
      const axiestudioUrl = getConfig('VITE_AXIESTUDIO_APP_URL');
      const loginUrl = `${axiestudioUrl}/login`;
      console.log('🔗 Error fallback to manual login:', loginUrl);
      window.open(loginUrl, '_blank');
    } finally {
      setIsLaunching(false);
    }
  };

  const baseClasses = "inline-flex items-center gap-3 px-8 py-4 rounded-none font-bold transition-all duration-300 uppercase tracking-wide border-3 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-3px] hover:translate-y-[-3px]";
  
  const variantClasses = variant === 'primary' 
    ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700"
    : "bg-white border-black text-black hover:bg-gray-100";

  return (
    <button
      onClick={handleLaunchStudio}
      disabled={isLaunching}
      className={`${baseClasses} ${variantClasses} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {isLaunching ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          LAUNCHING...
          <ExternalLink className="w-4 h-4" />
        </>
      ) : (
        <>
          <Zap className="w-5 h-5" />
          LAUNCH STUDIO
          <ExternalLink className="w-4 h-4" />
        </>
      )}
    </button>
  );
}
