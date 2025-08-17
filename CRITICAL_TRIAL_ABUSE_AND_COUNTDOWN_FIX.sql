-- 🚨 CRITICAL FIX: Trial Abuse Prevention & Real-Time Countdown System
-- This SQL fixes ALL the critical issues you mentioned:
-- 1. Trial abuse prevention (no more free trials for returning users)
-- 2. Proper deletion history recording
-- 3. Real-time countdown using correct dates
-- 4. Premium users not showing trial time

-- ============================================================================
-- 1. FIX TRIAL ABUSE PREVENTION - STRENGTHEN RESIGNUP HANDLING
-- ============================================================================

-- Drop existing function first to avoid conflicts
DROP FUNCTION IF EXISTS handle_user_resignup(uuid, text);

-- Enhanced function to handle user re-signup with STRICT trial abuse prevention
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
            trial_end_date = now() - interval '1 day', -- Set to past date
            deletion_scheduled_at = NULL, -- Don't delete, they need to subscribe
            updated_at = now()
        WHERE user_id = p_user_id;

        -- Update account state to require immediate subscription
        UPDATE user_account_state
        SET
            account_status = 'trial_expired',
            has_access = false, -- 🚨 NO ACCESS until they subscribe
            access_level = 'suspended',
            trial_days_remaining = 0, -- 🚨 ZERO days remaining
            trial_end_date = now() - interval '1 day', -- Past date
            updated_at = now()
        WHERE user_id = p_user_id;

        v_result := jsonb_build_object(
            'is_returning_user', true,
            'message', 'WELCOME BACK! No free trial available. Please subscribe to continue.',
            'requires_subscription', true,
            'trial_allowed', false,
            'previous_deletion_reason', v_history.deletion_reason,
            'deleted_at', v_history.account_deleted_at
        );
    ELSE
        -- New user - allow normal trial
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
-- 2. FIX DELETION HISTORY RECORDING - ENSURE IT'S ALWAYS SAVED
-- ============================================================================

-- Drop existing function first to avoid return type conflict
DROP FUNCTION IF EXISTS record_account_deletion(uuid, text, text);
DROP FUNCTION IF EXISTS record_account_deletion(uuid, text);

-- Enhanced function to record account deletion with better error handling
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
    -- Get user profile information
    SELECT * INTO v_user_profile
    FROM user_profiles
    WHERE id = p_user_id;

    -- Get trial information
    SELECT * INTO v_trial_info
    FROM user_trials
    WHERE user_id = p_user_id;

    -- Get subscription information
    SELECT ss.* INTO v_subscription_info
    FROM stripe_subscriptions ss
    JOIN stripe_customers sc ON ss.customer_id = sc.customer_id
    WHERE sc.user_id = p_user_id;

    -- 🚨 CRITICAL: Record deletion history (this prevents trial abuse)
    INSERT INTO deleted_account_history (
        original_user_id,
        email,
        full_name,
        trial_used,
        trial_start_date,
        trial_end_date,
        trial_completed,
        ever_subscribed,
        last_subscription_status,
        subscription_cancelled_date,
        deletion_reason,
        can_get_new_trial,
        requires_immediate_subscription,
        account_deleted_at
    )
    VALUES (
        p_user_id,
        p_email,
        v_user_profile.full_name,
        true, -- They used their trial (even if partial)
        COALESCE(v_trial_info.trial_start_date, v_user_profile.created_at),
        COALESCE(v_trial_info.trial_end_date, v_user_profile.created_at + interval '7 days'),
        CASE 
            WHEN v_trial_info.trial_status IN ('expired', 'converted_to_paid') THEN true 
            ELSE false 
        END,
        CASE WHEN v_subscription_info.subscription_id IS NOT NULL THEN true ELSE false END,
        v_subscription_info.status,
        CASE 
            WHEN v_subscription_info.status = 'canceled' THEN now() 
            ELSE NULL 
        END,
        p_reason,
        false, -- 🚨 NEVER allow new trial
        true,  -- 🚨 ALWAYS require subscription
        now()
    )
    ON CONFLICT (email) DO UPDATE SET
        account_deleted_at = now(),
        deletion_reason = p_reason,
        can_get_new_trial = false, -- 🚨 Ensure this is always false
        requires_immediate_subscription = true; -- 🚨 Ensure this is always true

    RAISE NOTICE '✅ Deletion history recorded for % - trial abuse prevention secured', p_email;
    RETURN true;
END;
$$;

-- ============================================================================
-- 3. FIX REAL-TIME COUNTDOWN - USE CORRECT DATES FROM USER CREATION
-- ============================================================================

-- Drop existing function first to avoid conflicts
DROP FUNCTION IF EXISTS fix_trial_dates_for_user(uuid);

-- Function to fix trial dates based on actual user creation time
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
    -- Get actual user creation time from auth.users
    SELECT created_at INTO v_user_created_at
    FROM auth.users
    WHERE id = p_user_id;
    
    IF v_user_created_at IS NULL THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;
    
    -- Calculate correct trial end date (7 days from user creation)
    v_trial_end_date := v_user_created_at + interval '7 days';
    
    -- Calculate remaining time
    v_seconds_remaining := GREATEST(0, EXTRACT(epoch FROM (v_trial_end_date - now()))::bigint);
    v_days_remaining := GREATEST(0, EXTRACT(days FROM (v_trial_end_date - now()))::integer);
    
    -- Update user_trials with correct dates
    UPDATE user_trials 
    SET 
        trial_start_date = v_user_created_at,
        trial_end_date = v_trial_end_date,
        trial_status = CASE 
            WHEN v_seconds_remaining > 0 THEN 'active'
            ELSE 'expired'
        END,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- Update user_account_state with correct dates and countdown
    UPDATE user_account_state 
    SET 
        trial_start_date = v_user_created_at,
        trial_end_date = v_trial_end_date,
        trial_days_remaining = v_days_remaining,
        account_status = CASE 
            WHEN v_seconds_remaining > 0 THEN 'trial_active'::user_account_status
            ELSE 'trial_expired'::user_account_status
        END,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    RAISE NOTICE '✅ Fixed trial dates for user % - trial ends at %', p_user_id, v_trial_end_date;
    RETURN true;
END;
$$;

-- ============================================================================
-- 4. CREATE VIEW FOR ACCURATE REAL-TIME TRIAL STATUS
-- ============================================================================

-- View that calculates real-time trial status and countdown
CREATE OR REPLACE VIEW user_trial_realtime AS
SELECT 
    u.id as user_id,
    u.email,
    u.created_at as user_created_at,
    ut.trial_start_date,
    ut.trial_end_date,
    ut.trial_status as stored_trial_status,
    
    -- Real-time calculations based on user creation time
    u.created_at + interval '7 days' as correct_trial_end_date,
    GREATEST(0, EXTRACT(epoch FROM ((u.created_at + interval '7 days') - now()))::bigint) as seconds_remaining_realtime,
    GREATEST(0, EXTRACT(days FROM ((u.created_at + interval '7 days') - now()))::integer) as days_remaining_realtime,
    GREATEST(0, EXTRACT(hours FROM ((u.created_at + interval '7 days') - now()))::integer) as hours_remaining_realtime,
    GREATEST(0, EXTRACT(minutes FROM ((u.created_at + interval '7 days') - now()))::integer) as minutes_remaining_realtime,
    
    -- Real-time trial status
    CASE 
        WHEN (u.created_at + interval '7 days') > now() THEN 'active'
        ELSE 'expired'
    END as realtime_trial_status,
    
    -- Check if user has active subscription (should not show trial countdown)
    CASE 
        WHEN ss.status = 'active' THEN true
        ELSE false
    END as has_active_subscription,
    
    -- Check if user is returning (should not have trial)
    CASE 
        WHEN dah.email IS NOT NULL THEN true
        ELSE false
    END as is_returning_user,
    
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
-- 5. FIX ALL EXISTING USERS' TRIAL DATES
-- ============================================================================

-- Fix trial dates for all existing users
DO $$
DECLARE
    user_record RECORD;
    fixed_count INTEGER := 0;
BEGIN
    FOR user_record IN 
        SELECT id FROM auth.users WHERE email IS NOT NULL
    LOOP
        BEGIN
            PERFORM fix_trial_dates_for_user(user_record.id);
            fixed_count := fixed_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to fix trial dates for user %: %', user_record.id, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '✅ Fixed trial dates for % users', fixed_count;
END $$;

-- ============================================================================
-- 6. ENHANCED SIGNUP TRIGGER - PREVENT TRIAL ABUSE
-- ============================================================================

-- Drop existing trigger and function first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_signup();

-- Enhanced signup trigger that prevents trial abuse
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
    -- Get the user's creation time
    v_user_created_at := COALESCE(NEW.created_at, now());
    
    RAISE NOTICE '🚀 Processing signup for: % (created at: %)', NEW.email, v_user_created_at;
    
    -- Step 1: Create user profile
    INSERT INTO public.user_profiles (
        id, email, full_name, created_at, updated_at, last_login_at, is_active
    )
    VALUES (
        NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        v_user_created_at, now(), now(), true
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Step 2: Check if returning user BEFORE creating trial
    SELECT handle_user_resignup(NEW.id, NEW.email) INTO v_resignup_result;
    v_is_returning := (v_resignup_result->>'is_returning_user')::boolean;
    
    IF NOT v_is_returning THEN
        -- Step 3: Create trial record ONLY for new users
        INSERT INTO public.user_trials (
            user_id, trial_start_date, trial_end_date, trial_status, created_at, updated_at
        )
        VALUES (
            NEW.id, v_user_created_at, v_user_created_at + (v_trial_days || ' days')::interval,
            'active'::trial_status, now(), now()
        )
        ON CONFLICT (user_id) DO NOTHING;
        
        -- Step 4: Create user account state for new users
        INSERT INTO public.user_account_state (
            user_id, account_status, has_access, access_level,
            trial_start_date, trial_end_date, trial_days_remaining,
            created_at, updated_at, last_activity_at
        )
        VALUES (
            NEW.id, 'trial_active'::user_account_status, true, 'trial',
            v_user_created_at, v_user_created_at + (v_trial_days || ' days')::interval, v_trial_days,
            now(), now(), now()
        )
        ON CONFLICT (user_id) DO NOTHING;
        
        RAISE NOTICE '✅ NEW USER: Trial created for %', NEW.email;
    ELSE
        RAISE NOTICE '🚨 RETURNING USER: No trial for %', NEW.email;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_signup();

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION handle_user_resignup(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_account_deletion(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fix_trial_dates_for_user(UUID) TO service_role;
GRANT SELECT ON user_trial_realtime TO authenticated;
GRANT SELECT ON user_trial_realtime TO service_role;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check trial abuse prevention
-- SELECT * FROM deleted_account_history ORDER BY account_deleted_at DESC LIMIT 10;

-- Check real-time trial status
-- SELECT * FROM user_trial_realtime ORDER BY user_created_at DESC LIMIT 10;

-- Check users with wrong trial dates
-- SELECT user_id, email, user_created_at, trial_start_date, 
--        CASE WHEN user_created_at = trial_start_date THEN '✅ CORRECT' ELSE '❌ WRONG' END as status
-- FROM user_trial_realtime WHERE trial_start_date IS NOT NULL;

SELECT '🚨 CRITICAL TRIAL ABUSE & COUNTDOWN FIXES COMPLETE! 🚨' as status;
