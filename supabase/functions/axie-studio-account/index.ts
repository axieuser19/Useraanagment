import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const AXIESTUDIO_APP_URL = Deno.env.get('AXIESTUDIO_APP_URL')!;
const AXIESTUDIO_USERNAME = Deno.env.get('AXIESTUDIO_USERNAME')!;
const AXIESTUDIO_PASSWORD = Deno.env.get('AXIESTUDIO_PASSWORD')!;

if (!AXIESTUDIO_APP_URL || !AXIESTUDIO_USERNAME || !AXIESTUDIO_PASSWORD) {
  throw new Error('Missing required Axie Studio environment variables');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

async function getAxieStudioApiKey(): Promise<string> {
  try {
    // Step 1: Login to get JWT token
    const loginResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: AXIESTUDIO_USERNAME,
        password: AXIESTUDIO_PASSWORD
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const { access_token } = await loginResponse.json();

    // Step 2: Create API key using JWT token
    const apiKeyResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/api_key/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Account Management API Key'
      })
    });

    if (!apiKeyResponse.ok) {
      throw new Error(`API key creation failed: ${apiKeyResponse.status}`);
    }

    const { api_key } = await apiKeyResponse.json();
    return api_key;
  } catch (error) {
    console.error('Failed to get Axie Studio API key:', error);
    throw error;
  }
}

async function checkIfUserExists(email: string): Promise<boolean> {
  try {
    console.log(`🔍 Checking if user already exists: ${email}`);

    // Get API key first
    const apiKey = await getAxieStudioApiKey();

    // Check if user exists
    const usersResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/?x-api-key=${apiKey}`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (!usersResponse.ok) {
      console.log(`⚠️ Could not check existing users: ${usersResponse.status}`);
      return false; // If we can't check, proceed with creation attempt
    }

    const usersData = await usersResponse.json();
    const usersList = usersData.users || usersData;
    const existingUser = usersList.find((u: any) => u.username === email || u.email === email);

    if (existingUser) {
      console.log(`✅ User already exists in AxieStudio: ${email} (ID: ${existingUser.id})`);
      return true;
    }

    console.log(`✅ User does not exist in AxieStudio: ${email}`);
    return false;
  } catch (error) {
    console.error('Error checking if user exists:', error);
    return false; // If we can't check, proceed with creation attempt
  }
}

async function createAxieStudioUser(email: string, password: string, userId: string): Promise<any> {
  try {
    console.log(`🔄 Starting AxieStudio user creation for: ${email}`);

    // Step 0: Check if user already exists
    const userExists = await checkIfUserExists(email);
    if (userExists) {
      return {
        success: true,
        already_exists: true,
        user_id: 'existing',
        email: email,
        message: 'AxieStudio account already exists for this email'
      };
    }

    // Step 0.5: Check user's subscription status to determine if account should be active
    console.log(`🔍 Checking user subscription status for: ${userId}`);
    let shouldBeActive = true; // ✅ DEFAULT TO ACTIVE for users with access

    try {
      const { data: userAccess, error: accessError } = await supabase.rpc('get_user_access_level', {
        p_user_id: userId
      });

      if (accessError) {
        console.warn(`⚠️ Could not check user access, defaulting to active: ${accessError}`);
        shouldBeActive = true; // ✅ DEFAULT TO ACTIVE for safety
      } else if (userAccess && userAccess.length > 0) {
        const access = userAccess[0];
        // ✅ FIXED LOGIC: Account should be ACTIVE if user has ANY access (trial or subscription)
        shouldBeActive = access.has_access === true;
        console.log(`📊 User access status: has_access=${access.has_access}, access_type=${access.access_type}, trial_status=${access.trial_status}`);
        
        // ✅ CRITICAL FIX: For active trials and subscriptions, ALWAYS set to active
        if (access.trial_status === 'active' || 
            access.subscription_status === 'active' || 
            access.subscription_status === 'trialing') {
          shouldBeActive = true;
          console.log(`✅ FORCING ACTIVE: User has active trial or subscription`);
        }
      } else {
        console.log(`⚠️ No access data found, defaulting to active for new account creation`);
        shouldBeActive = true; // ✅ DEFAULT TO ACTIVE for new users
      }
    } catch (error) {
      console.warn(`⚠️ Error checking user access, defaulting to active: ${error}`);
      shouldBeActive = true; // ✅ DEFAULT TO ACTIVE for safety
    }

    console.log(`🎯 FINAL DECISION: AxieStudio account will be created with is_active = ${shouldBeActive}`);

    // Step 1: Login to AxieStudio to get JWT token
    console.log(`🔐 Logging into AxieStudio...`);
    const loginResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: AXIESTUDIO_USERNAME,
        password: AXIESTUDIO_PASSWORD
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const { access_token } = await loginResponse.json();
    console.log(`✅ Login successful, got access token`);

    // Step 2: Create API key using JWT token
    console.log(`🔑 Creating API key...`);
    const apiKeyResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/api_key/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Account Management API Key'
      })
    });

    if (!apiKeyResponse.ok) {
      throw new Error(`API key creation failed: ${apiKeyResponse.status}`);
    }

    const { api_key } = await apiKeyResponse.json();
    console.log(`✅ API key created: ${api_key.substring(0, 10)}...`);

    // Step 3: Create the actual user
    console.log(`👤 Creating user account with ACTIVE status (is_active: true)...`);
    const userData = {
      username: email,
      password: password,
      email: email,  // Explicitly set email field
      is_active: true,  // ✅ ALWAYS ACTIVE for new account creation
      is_superuser: false,
      is_verified: true,  // Mark as verified to avoid approval requirement
      is_staff: false,
      first_name: '',
      last_name: ''
    };

    console.log(`📤 Sending user data with is_active=true:`, { ...userData, password: '[REDACTED]', is_active: true });

    const userResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/?x-api-key=${api_key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': api_key
      },
      body: JSON.stringify(userData)
    });

    console.log(`📥 User creation response status: ${userResponse.status}`);

    const responseText = await userResponse.text();
    console.log(`📥 User creation response body: ${responseText}`);

    if (!userResponse.ok) {
      // Handle specific "username unavailable" error
      if (userResponse.status === 400 && responseText.includes('username is unavailable')) {
        console.log(`⚠️ Username already exists: ${email}`);
        return {
          success: true,
          already_exists: true,
          user_id: 'existing',
          email: email,
          message: 'AxieStudio account already exists for this email'
        };
      }

      // Handle other errors
      throw new Error(`Failed to create Axie Studio user: ${userResponse.status} - ${responseText}`);
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    console.log(`✅ Successfully created Axie Studio user: ${email}`);

    // Step 4: Explicitly activate the user if needed
    if (responseData.id || responseData.user_id) {
      const userId = responseData.id || responseData.user_id;
      console.log(`🔄 Ensuring user account is active: ${userId} (should be active: ${shouldBeActive})`);

      try {
        const activateResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/${userId}?x-api-key=${api_key}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': api_key
          },
          body: JSON.stringify({
            is_active: true,  // ✅ ALWAYS SET TO ACTIVE for new account creation
            is_verified: true
          })
        });

        if (activateResponse.ok) {
          console.log(`✅ User account set to ACTIVE successfully`);
        } else {
          const errorText = await activateResponse.text();
          console.log(`⚠️ User activation failed: ${activateResponse.status} - ${errorText} - but continuing...`);
        }
      } catch (activateError) {
        console.log(`⚠️ User activation error: ${activateError} - but continuing...`);
      }
    }

    // Store credentials for auto-login
    const { error: storeError } = await supabase.rpc('store_axie_studio_credentials', {
      p_user_id: userId,
      p_axie_studio_user_id: responseData.id || responseData.user_id || 'unknown',
      p_axie_studio_email: email,
      p_axie_studio_password: password
    });

    if (storeError) {
      console.error('⚠️ Failed to store credentials for auto-login:', storeError);
    } else {
      console.log('✅ Credentials stored for auto-login');
    }

    return {
      success: true,
      user_id: responseData.id || responseData.user_id || 'unknown',
      email: email,
      response_data: responseData
    };
  } catch (error) {
    console.error('❌ Error creating Axie Studio user:', error);
    throw error;
  }
}

async function deleteAxieStudioUser(email: string): Promise<void> {
  try {
    const apiKey = await getAxieStudioApiKey();
    
    // Find user by email
    const usersResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/?x-api-key=${apiKey}`);
    
    if (!usersResponse.ok) {
      throw new Error(`Failed to fetch users: ${usersResponse.status}`);
    }

    const usersData = await usersResponse.json();

    // Handle the proper API response structure: { total_count: number, users: array }
    const usersList = usersData.users || usersData;
    const user = usersList.find((u: any) => u.username === email);

    console.log(`Found ${usersData.total_count || usersList.length} users in AxieStudio`);
    console.log(`Looking for user: ${email}`);

    if (!user) {
      console.log(`User ${email} not found in Axie Studio, skipping deletion`);
      return;
    }

    // 🚨 CRITICAL FIX: Deactivate instead of delete to preserve user data
    const deactivateResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/${user.id}?x-api-key=${apiKey}`, {
      method: 'PATCH',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_active: false  // Deactivate account - preserves data, requires admin approval to reactivate
      })
    });

    if (!deactivateResponse.ok) {
      throw new Error(`Failed to deactivate Axie Studio user: ${deactivateResponse.status}`);
    }

    console.log(`✅ Axie Studio user DEACTIVATED (data preserved): ${email}`);
  } catch (error) {
    console.error('Error deactivating Axie Studio user:', error);
    throw error;
  }
}

// 🚨 NEW FUNCTION: Reactivate AxieStudio user when they resubscribe
async function reactivateAxieStudioUser(email: string): Promise<void> {
  try {
    const apiKey = await getAxieStudioApiKey();

    // Find user by email
    const usersResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/?x-api-key=${apiKey}`);

    if (!usersResponse.ok) {
      throw new Error(`Failed to fetch users: ${usersResponse.status}`);
    }

    const usersData = await usersResponse.json();
    const usersList = usersData.users || usersData;
    const user = usersList.find((u: any) => u.username === email);

    if (!user) {
      console.log(`User ${email} not found in Axie Studio for reactivation`);
      return;
    }

    // Reactivate user
    const reactivateResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/${user.id}?x-api-key=${apiKey}`, {
      method: 'PATCH',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_active: true  // Reactivate account
      })
    });

    if (!reactivateResponse.ok) {
      throw new Error(`Failed to reactivate Axie Studio user: ${reactivateResponse.status}`);
    }

    console.log(`✅ Axie Studio user REACTIVATED: ${email}`);
  } catch (error) {
    console.error('Error reactivating Axie Studio user:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);

    if (getUserError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, password } = await req.json();

    if (req.method === 'POST' && action === 'create') {
      if (!password) {
        return new Response(
          JSON.stringify({ error: 'Password is required for account creation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 🚨 NEW: Check if user has active access before allowing account creation
      console.log(`🔍 Checking access for user: ${user.email}`);

      const { data: accessData, error: accessError } = await supabase.rpc('get_user_access_level', {
        p_user_id: user.id
      });

      if (accessError) {
        console.error('❌ Error checking user access:', accessError);
        return new Response(
          JSON.stringify({
            error: 'Unable to verify account access. Please try again.',
            code: 'ACCESS_CHECK_FAILED'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userAccess = accessData?.[0];
      console.log('🔍 User access status:', userAccess);

      // Check if user has active access (trial or subscription)
      if (!userAccess?.has_access ||
          userAccess?.trial_status === 'expired' ||
          userAccess?.trial_status === 'scheduled_for_deletion') {

        console.log(`❌ Access denied for user ${user.email}: No active trial or subscription`);

        return new Response(
          JSON.stringify({
            error: 'AxieStudio account creation requires an active subscription or trial. Please subscribe to continue.',
            code: 'ACCESS_REQUIRED',
            has_access: false,
            trial_status: userAccess?.trial_status || 'unknown',
            subscription_status: userAccess?.subscription_status || 'none'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`✅ Access verified for user ${user.email}: ${userAccess?.access_type}`);

      const result = await createAxieStudioUser(user.email!, password, user.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Axie Studio account created successfully',
          ...result
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
      await deleteAxieStudioUser(user.email!);

      return new Response(
        JSON.stringify({ success: true, message: 'Axie Studio account deactivated (data preserved)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🚨 NEW ENDPOINT: Reactivate AxieStudio account
    if (req.method === 'POST' && action === 'reactivate') {
      await reactivateAxieStudioUser(user.email!);

      return new Response(
        JSON.stringify({ success: true, message: 'Axie Studio account reactivated successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request method or action' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Axie Studio account management error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});