/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

interface LaunchRequest {
  user_email: string;
  user_id: string;
}

interface LaunchResponse {
  success: boolean;
  access_url?: string;
  full_url?: string;
  message?: string;
  fallback_url?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

Deno.serve(async (req) => {
  console.log('🚀 AxieStudio Launch API called - Simple Version');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get environment variables
    console.log('🔧 Loading environment variables...');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const axiestudioUrl = Deno.env.get('AXIESTUDIO_APP_URL');

    console.log('🔍 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      axiestudioUrl: axiestudioUrl
    });

    if (!supabaseUrl || !supabaseServiceKey || !axiestudioUrl) {
      console.error('❌ Missing required environment variables');
      throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AXIESTUDIO_APP_URL');
    }

    // Parse request body
    console.log('📥 Parsing request body...');
    const body: LaunchRequest = await req.json();
    const { user_email, user_id } = body;

    console.log('📋 Request data:', { 
      user_email, 
      user_id: user_id?.substring(0, 8) + '...' 
    });

    if (!user_email || !user_id) {
      console.error('❌ Missing required fields');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Missing user_email or user_id',
          fallback_url: `${axiestudioUrl}/login`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    console.log('🔗 Creating Supabase client...');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user has AxieStudio account
    console.log('🔍 Checking for existing AxieStudio account...');
    const { data: existingAccount, error: accountError } = await supabase
      .from('axiestudio_accounts')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .single();

    if (accountError && accountError.code !== 'PGRST116') {
      console.error('❌ Error checking existing account:', accountError);
    }

    let axiestudioAccessToken: string | null = null;

    if (existingAccount?.axiestudio_username) {
      // User has account, try to login
      console.log('🔐 Logging in with existing AxieStudio account...');

      try {
        const loginResponse = await fetch(`${axiestudioUrl}/api/v1/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            username: existingAccount.axiestudio_username,
            password: existingAccount.axiestudio_password || 'defaultpassword123',
          }),
        });

        console.log('📡 Login response status:', loginResponse.status);

        if (loginResponse.ok) {
          const loginData = await loginResponse.json();
          axiestudioAccessToken = loginData.access_token;
          console.log('✅ Login successful, token received:', !!axiestudioAccessToken);
        } else {
          const errorText = await loginResponse.text();
          console.warn('⚠️ Login failed:', loginResponse.status, errorText);
        }
      } catch (error) {
        console.error('❌ Error with login:', error);
      }
    } else {
      // No account exists, create one first
      console.log('🆕 No AxieStudio account found, creating one...');

      try {
        const { data: createResult, error: createError } = await supabase.functions.invoke('axie-studio-account', {
          body: { action: 'create', password: 'defaultpassword123' },
          headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` }
        });

        if (createError) {
          console.error('❌ Error creating account:', createError);
        } else if (createResult?.success) {
          console.log('✅ Account created successfully');

          // Now try to login with the new account
          try {
            const loginResponse = await fetch(`${axiestudioUrl}/api/v1/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                username: user_email,
                password: 'defaultpassword123',
              }),
            });

            if (loginResponse.ok) {
              const loginData = await loginResponse.json();
              axiestudioAccessToken = loginData.access_token;
              console.log('✅ New account login successful');
            }
          } catch (loginError) {
            console.error('❌ Error logging in with new account:', loginError);
          }
        }
      } catch (error) {
        console.error('❌ Error creating AxieStudio account:', error);
      }
    }

    // Create response
    console.log('🎯 Creating response...');
    const response: LaunchResponse = {
      success: false,
      fallback_url: `${axiestudioUrl}/login`
    };

    if (axiestudioAccessToken) {
      // SUCCESS: We have an access token
      const accessUrl = `/flows?access_token=${axiestudioAccessToken}`;
      const fullUrl = `${axiestudioUrl}${accessUrl}`;

      response.success = true;
      response.access_url = accessUrl;
      response.full_url = fullUrl;
      response.message = 'Access token generated successfully';

      console.log('✅ Launch successful, redirecting to:', fullUrl);

      // Try to store the token in database (optional, don't fail if it doesn't work)
      try {
        await supabase
          .from('axiestudio_accounts')
          .upsert({
            user_id: user_id,
            axiestudio_username: user_email,
            access_token: axiestudioAccessToken,
            is_active: true,
            last_accessed: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        console.log('💾 Token stored in database');
      } catch (dbError) {
        console.warn('⚠️ Could not store token in database:', dbError);
        // Don't fail the request if database storage fails
      }
    } else {
      // FALLBACK: No access token
      response.success = false;
      response.message = 'Could not generate access token, redirecting to manual login';
      response.fallback_url = `${axiestudioUrl}/login`;
      console.log('⚠️ Launch failed, redirecting to manual login');
    }

    console.log('📤 Sending response:', response);

    return new Response(
      JSON.stringify(response),
      { 
        status: response.success ? 200 : 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ AxieStudio Launch API error:', error);
    
    const fallbackUrl = Deno.env.get('AXIESTUDIO_APP_URL') || 'https://flow.axiestudio.se';
    
    const errorResponse = {
      success: false,
      message: 'Internal server error',
      fallback_url: `${fallbackUrl}/login`,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    console.log('📤 Sending error response:', errorResponse);
    
    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
