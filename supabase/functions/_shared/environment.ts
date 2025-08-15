import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

interface EnvironmentConfig {
  [key: string]: string;
}

// Cache for environment config
let configCache: EnvironmentConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get all environment configuration from Supabase + Edge Function Secrets
 * This replaces the need for individual Deno.env.get() calls
 */
export async function getEnvironmentConfig(): Promise<EnvironmentConfig> {
  try {
    // Check cache first
    const now = Date.now();
    if (configCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('🔄 Using cached environment config');
      return configCache;
    }

    console.log('🔄 Fetching environment config from Supabase...');

    // 🚀 PRIORITY 1: Get critical variables from Edge Function Secrets
    const edgeSecrets: EnvironmentConfig = {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL') || '',
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') || '',
      SUPABASE_DB_URL: Deno.env.get('SUPABASE_DB_URL') || '',
      STRIPE_SECRET_KEY: Deno.env.get('STRIPE_SECRET_KEY') || '',
      STRIPE_WEBHOOK_SECRET: Deno.env.get('STRIPE_WEBHOOK_SECRET') || '',
      AXIESTUDIO_APP_URL: Deno.env.get('AXIESTUDIO_APP_URL') || '',
      AXIESTUDIO_USERNAME: Deno.env.get('AXIESTUDIO_USERNAME') || '',
      AXIESTUDIO_PASSWORD: Deno.env.get('AXIESTUDIO_PASSWORD') || '',
      AXIESTUDIO_API_KEY: Deno.env.get('AXIESTUDIO_API_KEY') || ''
    };

    if (!edgeSecrets.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in Edge Function secrets');
    }

    // 🚀 PRIORITY 2: Try to fetch additional config from Supabase database
    try {
      const supabase = createClient(edgeSecrets.SUPABASE_URL, edgeSecrets.SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase.rpc('get_all_config');

      if (!error && data) {
        // Convert array to object
        const dbConfig: EnvironmentConfig = {};
        data.forEach((item: any) => {
          dbConfig[item.config_key] = item.config_value;
        });

        // 🚀 MERGE: Edge Function secrets take precedence over database config
        const mergedConfig = { ...dbConfig, ...edgeSecrets };

        // Update cache
        configCache = mergedConfig;
        cacheTimestamp = now;

        console.log('✅ Environment config loaded: Edge secrets + database config');
        return mergedConfig;
      } else {
        console.warn('⚠️ Could not fetch database config, using Edge secrets only');
      }
    } catch (dbError) {
      console.warn('⚠️ Database config fetch failed, using Edge secrets only:', dbError);
    }

    // 🚀 FALLBACK: Use Edge Function secrets only
    configCache = edgeSecrets;
    cacheTimestamp = now;

    console.log('✅ Environment config loaded: Edge secrets only');
    return edgeSecrets;

  } catch (err) {
    console.error('❌ Failed to get environment config:', err);

    // 🚀 EMERGENCY FALLBACK: Minimal config with hardcoded values
    const emergencyConfig: EnvironmentConfig = {
      SUPABASE_URL: '',
      AXIESTUDIO_APP_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') || '',
      STRIPE_SECRET_KEY: Deno.env.get('STRIPE_SECRET_KEY') || '',
      STRIPE_WEBHOOK_SECRET: Deno.env.get('STRIPE_WEBHOOK_SECRET') || '',
      AXIESTUDIO_USERNAME: Deno.env.get('AXIESTUDIO_USERNAME') || '',
      AXIESTUDIO_PASSWORD: Deno.env.get('AXIESTUDIO_PASSWORD') || '',
      AXIESTUDIO_API_KEY: Deno.env.get('AXIESTUDIO_API_KEY') || ''
    };

    console.log('🚨 Using emergency fallback configuration');
    return emergencyConfig;
  }
}

/**
 * Get a single environment variable value
 * @param key The environment variable key
 * @param fallback Optional fallback value
 * @returns The environment variable value or fallback
 */
export async function getEnvVar(key: string, fallback?: string): Promise<string> {
  const config = await getEnvironmentConfig();
  const value = config[key] || fallback;
  
  if (!value && !fallback) {
    console.warn(`⚠️ Environment variable ${key} not found and no fallback provided`);
  }
  
  return value || '';
}

/**
 * Enhanced environment getter with validation
 * @param key The environment variable key
 * @param required Whether the variable is required (throws if missing)
 * @param fallback Optional fallback value
 * @returns The environment variable value
 */
export async function getRequiredEnvVar(key: string, required: boolean = true, fallback?: string): Promise<string> {
  const value = await getEnvVar(key, fallback);
  
  if (required && !value) {
    throw new Error(`Required environment variable ${key} is missing`);
  }
  
  return value;
}

/**
 * Get multiple environment variables at once
 * @param keys Array of environment variable keys
 * @returns Object with key-value pairs
 */
export async function getEnvVars(keys: string[]): Promise<EnvironmentConfig> {
  const config = await getEnvironmentConfig();
  const result: EnvironmentConfig = {};
  
  keys.forEach(key => {
    result[key] = config[key] || '';
  });
  
  return result;
}

/**
 * Validate that all required environment variables are present
 * @param requiredKeys Array of required environment variable keys
 * @throws Error if any required variables are missing
 */
export async function validateEnvironment(requiredKeys: string[]): Promise<void> {
  const config = await getEnvironmentConfig();
  const missing: string[] = [];
  
  requiredKeys.forEach(key => {
    if (!config[key]) {
      missing.push(key);
    }
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log('✅ All required environment variables are present');
}

/**
 * Clear the environment cache (useful for testing or forced refresh)
 */
export function clearEnvironmentCache(): void {
  configCache = null;
  cacheTimestamp = 0;
  console.log('🔄 Environment cache cleared');
}
