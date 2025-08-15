import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const requestBody = await req.json()
    const { action, user_id, reason } = requestBody

    console.log(`🔄 AxieStudio Lifecycle Management: ${action} for user ${user_id}, reason: ${reason}`)

    // Get user information
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id)
    if (userError || !userData?.user) {
      throw new Error('User not found')
    }

    const user = userData.user

    switch (action) {
      case 'activate_on_subscription':
        await activateAxieStudioAccount(user.email!, user_id, 'subscription_started')
        break
      
      case 'deactivate_on_subscription_end':
        await deactivateAxieStudioAccount(user.email!, user_id, 'subscription_ended')
        break
      
      case 'activate_on_trial_start':
        await activateAxieStudioAccount(user.email!, user_id, 'trial_started')
        break
      
      case 'deactivate_on_trial_end':
        await deactivateAxieStudioAccount(user.email!, user_id, 'trial_ended')
        break
      
      case 'force_activate':
        await activateAxieStudioAccount(user.email!, user_id, 'manual_activation')
        break
      
      case 'force_deactivate':
        await deactivateAxieStudioAccount(user.email!, user_id, 'manual_deactivation')
        break
      
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `AxieStudio account ${action} completed successfully`,
        user_email: user.email,
        action_taken: action,
        reason: reason
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Error in AxieStudio lifecycle management:', error)
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

async function activateAxieStudioAccount(email: string, userId: string, reason: string): Promise<void> {
  console.log(`✅ ACTIVATING AxieStudio account for ${email} (reason: ${reason})`)
  
  try {
    // Call the existing axie-studio-account function with reactivate action
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabaseAdmin.functions.invoke('axie-studio-account', {
      body: {
        action: 'reactivate',
        user_id: userId,
        reason: reason
      }
    })

    if (error) {
      console.warn(`⚠️ Could not reactivate AxieStudio account: ${error}`)
    } else {
      console.log(`✅ AxieStudio account activated for ${email}`)
    }
  } catch (error) {
    console.error(`❌ Error activating AxieStudio account: ${error}`)
    throw error
  }
}

async function deactivateAxieStudioAccount(email: string, userId: string, reason: string): Promise<void> {
  console.log(`❌ DEACTIVATING AxieStudio account for ${email} (reason: ${reason})`)
  
  try {
    // Call the existing axie-studio-account function with deactivate action
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabaseAdmin.functions.invoke('axie-studio-account', {
      body: {
        action: 'deactivate',
        user_id: userId,
        reason: reason
      }
    })

    if (error) {
      console.warn(`⚠️ Could not deactivate AxieStudio account: ${error}`)
    } else {
      console.log(`❌ AxieStudio account deactivated for ${email} (active = false)`)
    }
  } catch (error) {
    console.error(`❌ Error deactivating AxieStudio account: ${error}`)
    throw error
  }
}
