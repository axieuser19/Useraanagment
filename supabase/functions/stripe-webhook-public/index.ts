import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

if (!stripeSecret || !stripeWebhookSecret) {
  throw new Error('Missing required Stripe environment variables');
}

const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

console.log('🔧 Environment check:', {
  hasSupabaseUrl: !!supabaseUrl,
  hasServiceKey: !!supabaseServiceKey,
  supabaseUrl: supabaseUrl?.substring(0, 30) + '...'
});

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS headers for public access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204, 
        headers: corsHeaders 
      });
    }

    // Log the method for debugging
    console.log(`📨 Received ${req.method} request to webhook`);

    if (req.method === 'GET') {
      // Stripe sometimes sends GET requests to test the endpoint
      return new Response('Webhook endpoint is ready', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    if (req.method !== 'POST') {
      return new Response(`Method ${req.method} not allowed. Expected POST.`, {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    console.log('🔄 Public webhook request received:', {
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      url: req.url
    });

    // get the signature from the header
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response('No signature found', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // get the raw body
    const body = await req.text();

    // verify the webhook signature
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    console.log(`✅ Webhook signature verified for event: ${event.type}`);

    // Process the event asynchronously
    EdgeRuntime.waitUntil(handleEvent(event));

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleEvent(event: Stripe.Event) {
  const stripeData = event?.data?.object ?? {};

  if (!stripeData) {
    console.log('No stripe data in event');
    return;
  }

  console.log(`Processing event: ${event.type}`, {
    eventId: event.id,
    hasCustomer: 'customer' in stripeData,
    customer: stripeData.customer,
    customerEmail: stripeData.customer_details?.email
  });

  // 🔧 CRITICAL FIX 1: Webhook deduplication
  try {
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single();

    if (existingEvent) {
      console.log(`⚠️ Event ${event.id} already processed, skipping`);
      return;
    }

    // Record this event as being processed
    await supabase
      .from('webhook_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type
      });
  } catch (error) {
    console.error('Error checking/recording webhook event:', error);
    // Continue processing even if deduplication fails
  }

  // Handle subscription updates (cancellations, reactivations, etc.)
  if (event.type === 'customer.subscription.updated') {
    const subscription = stripeData as Stripe.Subscription;
    console.log(`🔄 Subscription updated: ${subscription.id}`, {
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: subscription.current_period_end
    });

    console.log('🚀 About to call handleSubscriptionUpdate...');
    await handleSubscriptionUpdate(subscription);
    console.log('✅ handleSubscriptionUpdate completed');
    return;
  }

  // Handle subscription deletions
  if (event.type === 'customer.subscription.deleted') {
    const subscription = stripeData as Stripe.Subscription;
    console.log(`🗑️ Subscription deleted: ${subscription.id}`);

    await handleSubscriptionDeletion(subscription);
    return;
  }

  // 🔧 CRITICAL FIX 2: Handle payment failures
  if (event.type === 'invoice.payment_failed') {
    const invoice = stripeData as Stripe.Invoice;
    console.log(`💳 Payment failed for invoice: ${invoice.id}`);

    await handlePaymentFailure(invoice);
    return;
  }

  // 🔧 CRITICAL FIX 3: Handle payment success (recovery from failure)
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = stripeData as Stripe.Invoice;
    console.log(`✅ Payment succeeded for invoice: ${invoice.id}`);

    await handlePaymentSuccess(invoice);
    return;
  }

  // Handle checkout sessions (both with and without customer)
  if (event.type === 'checkout.session.completed') {
    const session = stripeData as Stripe.Checkout.Session;
    
    // For sessions without a customer, try to find/create customer by email
    let customerId = session.customer as string;
    
    if (!customerId && session.customer_details?.email) {
      console.log(`No customer ID, attempting to find/create customer for email: ${session.customer_details.email}`);
      
      try {
        // Try to find existing customer by email
        const customers = await stripe.customers.list({
          email: session.customer_details.email,
          limit: 1
        });
        
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
          console.log(`Found existing customer: ${customerId}`);
        } else {
          // Create new customer
          const newCustomer = await stripe.customers.create({
            email: session.customer_details.email,
            name: session.customer_details.name || undefined,
          });
          customerId = newCustomer.id;
          console.log(`Created new customer: ${customerId}`);
        }
      } catch (error) {
        console.error('Failed to find/create customer:', error);
        return;
      }
    }

    if (!customerId) {
      console.error(`No customer ID available for session: ${session.id}`);
      return;
    }

    console.log(`Processing session ${session.id} for customer ${customerId}`);
    await handleCheckoutSession(session, customerId);
  }
}

async function handleCheckoutSession(session: Stripe.Checkout.Session, customerId: string) {
  try {
    const { mode, payment_status } = session;
    const isSubscription = mode === 'subscription';

    console.info(`Processing ${isSubscription ? 'subscription' : 'one-time payment'} checkout session for customer: ${customerId}`);

    if (isSubscription) {
      console.info(`Starting subscription sync for customer: ${customerId}`);
      await syncCustomerFromStripe(customerId);
      
      // CRITICAL: Protect the user from deletion after subscription sync
      try {
        await supabase.rpc('sync_subscription_status');
        await supabase.rpc('protect_paying_customers');
        console.info(`Protected customer ${customerId} from trial deletion`);
      } catch (error) {
        console.error(`Failed to protect customer ${customerId}:`, error);
      }
    } else if (mode === 'payment' && payment_status === 'paid') {
      // Handle one-time payment
      console.info(`Processing one-time payment for customer: ${customerId}`);
      
      // First, ensure customer exists in our database
      await ensureCustomerExists(customerId, session.customer_details?.email);
      
      // Create a basic subscription record for one-time payment customers
      await createBasicSubscriptionRecord(customerId);
      
      console.info(`Successfully processed one-time payment for session: ${session.id}`);
      
      // Run protection functions for one-time payment customers too
      try {
        await supabase.rpc('sync_subscription_status');
        await supabase.rpc('protect_paying_customers');
        console.info(`Protected one-time payment customer ${customerId} from trial deletion`);
      } catch (error) {
        console.error(`Failed to protect one-time payment customer ${customerId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in handleCheckoutSession:', error);
  }
}

// Helper function to ensure customer exists in our database
async function ensureCustomerExists(customerId: string, email?: string) {
  try {
    // Check if customer already exists
    const { data: existingCustomer } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('customer_id', customerId)
      .maybeSingle();

    if (existingCustomer) {
      console.log(`Customer ${customerId} already exists in database`);
      return;
    }

    // Find user by email if provided
    let userId = null;
    if (email) {
      const { data: user } = await supabase.auth.admin.listUsers();
      const foundUser = user.users.find((u: any) => u.email === email);
      
      if (foundUser) {
        userId = foundUser.id;
        console.log(`Found user ${userId} for email ${email}`);
      }
    }

    // Create customer record
    const { error } = await supabase.from('stripe_customers').insert({
      user_id: userId,
      customer_id: customerId,
    });

    if (error) {
      console.error('Error creating customer record:', error);
    } else {
      console.log(`Created customer record for ${customerId}`);
    }
  } catch (error) {
    console.error('Error in ensureCustomerExists:', error);
  }
}

// Helper function to create basic subscription record for one-time payments
async function createBasicSubscriptionRecord(customerId: string) {
  try {
    const { error } = await supabase.from('stripe_subscriptions').upsert({
      customer_id: customerId,
      status: 'one_time_payment',
    }, {
      onConflict: 'customer_id'
    });

    if (error) {
      console.error('Error creating basic subscription record:', error);
    } else {
      console.log(`Created basic subscription record for ${customerId}`);
    }
  } catch (error) {
    console.error('Error in createBasicSubscriptionRecord:', error);
  }
}

// Subscription sync function (simplified version)
async function syncCustomerFromStripe(customerId: string) {
  try {
    // fetch latest subscription data from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      console.info(`No active subscriptions found for customer: ${customerId}`);
      return;
    }

    // assumes that a customer can only have a single subscription
    const subscription = subscriptions.data[0];

    // store subscription state
    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: customerId,
        subscription_id: subscription.id,
        price_id: subscription.items.data[0].price.id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        status: subscription.status,
      },
      {
        onConflict: 'customer_id',
      },
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      throw new Error('Failed to sync subscription in database');
    }
    console.info(`Successfully synced subscription for customer: ${customerId}`);
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  try {
    console.log(`🔄 Processing subscription update: ${subscription.id}`);
    console.log('📊 Subscription details:', {
      id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      customer: subscription.customer
    });

    // Update subscription in our database
    console.log('💾 Updating subscription in database...');
    const { error: updateError } = await supabase
      .from('stripe_subscriptions')
      .update({
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        updated_at: new Date().toISOString()
      })
      .eq('subscription_id', subscription.id);

    if (updateError) {
      console.error('❌ Error updating subscription:', updateError);
      return;
    }

    console.log('✅ Subscription updated in database');

    // Find the user associated with this subscription
    const { data: customerData } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', subscription.customer as string)
      .single();

    if (!customerData) {
      console.error('❌ No customer found for subscription');
      return;
    }

    // Handle cancellation
    if (subscription.cancel_at_period_end) {
      console.log('🗑️ Subscription canceled via portal, scheduling deactivation for period end');

      // 🚨 CRITICAL FIX: Keep AxieStudio active until period actually ends
      // Schedule account deletion for 24 hours after period end
      const subscriptionEndDate = new Date(subscription.current_period_end * 1000);
      const deletionDate = new Date(subscriptionEndDate.getTime() + (24 * 60 * 60 * 1000));

      const { error: trialError } = await supabase
        .from('user_trials')
        .update({
          trial_status: 'canceled', // Mark as canceled but keep access until period ends
          deletion_scheduled_at: deletionDate.toISOString()
        })
        .eq('user_id', customerData.user_id);

      if (trialError) {
        console.error('❌ Error updating trial status:', trialError);
      } else {
        console.log('✅ Trial status updated to canceled - AxieStudio remains active until period ends');
        console.log(`📅 Subscription ends: ${subscriptionEndDate.toISOString()}`);
        console.log(`🗑️ Account deletion scheduled: ${deletionDate.toISOString()}`);
      }

      // 🚨 IMPORTANT: Do NOT deactivate AxieStudio here - it should remain active until period ends
      // AxieStudio deactivation will happen during the trial-cleanup process after period ends
      console.log(`📋 AxieStudio account will remain ACTIVE until subscription period ends: ${subscriptionEndDate.toISOString()}`);
    }

    // Handle reactivation
    if (!subscription.cancel_at_period_end && subscription.status === 'active') {
      console.log('🔄 Subscription reactivated via portal, updating trial status');

      const { error: trialError } = await supabase
        .from('user_trials')
        .update({
          trial_status: 'converted_to_paid',
          deletion_scheduled_at: null
        })
        .eq('user_id', customerData.user_id);

      if (trialError) {
        console.error('❌ Error updating trial status:', trialError);
      } else {
        console.log('✅ Trial status updated to converted_to_paid');
      }

      // 🎯 ACTIVATE AXIESTUDIO ACCOUNT when subscription becomes active
      try {
        console.log('🔄 Activating AxieStudio account for active subscription...');

        const { error: axieError } = await supabase.functions.invoke('manage-axiestudio-lifecycle', {
          body: {
            action: 'activate_on_subscription',
            user_id: customerData.user_id,
            reason: 'subscription_reactivated'
          }
        });

        if (axieError) {
          console.warn('⚠️ Could not activate AxieStudio account:', axieError);
        } else {
          console.log('✅ AxieStudio account activated (active = true)');
        }
      } catch (axieError) {
        console.warn('⚠️ AxieStudio activation failed:', axieError);
      }
    }

  } catch (error) {
    console.error('❌ Error handling subscription update:', error);
  }
}

// 🔧 CRITICAL FIX: Payment failure handler
async function handlePaymentFailure(invoice: Stripe.Invoice) {
  try {
    console.log(`💳 Processing payment failure for invoice: ${invoice.id}`);

    if (!invoice.subscription) {
      console.log('No subscription associated with failed invoice');
      return;
    }

    // Get the subscription details
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);

    // Update subscription status to reflect payment failure
    const { error: updateError } = await supabase
      .from('stripe_subscriptions')
      .update({
        status: subscription.status, // Usually 'past_due'
        updated_at: new Date().toISOString()
      })
      .eq('subscription_id', subscription.id);

    if (updateError) {
      console.error('❌ Error updating subscription after payment failure:', updateError);
      return;
    }

    // Find the user and update their trial status
    const { data: customerData } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', subscription.customer as string)
      .single();

    if (customerData) {
      // Give user 7 days grace period for payment failure
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

      const { error: trialError } = await supabase
        .from('user_trials')
        .update({
          trial_status: 'payment_failed',
          deletion_scheduled_at: gracePeriodEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', customerData.user_id);

      if (trialError) {
        console.error('❌ Error updating trial status for payment failure:', trialError);
      } else {
        console.log('✅ User given 7-day grace period for payment failure');
      }
    }

  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

// 🔧 CRITICAL FIX: Payment success handler (recovery from failure)
async function handlePaymentSuccess(invoice: Stripe.Invoice) {
  try {
    console.log(`✅ Processing payment success for invoice: ${invoice.id}`);

    if (!invoice.subscription) {
      console.log('No subscription associated with successful invoice');
      return;
    }

    // Get the subscription details
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);

    // Update subscription status
    const { error: updateError } = await supabase
      .from('stripe_subscriptions')
      .update({
        status: subscription.status, // Usually 'active'
        updated_at: new Date().toISOString()
      })
      .eq('subscription_id', subscription.id);

    if (updateError) {
      console.error('❌ Error updating subscription after payment success:', updateError);
      return;
    }

    // Find the user and restore their access
    const { data: customerData } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', subscription.customer as string)
      .single();

    if (customerData) {
      // Restore user access and clear deletion schedule
      const { error: trialError } = await supabase
        .from('user_trials')
        .update({
          trial_status: 'converted_to_paid',
          deletion_scheduled_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', customerData.user_id);

      if (trialError) {
        console.error('❌ Error restoring user access after payment success:', trialError);
      } else {
        console.log('✅ User access restored after successful payment');
      }

      // 🎯 ACTIVATE AXIESTUDIO ACCOUNT when payment succeeds
      try {
        console.log('🔄 Activating AxieStudio account for successful payment...');

        const { error: axieError } = await supabase.functions.invoke('manage-axiestudio-lifecycle', {
          body: {
            action: 'activate_on_subscription',
            user_id: customerData.user_id,
            reason: 'payment_successful'
          }
        });

        if (axieError) {
          console.warn('⚠️ Could not activate AxieStudio account:', axieError);
        } else {
          console.log('✅ AxieStudio account activated (active = true)');
        }
      } catch (axieError) {
        console.warn('⚠️ AxieStudio activation failed:', axieError);
      }

      // Run protection functions
      try {
        await supabase.rpc('protect_paying_customers');
        await supabase.rpc('sync_subscription_status');
      } catch (error) {
        console.error('Error running protection functions:', error);
      }
    }

  } catch (error) {
    console.error('❌ Error handling payment success:', error);
  }
}

async function handleSubscriptionDeletion(subscription: Stripe.Subscription) {
  try {
    console.log(`🗑️ Processing subscription deletion: ${subscription.id}`);

    // Mark subscription as deleted in our database
    const { error: deleteError } = await supabase
      .from('stripe_subscriptions')
      .update({
        status: 'canceled',
        deleted_at: new Date().toISOString()
      })
      .eq('subscription_id', subscription.id);

    if (deleteError) {
      console.error('❌ Error marking subscription as deleted:', deleteError);
    } else {
      console.log('✅ Subscription marked as deleted in database');
    }

    // 🎯 CRITICAL: DEACTIVATE AXIESTUDIO ACCOUNT WHEN SUBSCRIPTION ENDS
    try {
      // Get customer data to find user_id
      const { data: customerData } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('customer_id', subscription.customer as string)
        .single();

      if (customerData?.user_id) {
        console.log(`🔄 Deactivating AxieStudio account for user: ${customerData.user_id}`);

        // Call the lifecycle manager to deactivate AxieStudio account
        const { error: axieError } = await supabase.functions.invoke('manage-axiestudio-lifecycle', {
          body: {
            action: 'deactivate_on_subscription_end',
            user_id: customerData.user_id,
            reason: 'subscription_deleted'
          }
        });

        if (axieError) {
          console.error('❌ Failed to deactivate AxieStudio account:', axieError);
        } else {
          console.log('✅ AxieStudio account deactivated (active = false)');
        }
      } else {
        console.warn('⚠️ Could not find user_id for customer:', subscription.customer);
      }
    } catch (axieError) {
      console.error('❌ Error deactivating AxieStudio account:', axieError);
    }

  } catch (error) {
    console.error('❌ Error handling subscription deletion:', error);
  }
}
