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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        name: 'Trial Cleanup API Key'
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

// 🚨 CRITICAL FIX: Deactivate AxieStudio accounts instead of deleting them
// This preserves user data for potential reactivation when they resubscribe
async function deactivateAxieStudioUser(email: string): Promise<void> {
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

    console.log(`Found ${usersData.total_count || usersList.length} users in AxieStudio during cleanup`);
    console.log(`Looking for user to deactivate: ${email}`);

    if (!user) {
      console.log(`User ${email} not found in Axie Studio, skipping deactivation`);
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

// Legacy function name for backward compatibility
async function deleteAxieStudioUser(email: string): Promise<void> {
  console.log(`⚠️ LEGACY CALL: deleteAxieStudioUser now deactivates instead of deleting`);
  await deactivateAxieStudioUser(email);
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // This function should be called by a cron job or scheduled task
    console.log('Starting trial cleanup process...');

    // Step 1: Protect paying customers first (CRITICAL SAFETY STEP)
    const { error: protectError } = await supabase.rpc('protect_paying_customers');
    
    if (protectError) {
      console.error('Error protecting paying customers:', protectError);
      throw new Error('Failed to protect paying customers');
    }
    
    // Step 2: Sync subscription status
    const { error: syncError } = await supabase.rpc('sync_subscription_status');
    
    if (syncError) {
      console.error('Error syncing subscription status:', syncError);
      throw new Error('Failed to sync subscription status');
    }
    
    // Step 3: Check for expired trials and schedule deletions
    const { error: checkError } = await supabase.rpc('check_expired_trials');
    
    if (checkError) {
      console.error('Error checking expired trials:', checkError);
      throw new Error('Failed to check expired trials');
    }

    // Step 4: Get users scheduled for deletion (with safety checks)
    const { data: usersToDelete, error: getUsersError } = await supabase.rpc('get_users_for_deletion');
    
    if (getUsersError) {
      console.error('Error getting users for deletion:', getUsersError);
      throw new Error('Failed to get users for deletion');
    }

    console.log(`Found ${usersToDelete?.length || 0} users scheduled for deletion`);

    // Step 5: Final safety check before deletion
    const safeUsersToDelete = [];
    const SUPER_ADMIN_ID = 'b8782453-a343-4301-a947-67c5bb407d2b';

    for (const userToDelete of usersToDelete || []) {
      // CRITICAL SAFETY CHECK: NEVER delete super admin account
      if (userToDelete.user_id === SUPER_ADMIN_ID) {
        console.log(`CRITICAL SAFETY: Skipping deletion of SUPER ADMIN ${userToDelete.email} - PROTECTED ACCOUNT`);
        continue;
      }

      // Double-check that user doesn't have active subscription
      const { data: subscriptionCheck } = await supabase
        .from('stripe_user_subscriptions')
        .select('subscription_status')
        .eq('customer_id', userToDelete.user_id)
        .single();

      if (!subscriptionCheck || !['active', 'trialing'].includes(subscriptionCheck.subscription_status)) {
        safeUsersToDelete.push(userToDelete);
      } else {
        console.log(`SAFETY: Skipping deletion of ${userToDelete.email} - has active subscription`);
      }
    }
    
    // Step 6: Delete each verified expired user
    const deletionResults = [];
    
    for (const userToDelete of safeUsersToDelete) {
      try {
        console.log(`Processing deletion for user: ${userToDelete.email}`);

        // 🚨 CRITICAL: DEACTIVATE AXIESTUDIO ACCOUNT WHEN TRIAL EXPIRES
        try {
          console.log(`🔄 Deactivating AxieStudio account for expired trial: ${userToDelete.email}`);

          // Call the lifecycle manager to deactivate AxieStudio account
          const { error: axieError } = await supabase.functions.invoke('manage-axiestudio-lifecycle', {
            body: {
              action: 'deactivate_on_trial_end',
              user_id: userToDelete.user_id,
              reason: 'trial_expired'
            }
          });

          if (axieError) {
            console.error('❌ Failed to deactivate AxieStudio account:', axieError);
          } else {
            console.log('✅ AxieStudio account deactivated (active = false) for expired trial');
          }
        } catch (axieError) {
          console.error('❌ Error deactivating AxieStudio account:', axieError);
        }

        // 🚨 PRESERVE AXIESTUDIO DATA: Do not delete AxieStudio accounts
        // Users can resubscribe and regain access to their existing AxieStudio data
        console.log(`⚠️ AxieStudio account deactivated but data preserved for ${userToDelete.email}`);

        // Only delete from Supabase auth (this will cascade to other tables)
        const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userToDelete.user_id);
        
        if (deleteUserError) {
          console.error(`Failed to delete Supabase user ${userToDelete.email}:`, deleteUserError);
          deletionResults.push({
            email: userToDelete.email,
            success: false,
            error: deleteUserError.message
          });
        } else {
          console.log(`Successfully deleted user: ${userToDelete.email}`);
          deletionResults.push({
            email: userToDelete.email,
            success: true
          });
        }
      } catch (error: any) {
        console.error(`Failed to delete user ${userToDelete.email}:`, error);
        deletionResults.push({
          email: userToDelete.email,
          success: false,
          error: error.message
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Trial cleanup completed',
        total_candidates: usersToDelete?.length || 0,
        protected_users: (usersToDelete?.length || 0) - safeUsersToDelete.length,
        processed: safeUsersToDelete.length,
        results: deletionResults
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Trial cleanup error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});