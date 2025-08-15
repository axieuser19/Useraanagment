import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EnvironmentConfig {
  [key: string]: string;
}

interface UseEnvironmentReturn {
  config: EnvironmentConfig;
  loading: boolean;
  error: string | null;
  getConfig: (key: string, fallback?: string) => string;
  refetch: () => Promise<void>;
}

// 🚀 STATIC CONFIGURATION - Immediate availability with fallbacks
const STATIC_CONFIG: EnvironmentConfig = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
  VITE_STRIPE_PRO_PRICE_ID: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || '',
  VITE_STRIPE_PRO_PRODUCT_ID: import.meta.env.VITE_STRIPE_PRO_PRODUCT_ID || '',
  VITE_STRIPE_LIMITED_TIME_PRICE_ID: import.meta.env.VITE_STRIPE_LIMITED_TIME_PRICE_ID || '',
  VITE_STRIPE_LIMITED_TIME_PRODUCT_ID: import.meta.env.VITE_STRIPE_LIMITED_TIME_PRODUCT_ID || '',
  VITE_AXIESTUDIO_APP_URL: import.meta.env.VITE_AXIESTUDIO_APP_URL || '',
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL || ''
};

// Cache for environment config
let configCache: EnvironmentConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useEnvironment(): UseEnvironmentReturn {
  // 🚀 STATIC BEHAVIOR: Start with static config immediately (no loading state)
  const [config, setConfig] = useState<EnvironmentConfig>(STATIC_CONFIG);
  const [loading, setLoading] = useState(false); // Start as false for static behavior
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      // Check cache first
      const now = Date.now();
      if (configCache && (now - cacheTimestamp) < CACHE_DURATION) {
        console.log('🔄 Using cached environment config');
        // Merge cached config with static config (static takes precedence for critical values)
        const mergedConfig = { ...configCache, ...STATIC_CONFIG };
        setConfig(mergedConfig);
        if (!silent) setLoading(false);
        return;
      }

      console.log('🔄 Fetching environment config from Supabase...');

      // Fetch public configuration from Supabase
      const { data, error: fetchError } = await supabase.rpc('get_public_config');

      if (fetchError) {
        throw new Error(`Failed to fetch config: ${fetchError.message}`);
      }

      if (!data) {
        throw new Error('No configuration data received');
      }

      // Convert array to object
      const configObject: EnvironmentConfig = {};
      data.forEach((item: any) => {
        configObject[item.config_key] = item.config_value;
      });

      // Update cache
      configCache = configObject;
      cacheTimestamp = now;

      // 🚀 STATIC BEHAVIOR: Always merge with static config (static takes precedence)
      const mergedConfig = { ...configObject, ...STATIC_CONFIG };
      setConfig(mergedConfig);
      console.log('✅ Environment config enhanced with backend data');

    } catch (err: any) {
      console.error('❌ Failed to fetch environment config:', err);
      setError(err.message);

      // 🚀 STATIC BEHAVIOR: Keep static config even on error
      console.log('🔄 Maintaining static configuration');
      setConfig(STATIC_CONFIG);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const getConfig = (key: string, fallback?: string): string => {
    const value = config[key] || fallback || '';
    if (!value && !fallback) {
      console.warn(`⚠️ Environment variable ${key} not found and no fallback provided`);
    }
    return value;
  };

  const refetch = async () => {
    // Clear cache and refetch
    configCache = null;
    cacheTimestamp = 0;
    await fetchConfig();
  };

  useEffect(() => {
    // 🚀 STATIC BEHAVIOR: Fetch config silently in background (no loading state)
    fetchConfig(true);
  }, []);

  return {
    config,
    loading,
    error,
    getConfig,
    refetch
  };
}

// Standalone function to get config without React hook
export async function getEnvironmentConfig(): Promise<EnvironmentConfig> {
  try {
    // Check cache first
    const now = Date.now();
    if (configCache && (now - cacheTimestamp) < CACHE_DURATION) {
      return configCache;
    }

    // Fetch from Supabase
    const { data, error } = await supabase.rpc('get_public_config');

    if (error) {
      throw new Error(`Failed to fetch config: ${error.message}`);
    }

    // Convert array to object
    const configObject: EnvironmentConfig = {};
    data?.forEach((item: any) => {
      configObject[item.config_key] = item.config_value;
    });

    // Update cache
    configCache = configObject;
    cacheTimestamp = now;

    return configObject;

  } catch (err) {
    console.error('❌ Failed to fetch environment config:', err);
    
    // Return fallback config
    return {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
      VITE_AXIESTUDIO_APP_URL: import.meta.env.VITE_AXIESTUDIO_APP_URL || ''
    };
  }
}

// Helper function to get a single config value
export async function getConfigValue(key: string, fallback?: string): Promise<string> {
  const config = await getEnvironmentConfig();
  return config[key] || fallback || '';
}