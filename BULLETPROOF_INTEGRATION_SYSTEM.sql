-- 🛡️ BULLETPROOF INTEGRATION SYSTEM
-- This creates a unified, robust system that properly integrates:
-- ✅ Stripe & Supabase synchronization
-- ✅ AxieStudio account creation logic
-- ✅ 7-day trial management
-- ✅ Comprehensive security layer

-- ============================================================================
-- 1. UNIFIED ACCESS CONTROL SYSTEM
-- ============================================================================

-- Drop existing conflicting functions to avoid inconsistencies
DROP FUNCTION IF EXISTS check_user_access(uuid);
DROP FUNCTION IF EXISTS get_user_access_level(uuid);

-- Create the SINGLE SOURCE OF TRUTH for access control
CREATE OR REPLACE FUNCTION get_unified_user_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
    v_user_created_at timestamptz;
    v_trial_info record;
    v_subscription_info record;
    v_deletion_history record;
    v_is_super_admin boolean := false;
    v_has_access boolean := false;
    v_access_type text := 'none';
    v_can_create_axiestudio boolean := false;
    v_trial_days_remaining integer := 0;
    v_trial_seconds_remaining bigint := 0;
BEGIN
    -- Get user creation time (SINGLE SOURCE OF TRUTH for trial calculations)
    SELECT created_at INTO v_user_created_at
    FROM auth.users
    WHERE id = p_user_id;
    
    IF v_user_created_at IS NULL THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;
    
    -- Check if super admin (infinite access)
    v_is_super_admin := (p_user_id = 'b8782453-a343-4301-a947-67c5bb407d2b'::uuid);
    
    -- Get trial information
    SELECT * INTO v_trial_info
    FROM user_trials
    WHERE user_id = p_user_id;
    
    -- Get subscription information
    SELECT 
        ss.status as subscription_status,
        ss.current_period_end,
        ss.cancel_at_period_end,
        sc.customer_id
    INTO v_subscription_info
    FROM stripe_subscriptions ss
    JOIN stripe_customers sc ON ss.customer_id = sc.customer_id
    WHERE sc.user_id = p_user_id
    AND ss.status IN ('active', 'trialing', 'past_due');
    
    -- Check deletion history (trial abuse prevention)
    SELECT * INTO v_deletion_history
    FROM deleted_account_history
    WHERE normalized_email = normalize_email((SELECT email FROM auth.users WHERE id = p_user_id));
    
    -- Calculate real-time trial status based on user creation time
    IF v_deletion_history IS NULL THEN
        -- New user - calculate trial from creation time
        v_trial_seconds_remaining := GREATEST(0, 
            EXTRACT(epoch FROM ((v_user_created_at + interval '7 days') - now()))::bigint
        );
        v_trial_days_remaining := GREATEST(0, 
            EXTRACT(days FROM ((v_user_created_at + interval '7 days') - now()))::integer
        );
    ELSE
        -- Returning user - no trial
        v_trial_seconds_remaining := 0;
        v_trial_days_remaining := 0;
    END IF;
    
    -- Determine access level (PRIORITY ORDER)
    IF v_is_super_admin THEN
        v_has_access := true;
        v_access_type := 'super_admin';
        v_can_create_axiestudio := true;
    ELSIF v_subscription_info.subscription_status = 'active' THEN
        v_has_access := true;
        v_access_type := 'subscription';
        v_can_create_axiestudio := true;
    ELSIF v_subscription_info.subscription_status = 'trialing' THEN
        v_has_access := true;
        v_access_type := 'subscription_trial';
        v_can_create_axiestudio := true;
    ELSIF v_deletion_history IS NULL AND v_trial_seconds_remaining > 0 THEN
        v_has_access := true;
        v_access_type := 'trial';
        v_can_create_axiestudio := true;
    ELSE
        v_has_access := false;
        v_access_type := 'expired';
        v_can_create_axiestudio := false;
    END IF;
    
    -- Build comprehensive result
    v_result := jsonb_build_object(
        'user_id', p_user_id,
        'user_created_at', v_user_created_at,
        'has_access', v_has_access,
        'access_type', v_access_type,
        'can_create_axiestudio_account', v_can_create_axiestudio,
        'is_super_admin', v_is_super_admin,
        'is_returning_user', (v_deletion_history IS NOT NULL),
        
        -- Trial information
        'trial_days_remaining', v_trial_days_remaining,
        'trial_seconds_remaining', v_trial_seconds_remaining,
        'trial_start_date', v_user_created_at,
        'trial_end_date', v_user_created_at + interval '7 days',
        'trial_status', CASE 
            WHEN v_deletion_history IS NOT NULL THEN 'not_eligible'
            WHEN v_trial_seconds_remaining > 0 THEN 'active'
            ELSE 'expired'
        END,
        
        -- Subscription information
        'subscription_status', COALESCE(v_subscription_info.subscription_status, 'none'),
        'subscription_period_end', v_subscription_info.current_period_end,
        'subscription_cancel_at_period_end', COALESCE(v_subscription_info.cancel_at_period_end, false),
        
        -- Deletion history
        'deletion_history', CASE 
            WHEN v_deletion_history IS NOT NULL THEN 
                jsonb_build_object(
                    'deleted_at', v_deletion_history.account_deleted_at,
                    'deletion_reason', v_deletion_history.deletion_reason
                )
            ELSE null
        END,
        
        -- Metadata
        'last_checked', now(),
        'system_version', '2.0'
    );
    
    RETURN v_result;
END;
$$;

-- ============================================================================
-- 2. STRIPE-SUPABASE SYNCHRONIZATION SYSTEM
-- ============================================================================

-- Function to sync Stripe subscription with local database
CREATE OR REPLACE FUNCTION sync_stripe_subscription(
    p_stripe_subscription_id text,
    p_stripe_customer_id text,
    p_status text,
    p_current_period_start bigint,
    p_current_period_end bigint,
    p_cancel_at_period_end boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_result jsonb;
BEGIN
    -- Get user ID from customer
    SELECT user_id INTO v_user_id
    FROM stripe_customers
    WHERE customer_id = p_stripe_customer_id;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Customer not found', 'customer_id', p_stripe_customer_id);
    END IF;
    
    -- Update subscription
    INSERT INTO stripe_subscriptions (
        subscription_id, customer_id, user_id, status,
        current_period_start, current_period_end, cancel_at_period_end,
        created_at, updated_at
    ) VALUES (
        p_stripe_subscription_id, p_stripe_customer_id, v_user_id, p_status,
        to_timestamp(p_current_period_start), to_timestamp(p_current_period_end), p_cancel_at_period_end,
        now(), now()
    )
    ON CONFLICT (subscription_id) DO UPDATE SET
        status = EXCLUDED.status,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = now();
    
    -- Update user trial status based on subscription
    IF p_status = 'active' THEN
        -- Active subscription - convert trial
        UPDATE user_trials
        SET 
            trial_status = 'converted_to_paid',
            deletion_scheduled_at = NULL,
            updated_at = now()
        WHERE user_id = v_user_id;
        
        -- Update account state
        UPDATE user_account_state
        SET 
            account_status = 'subscription_active',
            has_access = true,
            access_level = 'pro',
            subscription_status = p_status,
            current_period_end = to_timestamp(p_current_period_end),
            updated_at = now()
        WHERE user_id = v_user_id;
        
    ELSIF p_status = 'canceled' OR p_cancel_at_period_end THEN
        -- Cancelled subscription - schedule deletion after period ends
        UPDATE user_trials
        SET 
            trial_status = 'canceled',
            deletion_scheduled_at = to_timestamp(p_current_period_end) + interval '24 hours',
            updated_at = now()
        WHERE user_id = v_user_id;
        
    END IF;
    
    v_result := jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'subscription_id', p_stripe_subscription_id,
        'status', p_status,
        'synced_at', now()
    );
    
    -- Log the sync
    INSERT INTO security_audit_log (user_id, action, details)
    VALUES (v_user_id, 'STRIPE_SYNC', v_result);
    
    RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. AXIESTUDIO ACCOUNT CREATION LOGIC
-- ============================================================================

-- Function to validate AxieStudio account creation eligibility
CREATE OR REPLACE FUNCTION validate_axiestudio_creation(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_access_info jsonb;
    v_result jsonb;
BEGIN
    -- Get unified access information
    SELECT get_unified_user_access(p_user_id) INTO v_access_info;
    
    -- Check if user can create AxieStudio account
    IF (v_access_info->>'can_create_axiestudio_account')::boolean THEN
        v_result := jsonb_build_object(
            'allowed', true,
            'reason', 'User has valid access',
            'access_type', v_access_info->>'access_type',
            'has_access', true
        );
    ELSE
        v_result := jsonb_build_object(
            'allowed', false,
            'reason', CASE 
                WHEN (v_access_info->>'is_returning_user')::boolean THEN 
                    'Returning user - subscription required'
                WHEN (v_access_info->>'trial_status') = 'expired' THEN 
                    'Trial expired - subscription required'
                ELSE 
                    'No valid access - trial or subscription required'
            END,
            'access_type', v_access_info->>'access_type',
            'has_access', false,
            'is_returning_user', (v_access_info->>'is_returning_user')::boolean,
            'trial_status', v_access_info->>'trial_status',
            'subscription_status', v_access_info->>'subscription_status'
        );
    END IF;
    
    -- Log the validation attempt
    INSERT INTO security_audit_log (user_id, action, details)
    VALUES (p_user_id, 'AXIESTUDIO_VALIDATION', v_result);
    
    RETURN v_result;
END;
$$;

-- ============================================================================
-- 4. 7-DAY TRIAL MANAGEMENT SYSTEM
-- ============================================================================

-- Function to ensure consistent 7-day trial calculation
CREATE OR REPLACE FUNCTION ensure_correct_trial_dates(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_created_at timestamptz;
    v_trial_end_date timestamptz;
    v_seconds_remaining bigint;
    v_days_remaining integer;
    v_deletion_history record;
    v_result jsonb;
BEGIN
    -- Get user creation time (SINGLE SOURCE OF TRUTH)
    SELECT created_at INTO v_user_created_at
    FROM auth.users
    WHERE id = p_user_id;

    IF v_user_created_at IS NULL THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    -- Check if returning user (no trial allowed)
    SELECT * INTO v_deletion_history
    FROM deleted_account_history
    WHERE normalized_email = normalize_email((SELECT email FROM auth.users WHERE id = p_user_id));

    IF v_deletion_history IS NOT NULL THEN
        -- Returning user - expire trial immediately
        UPDATE user_trials
        SET
            trial_start_date = v_user_created_at,
            trial_end_date = v_user_created_at - interval '1 day', -- Past date
            trial_status = 'expired',
            updated_at = now()
        WHERE user_id = p_user_id;

        UPDATE user_account_state
        SET
            trial_start_date = v_user_created_at,
            trial_end_date = v_user_created_at - interval '1 day',
            trial_days_remaining = 0,
            account_status = 'trial_expired',
            has_access = false,
            updated_at = now()
        WHERE user_id = p_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'user_type', 'returning',
            'trial_allowed', false,
            'message', 'Returning user - no trial allowed'
        );
    END IF;

    -- New user - calculate correct trial dates
    v_trial_end_date := v_user_created_at + interval '7 days';
    v_seconds_remaining := GREATEST(0, EXTRACT(epoch FROM (v_trial_end_date - now()))::bigint);
    v_days_remaining := GREATEST(0, EXTRACT(days FROM (v_trial_end_date - now()))::integer);

    -- Update trial table with correct dates
    INSERT INTO user_trials (
        user_id, trial_start_date, trial_end_date, trial_status, created_at, updated_at
    ) VALUES (
        p_user_id, v_user_created_at, v_trial_end_date,
        CASE WHEN v_seconds_remaining > 0 THEN 'active' ELSE 'expired' END,
        now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        trial_start_date = EXCLUDED.trial_start_date,
        trial_end_date = EXCLUDED.trial_end_date,
        trial_status = EXCLUDED.trial_status,
        updated_at = now();

    -- Update account state with correct dates
    INSERT INTO user_account_state (
        user_id, account_status, has_access, access_level,
        trial_start_date, trial_end_date, trial_days_remaining,
        created_at, updated_at, last_activity_at
    ) VALUES (
        p_user_id,
        CASE WHEN v_seconds_remaining > 0 THEN 'trial_active' ELSE 'trial_expired' END,
        CASE WHEN v_seconds_remaining > 0 THEN true ELSE false END,
        'trial',
        v_user_created_at, v_trial_end_date, v_days_remaining,
        now(), now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        trial_start_date = EXCLUDED.trial_start_date,
        trial_end_date = EXCLUDED.trial_end_date,
        trial_days_remaining = EXCLUDED.trial_days_remaining,
        account_status = EXCLUDED.account_status,
        has_access = EXCLUDED.has_access,
        updated_at = now();

    v_result := jsonb_build_object(
        'success', true,
        'user_type', 'new',
        'trial_allowed', true,
        'trial_start_date', v_user_created_at,
        'trial_end_date', v_trial_end_date,
        'days_remaining', v_days_remaining,
        'seconds_remaining', v_seconds_remaining,
        'trial_status', CASE WHEN v_seconds_remaining > 0 THEN 'active' ELSE 'expired' END
    );

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 5. COMPREHENSIVE SECURITY LAYER
-- ============================================================================

-- Function to perform comprehensive security validation
CREATE OR REPLACE FUNCTION validate_user_security(p_user_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_access_info jsonb;
    v_security_result jsonb;
    v_threat_level text := 'low';
    v_warnings text[] := '{}';
BEGIN
    -- Get unified access information
    SELECT get_unified_user_access(p_user_id) INTO v_access_info;

    -- Security checks based on action
    CASE p_action
        WHEN 'axiestudio_creation' THEN
            IF NOT (v_access_info->>'can_create_axiestudio_account')::boolean THEN
                v_threat_level := 'high';
                v_warnings := array_append(v_warnings, 'Unauthorized AxieStudio creation attempt');
            END IF;

        WHEN 'trial_start' THEN
            IF (v_access_info->>'is_returning_user')::boolean THEN
                v_threat_level := 'critical';
                v_warnings := array_append(v_warnings, 'Trial abuse attempt by returning user');
            END IF;

        WHEN 'subscription_access' THEN
            IF (v_access_info->>'subscription_status') != 'active' AND NOT (v_access_info->>'has_access')::boolean THEN
                v_threat_level := 'medium';
                v_warnings := array_append(v_warnings, 'Unauthorized subscription access attempt');
            END IF;
    END CASE;

    -- Build security result
    v_security_result := jsonb_build_object(
        'user_id', p_user_id,
        'action', p_action,
        'threat_level', v_threat_level,
        'warnings', to_jsonb(v_warnings),
        'access_info', v_access_info,
        'timestamp', now(),
        'allowed', CASE WHEN v_threat_level IN ('critical', 'high') THEN false ELSE true END
    );

    -- Log security event
    INSERT INTO security_audit_log (user_id, action, details)
    VALUES (p_user_id, 'SECURITY_VALIDATION', v_security_result);

    RETURN v_security_result;
END;
$$;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions for all new functions
GRANT EXECUTE ON FUNCTION get_unified_user_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION sync_stripe_subscription(text, text, text, bigint, bigint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION validate_axiestudio_creation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION ensure_correct_trial_dates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION validate_user_security(uuid, text) TO service_role;

-- Grant to authenticated users for frontend access
GRANT EXECUTE ON FUNCTION get_unified_user_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_axiestudio_creation(uuid) TO authenticated;

-- ============================================================================
-- 7. VERIFICATION TESTS
-- ============================================================================

-- Test unified access control
-- SELECT get_unified_user_access('your-user-id-here');

-- Test AxieStudio validation
-- SELECT validate_axiestudio_creation('your-user-id-here');

-- Test trial date correction
-- SELECT ensure_correct_trial_dates('your-user-id-here');

-- Test security validation
-- SELECT validate_user_security('your-user-id-here', 'axiestudio_creation');

SELECT '🛡️ BULLETPROOF INTEGRATION SYSTEM DEPLOYED SUCCESSFULLY! 🛡️' as status;
