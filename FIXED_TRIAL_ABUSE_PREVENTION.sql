-- 🚨 FIXED: Trial Abuse Prevention & Real-Time Countdown System
-- This SQL fixes the function conflicts and implements all critical fixes
-- Copy and paste this EXACT SQL into your Supabase SQL Editor

-- ============================================================================
-- 1. DROP EXISTING FUNCTIONS TO AVOID CONFLICTS
-- ============================================================================

-- Drop all existing functions that might have signature conflicts
DROP FUNCTION IF EXISTS handle_user_resignup(uuid, text);
DROP FUNCTION IF EXISTS record_account_deletion(uuid, text, text);
DROP FUNCTION IF EXISTS record_account_deletion(uuid, text);
DROP FUNCTION IF EXISTS fix_trial_dates_for_user(uuid);
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_signup();

-- ============================================================================
-- 2. ENHANCED TRIAL ABUSE PREVENTION
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_user_resignup(
    p_user_id uuid,
    p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_history record;
    v_result jsonb;
BEGIN
    -- Check if email has been used before
    SELECT * INTO v_history
    FROM deleted_account_history
    WHERE email = p_email;

    IF v_history IS NOT NULL THEN
        -- 🚨 CRITICAL: This is a returning user - NO TRIAL ALLOWED!
        RAISE NOTICE '🚨 RETURNING USER DETECTED: % - NO TRIAL ALLOWED!', p_email;
        
        -- Immediately expire any trial that might have been created
        UPDATE user_trials
        SET
            trial_status = 'expired',
            trial_end_date = now() - interval '1 day',
            deletion_scheduled_at = NULL,
            updated_at = now()
        WHERE user_id = p_user_id;

        -- Update account state to require immediate subscription
        UPDATE user_account_state
        SET
            account_status = 'trial_expired',
            has_access = false,
            access_level = 'suspended',
            trial_days_remaining = 0,
            trial_end_date = now() - interval '1 day',
            updated_at = now()
        WHERE user_id = p_user_id;

        v_result := jsonb_build_object(
            'is_returning_user', true,
            'message', 'WELCOME BACK! No free trial available. Please subscribe to continue.',
            'requires_subscription', true,
            'trial_allowed', false
        );
    ELSE
        v_result := jsonb_build_object(
            'is_returning_user', false,
            'message', 'Welcome! Your 7-day free trial is starting.',
            'requires_subscription', false,
            'trial_allowed', true
        );
    END IF;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. BULLETPROOF DELETION HISTORY RECORDING
-- ============================================================================

CREATE OR REPLACE FUNCTION record_account_deletion(
    p_user_id uuid,
    p_email text,
    p_reason text DEFAULT 'immediate_deletion'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trial_info record;
    v_subscription_info record;
    v_user_profile record;
BEGIN
    -- Get user information
    SELECT * INTO v_user_profile FROM user_profiles WHERE id = p_user_id;
    SELECT * INTO v_trial_info FROM user_trials WHERE user_id = p_user_id;
    SELECT ss.* INTO v_subscription_info
    FROM stripe_subscriptions ss
    JOIN stripe_customers sc ON ss.customer_id = sc.customer_id
    WHERE sc.user_id = p_user_id;

    -- 🚨 CRITICAL: Record deletion history (prevents trial abuse)
    INSERT INTO deleted_account_history (
        original_user_id, email, full_name, trial_used, trial_start_date, trial_end_date,
        trial_completed, ever_subscribed, last_subscription_status, deletion_reason,
        can_get_new_trial, requires_immediate_subscription, account_deleted_at
    )
    VALUES (
        p_user_id, p_email, v_user_profile.full_name, true,
        COALESCE(v_trial_info.trial_start_date, v_user_profile.created_at),
        COALESCE(v_trial_info.trial_end_date, v_user_profile.created_at + interval '7 days'),
        CASE WHEN v_trial_info.trial_status IN ('expired', 'converted_to_paid') THEN true ELSE false END,
        CASE WHEN v_subscription_info.subscription_id IS NOT NULL THEN true ELSE false END,
        v_subscription_info.status, p_reason,
        false, -- 🚨 NEVER allow new trial
        true,  -- 🚨 ALWAYS require subscription
        now()
    )
    ON CONFLICT (email) DO UPDATE SET
        account_deleted_at = now(),
        deletion_reason = p_reason,
        can_get_new_trial = false,
        requires_immediate_subscription = true;

    RAISE NOTICE '✅ Deletion history recorded for % - trial abuse prevention secured', p_email;
    RETURN true;
END;
$$;

-- ============================================================================
-- 4. REAL-TIME COUNTDOWN FIX
-- ============================================================================

CREATE OR REPLACE FUNCTION fix_trial_dates_for_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_created_at timestamptz;
    v_trial_end_date timestamptz;
    v_days_remaining integer;
    v_seconds_remaining bigint;
BEGIN
    -- Get actual user creation time
    SELECT created_at INTO v_user_created_at FROM auth.users WHERE id = p_user_id;
    
    IF v_user_created_at IS NULL THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;
    
    -- Calculate correct trial end date (7 days from user creation)
    v_trial_end_date := v_user_created_at + interval '7 days';
    v_seconds_remaining := GREATEST(0, EXTRACT(epoch FROM (v_trial_end_date - now()))::bigint);
    v_days_remaining := GREATEST(0, EXTRACT(days FROM (v_trial_end_date - now()))::integer);
    
    -- Update with correct dates
    UPDATE user_trials 
    SET trial_start_date = v_user_created_at, trial_end_date = v_trial_end_date,
        trial_status = CASE WHEN v_seconds_remaining > 0 THEN 'active' ELSE 'expired' END,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    UPDATE user_account_state 
    SET trial_start_date = v_user_created_at, trial_end_date = v_trial_end_date,
        trial_days_remaining = v_days_remaining,
        account_status = CASE WHEN v_seconds_remaining > 0 THEN 'trial_active'::user_account_status ELSE 'trial_expired'::user_account_status END,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    RETURN true;
END;
$$;

-- ============================================================================
-- 5. REAL-TIME TRIAL STATUS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW user_trial_realtime AS
SELECT 
    u.id as user_id, u.email, u.created_at as user_created_at,
    ut.trial_start_date, ut.trial_end_date, ut.trial_status as stored_trial_status,
    
    -- Real-time calculations
    u.created_at + interval '7 days' as correct_trial_end_date,
    GREATEST(0, EXTRACT(epoch FROM ((u.created_at + interval '7 days') - now()))::bigint) as seconds_remaining_realtime,
    GREATEST(0, EXTRACT(days FROM ((u.created_at + interval '7 days') - now()))::integer) as days_remaining_realtime,
    
    -- Real-time status
    CASE WHEN (u.created_at + interval '7 days') > now() THEN 'active' ELSE 'expired' END as realtime_trial_status,
    CASE WHEN ss.status = 'active' THEN true ELSE false END as has_active_subscription,
    CASE WHEN dah.email IS NOT NULL THEN true ELSE false END as is_returning_user,
    
    -- Final display status for UI
    CASE 
        WHEN ss.status = 'active' THEN 'PREMIUM_ACTIVE'
        WHEN dah.email IS NOT NULL THEN 'RETURNING_USER_NO_TRIAL'
        WHEN (u.created_at + interval '7 days') > now() THEN 'TRIAL_ACTIVE'
        ELSE 'TRIAL_EXPIRED'
    END as display_status

FROM auth.users u
LEFT JOIN user_trials ut ON u.id = ut.user_id
LEFT JOIN user_account_state uas ON u.id = uas.user_id
LEFT JOIN stripe_customers sc ON u.id = sc.user_id
LEFT JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id AND ss.status = 'active'
LEFT JOIN deleted_account_history dah ON u.email = dah.email
WHERE u.email IS NOT NULL;

-- ============================================================================
-- 6. FIX ALL EXISTING USERS
-- ============================================================================

DO $$
DECLARE
    user_record RECORD;
    fixed_count INTEGER := 0;
BEGIN
    FOR user_record IN SELECT id FROM auth.users WHERE email IS NOT NULL
    LOOP
        BEGIN
            PERFORM fix_trial_dates_for_user(user_record.id);
            fixed_count := fixed_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to fix user %: %', user_record.id, SQLERRM;
        END;
    END LOOP;
    RAISE NOTICE '✅ Fixed trial dates for % users', fixed_count;
END $$;

-- ============================================================================
-- 7. ENHANCED SIGNUP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trial_days integer := 7;
    v_user_created_at timestamptz;
    v_resignup_result jsonb;
    v_is_returning boolean := false;
BEGIN
    v_user_created_at := COALESCE(NEW.created_at, now());
    
    -- Create user profile
    INSERT INTO public.user_profiles (id, email, full_name, created_at, updated_at, last_login_at, is_active)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_user_created_at, now(), now(), true)
    ON CONFLICT (id) DO NOTHING;
    
    -- Check if returning user BEFORE creating trial
    SELECT handle_user_resignup(NEW.id, NEW.email) INTO v_resignup_result;
    v_is_returning := (v_resignup_result->>'is_returning_user')::boolean;
    
    IF NOT v_is_returning THEN
        -- Create trial ONLY for new users
        INSERT INTO public.user_trials (user_id, trial_start_date, trial_end_date, trial_status, created_at, updated_at)
        VALUES (NEW.id, v_user_created_at, v_user_created_at + (v_trial_days || ' days')::interval, 'active'::trial_status, now(), now())
        ON CONFLICT (user_id) DO NOTHING;
        
        INSERT INTO public.user_account_state (user_id, account_status, has_access, access_level, trial_start_date, trial_end_date, trial_days_remaining, created_at, updated_at, last_activity_at)
        VALUES (NEW.id, 'trial_active'::user_account_status, true, 'trial', v_user_created_at, v_user_created_at + (v_trial_days || ' days')::interval, v_trial_days, now(), now(), now())
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

-- ============================================================================
-- 8. PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION handle_user_resignup(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_account_deletion(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fix_trial_dates_for_user(UUID) TO service_role;
GRANT SELECT ON user_trial_realtime TO authenticated;
GRANT SELECT ON user_trial_realtime TO service_role;

SELECT '🚨 ALL CRITICAL FIXES COMPLETE - NO MORE FUNCTION CONFLICTS! 🚨' as status;
