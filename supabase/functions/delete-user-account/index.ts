import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

// Validate required environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 🚨 CRITICAL: Deactivate AxieStudio account (ACTIVE = FALSE) BEFORE deletion
async function deactivateAxieStudioUser(email: string): Promise<string | null> {
  try {
    console.log(`🚨 CRITICAL: Setting AxieStudio account ACTIVE = FALSE for: ${email}`);

    const AXIESTUDIO_APP_URL = Deno.env.get('AXIESTUDIO_APP_URL');
    const AXIESTUDIO_USERNAME = Deno.env.get('AXIESTUDIO_USERNAME');
    const AXIESTUDIO_PASSWORD = Deno.env.get('AXIESTUDIO_PASSWORD');

    if (!AXIESTUDIO_APP_URL || !AXIESTUDIO_USERNAME || !AXIESTUDIO_PASSWORD) {
      throw new Error('Missing AxieStudio environment variables');
    }

    // Step 1: Login to AxieStudio with admin credentials
    console.log('🔄 Login to AxieStudio with admin credentials');
    const loginResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: AXIESTUDIO_USERNAME,
        password: AXIESTUDIO_PASSWORD
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`AxieStudio login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const accessToken = loginData.access_token;

    // Step 2: Create API key for user management
    console.log('🔄 Create API key for user management');
    const apiKeyResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/api_key/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `deactivation-${Date.now()}` })
    });

    if (!apiKeyResponse.ok) {
      throw new Error(`API key creation failed: ${apiKeyResponse.status}`);
    }

    const { api_key } = await apiKeyResponse.json();

    // Step 3: Find user by email in AxieStudio
    console.log('🔄 Find user by email in AxieStudio');
    const usersResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/?x-api-key=${api_key}`);

    if (!usersResponse.ok) {
      throw new Error(`Failed to fetch users: ${usersResponse.status}`);
    }

    const usersData = await usersResponse.json();
    const usersList = usersData.users || usersData;
    const user = usersList.find((u: any) => u.username === email);

    if (!user) {
      console.log(`User ${email} not found in AxieStudio, skipping deactivation`);
      return null;
    }

    // Step 4: 🚨 CRITICAL: PATCH /api/v1/users/{id} with { "is_active": false }
    console.log(`🔄 PATCH /api/v1/users/${user.id} with { "is_active": false }`);
    const deactivateResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/${user.id}?x-api-key=${api_key}`, {
      method: 'PATCH',
      headers: {
        'x-api-key': api_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_active: false  // 🚨 CRITICAL: Setting ACTIVE = FALSE
      })
    });

    if (!deactivateResponse.ok) {
      throw new Error(`Failed to deactivate AxieStudio user: ${deactivateResponse.status}`);
    }

    console.log(`✅ SUCCESS: AxieStudio account DEACTIVATED (ACTIVE = FALSE) for: ${email}`);
    console.log(`🔒 AxieStudio account is now DISABLED`);

    return user.id; // Return AxieStudio user ID for logging
  } catch (error) {
    console.error(`❌ Failed to deactivate AxieStudio user ${email}:`, error);
    throw error;
  }
}

// 🚨 LEGAL COMPLIANCE: Complete AxieStudio account deletion for manual deletion
async function deleteAxieStudioUserCompletely(email: string): Promise<void> {
  try {
    const AXIESTUDIO_APP_URL = Deno.env.get('AXIESTUDIO_APP_URL');
    const AXIESTUDIO_USERNAME = Deno.env.get('AXIESTUDIO_USERNAME');
    const AXIESTUDIO_PASSWORD = Deno.env.get('AXIESTUDIO_PASSWORD');

    if (!AXIESTUDIO_APP_URL || !AXIESTUDIO_USERNAME || !AXIESTUDIO_PASSWORD) {
      throw new Error('Missing AxieStudio environment variables');
    }

    // Step 1: Login to get API key
    const loginResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: AXIESTUDIO_USERNAME,
        password: AXIESTUDIO_PASSWORD
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`AxieStudio login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const accessToken = loginData.access_token;

    // Step 2: Create API key
    const apiKeyResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/api_key/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `deletion-${Date.now()}` })
    });

    if (!apiKeyResponse.ok) {
      throw new Error(`API key creation failed: ${apiKeyResponse.status}`);
    }

    const { api_key } = await apiKeyResponse.json();

    // Step 3: Find and delete user
    const usersResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/?x-api-key=${api_key}`);

    if (!usersResponse.ok) {
      throw new Error(`Failed to fetch users: ${usersResponse.status}`);
    }

    const usersData = await usersResponse.json();
    const usersList = usersData.users || usersData;
    const user = usersList.find((u: any) => u.username === email);

    if (!user) {
      console.log(`User ${email} not found in AxieStudio, skipping deletion`);
      return;
    }

    // COMPLETE DELETION for legal compliance
    const deleteResponse = await fetch(`${AXIESTUDIO_APP_URL}/api/v1/users/${user.id}?x-api-key=${api_key}`, {
      method: 'DELETE',
      headers: { 'x-api-key': api_key }
    });

    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete AxieStudio user: ${deleteResponse.status}`);
    }

    console.log(`✅ AxieStudio user COMPLETELY DELETED for legal compliance: ${email}`);
  } catch (error) {
    console.error(`❌ Failed to delete AxieStudio user ${email}:`, error);
    throw error;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify the user is authenticated and can only delete their own account
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a client with the user's token to verify authentication
    const userSupabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Verify the user is authenticated
    const { data: { user: authenticatedUser }, error: authError } = await userSupabase.auth.getUser(token);

    if (authError || !authenticatedUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { user_id } = await req.json();

    // SECURITY: Ensure user can only delete their own account
    if (user_id !== authenticatedUser.id) {
      return new Response(
        JSON.stringify({ error: 'You can only delete your own account' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // SECURITY: Prevent deletion of super admin account
    const SUPER_ADMIN_ID = 'b8782453-a343-4301-a947-67c5bb407d2b';
    if (user_id === SUPER_ADMIN_ID) {
      return new Response(
        JSON.stringify({ error: 'Super admin account cannot be deleted' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`🗑️ Starting immediate deletion for user: ${user_id}`);

    // STEP 1: Record deletion history FIRST (critical for abuse prevention)
    let userEmail: string | null = null;
    let trialUsed: boolean = false;
    let trialCompleted: boolean = false;
    try {
      console.log('🔄 Recording deletion history (FIRST - critical for abuse prevention)...');

      // Get user email first
      const { data: userData } = await supabase.auth.admin.getUserById(user_id);
      userEmail = userData?.user?.email || null;

      // Get trial information to track usage
      const { data: trialData } = await supabase
        .from('user_trials')
        .select('trial_status, trial_start_date, trial_end_date')
        .eq('user_id', user_id)
        .single();

      if (trialData) {
        trialUsed = true; // User had a trial
        // Check if they used the full 7 days or converted to paid
        trialCompleted = trialData.trial_status === 'expired' || 
                        trialData.trial_status === 'converted_to_paid' ||
                        new Date(trialData.trial_end_date) <= new Date();
      }

      if (userEmail) {
        // 🚨 CRITICAL: Record deletion history to prevent trial abuse (using secure version)
        const { data: deletionResult, error: deletionError } = await supabase.rpc('record_account_deletion_secure', {
          p_user_id: user_id,
          p_email: userEmail,
          p_reason: 'immediate_deletion'
        });

        if (deletionError) {
          console.error('❌ Failed to record deletion history:', deletionError);
          // Continue anyway - user still has right to delete account
        } else {
          console.log('✅ Deletion history recorded - trial abuse prevention secured');
        }
      } else {
        throw new Error('Could not retrieve user email for deletion history');
      }
    } catch (error) {
      console.error('❌ CRITICAL: Failed to record deletion history:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to record deletion history - operation aborted for security',
          code: 'HISTORY_RECORD_FAILED'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // STEP 1.5: 🚨 CRITICAL: Setting AxieStudio account ACTIVE = FALSE
    let axiestudioUserId: string | null = null;
    try {
      console.log('🚨 CRITICAL: Setting AxieStudio account ACTIVE = FALSE');

      if (userEmail) {
        // Log deactivation attempt
        await supabase.rpc('log_axiestudio_operation', {
          p_user_id: user_id,
          p_user_email: userEmail,
          p_action: 'deactivation_attempt'
        });

        // FIRST: Deactivate the AxieStudio account (ACTIVE = FALSE)
        axiestudioUserId = await deactivateAxieStudioUser(userEmail);
        console.log('✅ SUCCESS: AxieStudio account DEACTIVATED (ACTIVE = FALSE)');
        console.log('🔒 AxieStudio account is now DISABLED');

        // Update local database status
        await supabase.rpc('deactivate_local_axiestudio_account', {
          p_user_id: user_id
        });

        // Log successful deactivation
        await supabase.rpc('log_axiestudio_operation', {
          p_user_id: user_id,
          p_user_email: userEmail,
          p_action: 'deactivation_success',
          p_axiestudio_user_id: axiestudioUserId
        });

        // THEN: Continue with complete deletion for legal compliance
        console.log('🔄 Continue with main account deletion');

        // Log deletion attempt
        await supabase.rpc('log_axiestudio_operation', {
          p_user_id: user_id,
          p_user_email: userEmail,
          p_action: 'deletion_attempt',
          p_axiestudio_user_id: axiestudioUserId
        });

        await deleteAxieStudioUserCompletely(userEmail);
        console.log('✅ AxieStudio account completely deleted (legal compliance)');

        // Log successful deletion
        await supabase.rpc('log_axiestudio_operation', {
          p_user_id: user_id,
          p_user_email: userEmail,
          p_action: 'deletion_success',
          p_axiestudio_user_id: axiestudioUserId
        });
      }
    } catch (error) {
      console.warn('⚠️ AxieStudio operations failed (non-critical):', error);

      // Log the failure
      if (userEmail) {
        await supabase.rpc('log_axiestudio_operation', {
          p_user_id: user_id,
          p_user_email: userEmail,
          p_action: 'deletion_failed',
          p_axiestudio_user_id: axiestudioUserId,
          p_error_message: error.message
        });
      }

      // Continue with deletion even if AxieStudio fails - user still has right to delete main account
    }

    // STEP 2: Comprehensive Stripe cleanup
    try {
      console.log('🔄 Starting comprehensive Stripe cleanup...');

      // Get user's Stripe customer ID
      const { data: customerData } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', user_id)
        .single();

      if (customerData?.customer_id) {
        console.log(`🔄 Processing Stripe customer: ${customerData.customer_id}`);

        // 1. Cancel all active subscriptions
        const { data: subscriptions } = await supabase
          .from('stripe_subscriptions')
          .select('subscription_id, status')
          .eq('customer_id', customerData.customer_id)
          .in('status', ['active', 'trialing', 'past_due']);

        if (subscriptions && subscriptions.length > 0) {
          for (const sub of subscriptions) {
            try {
              // Mark as cancelled in our database immediately
              await supabase
                .from('stripe_subscriptions')
                .update({
                  status: 'canceled',
                  cancel_at_period_end: true,
                  canceled_at: Math.floor(Date.now() / 1000),
                  deleted_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('subscription_id', sub.subscription_id);

              console.log(`✅ Cancelled subscription: ${sub.subscription_id}`);
            } catch (subError) {
              console.warn(`⚠️ Failed to cancel subscription ${sub.subscription_id}:`, subError);
            }
          }
          console.log(`✅ Processed ${subscriptions.length} Stripe subscriptions`);
        }

        // 2. Mark customer as deleted in our database
        await supabase
          .from('stripe_customers')
          .update({
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('customer_id', customerData.customer_id);

        console.log('✅ Stripe customer marked as deleted');
      } else {
        console.log('ℹ️ No Stripe customer found for user');
      }
    } catch (error) {
      console.warn('⚠️ Stripe cleanup failed (non-critical):', error);
      // Don't fail the entire deletion for Stripe issues
    }

    // 2. Remove user access immediately
    try {
      console.log('🔄 Removing user access...');
      
      // Mark user for immediate deletion in user_account_state
      await supabase
        .from('user_account_state')
        .update({
          account_status: 'deleted',
          has_access: false,
          access_level: 'suspended',
          trial_days_remaining: 0,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user_id);

      // Mark trial as deleted
      await supabase
        .from('user_trials')
        .update({
          trial_status: 'deleted',
          deletion_scheduled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user_id);

      console.log('✅ User access removed');
    } catch (error) {
      console.warn('⚠️ Access removal failed:', error);
    }

    // STEP 4: Delete user data from all tables in correct order
    try {
      console.log('🔄 Deleting user data...');

      // Delete in correct order to respect foreign key constraints
      const deletionSteps = [
        { table: 'stripe_subscriptions', column: 'customer_id', isCustomerId: true },
        { table: 'axie_studio_accounts', column: 'user_id', isCustomerId: false },
        { table: 'axie_studio_credentials', column: 'user_id', isCustomerId: false },
        { table: 'user_account_state', column: 'user_id', isCustomerId: false },
        { table: 'stripe_customers', column: 'user_id', isCustomerId: false },
        { table: 'user_trials', column: 'user_id', isCustomerId: false },
        { table: 'user_profiles', column: 'id', isCustomerId: false }
      ];

      for (const step of deletionSteps) {
        try {
          if (step.isCustomerId) {
            // For stripe_subscriptions, we need to delete by customer_id
            const { data: customerData } = await supabase
              .from('stripe_customers')
              .select('customer_id')
              .eq('user_id', user_id);

            if (customerData && customerData.length > 0) {
              for (const customer of customerData) {
                await supabase
                  .from(step.table)
                  .delete()
                  .eq(step.column, customer.customer_id);
              }
            }
          } else {
            await supabase
              .from(step.table)
              .delete()
              .eq(step.column, user_id);
          }
          console.log(`✅ Deleted data from ${step.table}`);
        } catch (error) {
          console.warn(`⚠️ Failed to delete from ${step.table}:`, error);
        }
      }
    } catch (error) {
      console.warn('⚠️ Data deletion failed:', error);
    }

    // 4. Delete the Supabase Auth user (this will cascade delete remaining data)
    try {
      console.log('🔄 Deleting Supabase Auth user...');
      
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
      
      if (deleteError) {
        console.error('❌ Auth user deletion failed:', deleteError);
        throw deleteError;
      }
      
      console.log('✅ Supabase Auth user deleted');
    } catch (error) {
      console.error('❌ Auth deletion failed:', error);
      throw error;
    }

    console.log('✅ User deletion completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User account deleted successfully' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ User deletion failed:', error);

    // SECURITY: Sanitize error response - don't leak sensitive information
    const sanitizedError = error instanceof Error
      ? (error.message.includes('auth') || error.message.includes('token')
         ? 'Authentication error occurred'
         : 'Internal server error occurred')
      : 'Unknown error occurred';

    return new Response(
      JSON.stringify({
        error: 'Failed to delete user account',
        code: 'DELETION_FAILED',
        message: sanitizedError,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
