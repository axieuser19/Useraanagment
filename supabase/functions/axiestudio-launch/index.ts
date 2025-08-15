import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

interface LaunchRequest {
  user_email: string;
  user_id: string;
}

interface AxieStudioLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface LaunchResponse {
  success: boolean;
  access_url?: string;
  full_url?: string;
  message?: string;
  fallback_url?: string;
}

/**
 * 🚀 AXIESTUDIO LAUNCH API ENDPOINT
 * 
 * This endpoint handles the complete flow:
 * 1. Receives request from our frontend
 * 2. Calls AxieStudio API to create/get access token
 * 3. Returns access token URL for user redirection
 * 4. Stores access token in our database for future use
 */
export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

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
    console.log('🚀 AxieStudio Launch API called');

    // Get environment variables directly
    console.log('🔧 Loading environment variables...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const axiestudioUrl = Deno.env.get('AXIESTUDIO_APP_URL');
    const axiestudioUsername = Deno.env.get('AXIESTUDIO_USERNAME');
    const axiestudioPassword = Deno.env.get('AXIESTUDIO_PASSWORD');

    console.log('🔍 Config check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasAxieStudioUrl: !!axiestudioUrl,
      hasUsername: !!axiestudioUsername,
      hasPassword: !!axiestudioPassword,
      axiestudioUrl: axiestudioUrl
    });

    if (!supabaseUrl || !supabaseServiceKey || !axiestudioUrl) {
      console.error('❌ Missing required environment variables');
      throw new Error('Missing required environment variables');
    }


    // Parse request body
    console.log('📥 Parsing request body...');
    const body: LaunchRequest = await req.json();
    const { user_email, user_id } = body;

    console.log('📋 Request data:', { user_email, user_id: user_id?.substring(0, 8) + '...' });

    if (!user_email || !user_id) {
      console.error('❌ Missing required fields:', { user_email: !!user_email, user_id: !!user_id });
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing user_email or user_id'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Processing launch request for user: ${user_email}`);

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 🎯 STEP 1: Check if user has existing AxieStudio account
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

    // 🎯 STEP 2: Try to get access token from AxieStudio
    if (existingAccount?.axiestudio_username) {
      console.log('🔄 Using existing AxieStudio account:', existingAccount.axiestudio_username);

      // Try to login with existing credentials
      try {
        console.log('🔐 Attempting login to AxieStudio...');
        const loginUrl = `${axiestudioUrl}/api/v1/login`;
        console.log('🌐 Login URL:', loginUrl);

        const loginResponse = await fetch(loginUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            username: existingAccount.axiestudio_username,
            password: existingAccount.axiestudio_password || axiestudioPassword || '',
          }),
        });

        console.log('📡 Login response status:', loginResponse.status);

        if (loginResponse.ok) {
          const loginData: AxieStudioLoginResponse = await loginResponse.json();
          axiestudioAccessToken = loginData.access_token;
          console.log('✅ Successfully logged into existing AxieStudio account');
          console.log('🔑 Access token received:', axiestudioAccessToken ? 'YES' : 'NO');

          // Update last_accessed timestamp
          await supabase
            .from('axiestudio_accounts')
            .update({ last_accessed: new Date().toISOString() })
            .eq('id', existingAccount.id);
        } else {
          const errorText = await loginResponse.text();
          console.warn('⚠️ Failed to login to existing AxieStudio account:', loginResponse.status, errorText);
        }
      } catch (error) {
        console.error('❌ Error logging into AxieStudio:', error);
      }
    } else {
      console.log('ℹ️ No existing AxieStudio account found');
    }

    // 🎯 STEP 3: If no access token yet, try auto-login
    if (!axiestudioAccessToken) {
      console.log('🔄 Attempting AxieStudio auto-login');

      try {
        const autoLoginUrl = `${axiestudioUrl}/api/v1/auto_login`;
        console.log('🌐 Auto-login URL:', autoLoginUrl);

        const autoLoginResponse = await fetch(autoLoginUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log('📡 Auto-login response status:', autoLoginResponse.status);

        if (autoLoginResponse.ok) {
          const autoLoginData: AxieStudioLoginResponse = await autoLoginResponse.json();
          axiestudioAccessToken = autoLoginData.access_token;
          console.log('✅ Successfully got auto-login token');
          console.log('🔑 Auto-login token received:', axiestudioAccessToken ? 'YES' : 'NO');
        } else {
          const errorText = await autoLoginResponse.text();
          console.warn('⚠️ Auto-login failed:', autoLoginResponse.status, errorText);
        }
      } catch (error) {
        console.error('❌ Error with auto-login:', error);
      }
    } else {
      console.log('ℹ️ Already have access token, skipping auto-login');
    }

    // 🎯 STEP 4: Create response based on success/failure
    console.log('🎯 Creating response...');
    const response: LaunchResponse = {
      success: false,
      fallback_url: `${axiestudioUrl}/login`
    };

    console.log('🔍 Final token check:', { hasToken: !!axiestudioAccessToken });

    if (axiestudioAccessToken) {
      // 🎯 SUCCESS: We have an access token
      const accessUrl = `/flows?access_token=${axiestudioAccessToken}`;
      const fullUrl = `${axiestudioUrl}${accessUrl}`;

      response.success = true;
      response.access_url = accessUrl;
      response.full_url = fullUrl;
      response.message = 'Access token generated successfully';

      console.log('✅ Launch successful, redirecting to:', fullUrl);
      console.log('📋 Success response:', { success: true, hasFullUrl: !!response.full_url });

      // 🎯 STEP 5: Store/update access token in our database
      if (existingAccount) {
        // Update existing account with new token
        await supabase
          .from('axiestudio_accounts')
          .update({
            access_token: axiestudioAccessToken,
            last_accessed: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAccount.id);
      } else {
        // Create new record with access token
        await supabase
          .from('axiestudio_accounts')
          .insert({
            user_id: user_id,
            axiestudio_username: user_email, // Use email as username
            access_token: axiestudioAccessToken,
            is_active: true,
            created_at: new Date().toISOString(),
            last_accessed: new Date().toISOString()
          });
      }

    } else {
      // 🎯 FALLBACK: No access token, redirect to manual login
      response.success = false;
      response.message = 'Could not generate access token, redirecting to manual login';
      response.fallback_url = `${axiestudioUrl}/login`;

      console.log('⚠️ Launch failed, redirecting to manual login');
      console.log('📋 Fallback response:', { success: false, fallback_url: response.fallback_url });
    }

    console.log('📤 Sending final response:', response);

    return new Response(
      JSON.stringify(response),
      {
        status: response.success ? 200 : 202, // 202 = Accepted but fallback needed
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ AxieStudio Launch API error:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');

    // Get fallback URL
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
}
