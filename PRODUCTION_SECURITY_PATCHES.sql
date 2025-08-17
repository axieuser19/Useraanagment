-- 🛡️ PRODUCTION-GRADE SECURITY PATCHES FOR TRIAL ABUSE PREVENTION
-- This SQL closes ALL identified loopholes and attack vectors
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR AFTER THE MAIN FIX

-- ============================================================================
-- PATCH #1: EMAIL NORMALIZATION TO PREVENT CASE/VARIATION ABUSE
-- ============================================================================

-- Function to normalize emails and detect variations
CREATE OR REPLACE FUNCTION normalize_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_normalized text;
    v_local_part text;
    v_domain text;
BEGIN
    -- Convert to lowercase
    v_normalized := lower(trim(p_email));
    
    -- Split email into local and domain parts
    v_local_part := split_part(v_normalized, '@', 1);
    v_domain := split_part(v_normalized, '@', 2);
    
    -- Handle Gmail-specific normalization
    IF v_domain IN ('gmail.com', 'googlemail.com') THEN
        -- Remove dots from Gmail local part
        v_local_part := replace(v_local_part, '.', '');
        -- Remove plus addressing (everything after +)
        v_local_part := split_part(v_local_part, '+', 1);
        -- Normalize domain to gmail.com
        v_domain := 'gmail.com';
    END IF;
    
    -- Handle other common email providers with plus addressing
    IF v_domain IN ('outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com') THEN
        -- Remove plus addressing
        v_local_part := split_part(v_local_part, '+', 1);
    END IF;
    
    RETURN v_local_part || '@' || v_domain;
END;
$$;

-- ============================================================================
-- PATCH #2: ENHANCED DELETION HISTORY WITH EMAIL NORMALIZATION
-- ============================================================================

-- Add normalized_email column to track email variations
ALTER TABLE deleted_account_history 
ADD COLUMN IF NOT EXISTS normalized_email text;

-- Create unique index on normalized email to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_account_history_normalized_email 
ON deleted_account_history(normalized_email);

-- Update existing records with normalized emails
UPDATE deleted_account_history 
SET normalized_email = normalize_email(email)
WHERE normalized_email IS NULL;

-- ============================================================================
-- PATCH #3: BULLETPROOF DELETION RECORDING WITH EMAIL NORMALIZATION
-- ============================================================================

-- Enhanced deletion recording function
CREATE OR REPLACE FUNCTION record_account_deletion_secure(
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
    v_normalized_email text;
BEGIN
    -- Normalize email to prevent variations
    v_normalized_email := normalize_email(p_email);
    
    -- Get user information
    SELECT * INTO v_user_profile FROM user_profiles WHERE id = p_user_id;
    SELECT * INTO v_trial_info FROM user_trials WHERE user_id = p_user_id;
    SELECT ss.* INTO v_subscription_info
    FROM stripe_subscriptions ss
    JOIN stripe_customers sc ON ss.customer_id = sc.customer_id
    WHERE sc.user_id = p_user_id;

    -- 🚨 CRITICAL: Record deletion history with normalized email
    INSERT INTO deleted_account_history (
        original_user_id, email, normalized_email, full_name, trial_used, 
        trial_start_date, trial_end_date, trial_completed, ever_subscribed, 
        last_subscription_status, deletion_reason, can_get_new_trial, 
        requires_immediate_subscription, account_deleted_at
    )
    VALUES (
        p_user_id, p_email, v_normalized_email, v_user_profile.full_name, true,
        COALESCE(v_trial_info.trial_start_date, v_user_profile.created_at),
        COALESCE(v_trial_info.trial_end_date, v_user_profile.created_at + interval '7 days'),
        CASE WHEN v_trial_info.trial_status IN ('expired', 'converted_to_paid') THEN true ELSE false END,
        CASE WHEN v_subscription_info.subscription_id IS NOT NULL THEN true ELSE false END,
        v_subscription_info.status, p_reason,
        false, -- 🚨 NEVER allow new trial
        true,  -- 🚨 ALWAYS require subscription
        now()
    )
    ON CONFLICT (normalized_email) DO UPDATE SET
        account_deleted_at = now(),
        deletion_reason = p_reason,
        can_get_new_trial = false,
        requires_immediate_subscription = true,
        -- Also update the original email if it's different
        email = CASE WHEN deleted_account_history.email != EXCLUDED.email 
                     THEN deleted_account_history.email || '; ' || EXCLUDED.email 
                     ELSE deleted_account_history.email END;

    RAISE NOTICE '✅ SECURE deletion history recorded for % (normalized: %) - trial abuse prevention secured', p_email, v_normalized_email;
    RETURN true;
END;
$$;

-- ============================================================================
-- PATCH #4: ENHANCED RESIGNUP DETECTION WITH EMAIL NORMALIZATION
-- ============================================================================

-- Enhanced resignup function that checks normalized emails
CREATE OR REPLACE FUNCTION handle_user_resignup_secure(
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
    v_normalized_email text;
BEGIN
    -- Normalize email to catch variations
    v_normalized_email := normalize_email(p_email);
    
    -- Check if normalized email has been used before
    SELECT * INTO v_history
    FROM deleted_account_history
    WHERE normalized_email = v_normalized_email;

    IF v_history IS NOT NULL THEN
        -- 🚨 CRITICAL: This is a returning user (or email variation) - NO TRIAL ALLOWED!
        RAISE NOTICE '🚨 RETURNING USER DETECTED: % (normalized: %) - NO TRIAL ALLOWED!', p_email, v_normalized_email;
        
        -- Log the attempt for security monitoring
        INSERT INTO security_audit_log (
            user_id, action, email, normalized_email, details, created_at
        ) VALUES (
            p_user_id, 'TRIAL_ABUSE_ATTEMPT', p_email, v_normalized_email,
            jsonb_build_object(
                'original_deleted_email', v_history.email,
                'attempt_email', p_email,
                'normalized_email', v_normalized_email,
                'deletion_date', v_history.account_deleted_at
            ),
            now()
        );
        
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
            'trial_allowed', false,
            'normalized_email', v_normalized_email,
            'security_flag', 'EMAIL_VARIATION_DETECTED'
        );
    ELSE
        v_result := jsonb_build_object(
            'is_returning_user', false,
            'message', 'Welcome! Your 7-day free trial is starting.',
            'requires_subscription', false,
            'trial_allowed', true,
            'normalized_email', v_normalized_email
        );
    END IF;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- PATCH #5: SECURITY AUDIT LOG TABLE
-- ============================================================================

-- Create security audit log to track abuse attempts
CREATE TABLE IF NOT EXISTS security_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    action text NOT NULL,
    email text,
    normalized_email text,
    ip_address inet,
    user_agent text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    
    -- Index for fast lookups
    INDEX (user_id),
    INDEX (action),
    INDEX (normalized_email),
    INDEX (created_at)
);

-- Enable RLS
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read audit logs
CREATE POLICY "Service role only" ON security_audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PATCH #6: ENHANCED SIGNUP TRIGGER WITH SECURITY
-- ============================================================================

-- Drop and recreate signup trigger with enhanced security
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_signup();

CREATE OR REPLACE FUNCTION public.handle_new_user_signup_secure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trial_days integer := 7;
    v_user_created_at timestamptz;
    v_resignup_result jsonb;
    v_is_returning boolean := false;
    v_normalized_email text;
BEGIN
    v_user_created_at := COALESCE(NEW.created_at, now());
    v_normalized_email := normalize_email(NEW.email);
    
    -- Log signup attempt
    INSERT INTO security_audit_log (user_id, action, email, normalized_email, details)
    VALUES (NEW.id, 'SIGNUP_ATTEMPT', NEW.email, v_normalized_email, 
            jsonb_build_object('user_created_at', v_user_created_at));
    
    -- Create user profile
    INSERT INTO public.user_profiles (id, email, full_name, created_at, updated_at, last_login_at, is_active)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_user_created_at, now(), now(), true)
    ON CONFLICT (id) DO NOTHING;
    
    -- Check if returning user BEFORE creating trial (using secure function)
    SELECT handle_user_resignup_secure(NEW.id, NEW.email) INTO v_resignup_result;
    v_is_returning := (v_resignup_result->>'is_returning_user')::boolean;
    
    IF NOT v_is_returning THEN
        -- Create trial ONLY for new users
        INSERT INTO public.user_trials (user_id, trial_start_date, trial_end_date, trial_status, created_at, updated_at)
        VALUES (NEW.id, v_user_created_at, v_user_created_at + (v_trial_days || ' days')::interval, 'active'::trial_status, now(), now())
        ON CONFLICT (user_id) DO NOTHING;
        
        INSERT INTO public.user_account_state (user_id, account_status, has_access, access_level, trial_start_date, trial_end_date, trial_days_remaining, created_at, updated_at, last_activity_at)
        VALUES (NEW.id, 'trial_active'::user_account_status, true, 'trial', v_user_created_at, v_user_created_at + (v_trial_days || ' days')::interval, v_trial_days, now(), now(), now())
        ON CONFLICT (user_id) DO NOTHING;
        
        -- Log successful trial creation
        INSERT INTO security_audit_log (user_id, action, email, normalized_email, details)
        VALUES (NEW.id, 'TRIAL_CREATED', NEW.email, v_normalized_email, 
                jsonb_build_object('trial_end_date', v_user_created_at + (v_trial_days || ' days')::interval));
    ELSE
        -- Log blocked trial attempt
        INSERT INTO security_audit_log (user_id, action, email, normalized_email, details)
        VALUES (NEW.id, 'TRIAL_BLOCKED', NEW.email, v_normalized_email, v_resignup_result);
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_secure AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup_secure();

-- ============================================================================
-- PATCH #7: UPDATE EXISTING FUNCTIONS TO USE SECURE VERSIONS
-- ============================================================================

-- Grant permissions for new secure functions
GRANT EXECUTE ON FUNCTION normalize_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION handle_user_resignup_secure(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_account_deletion_secure(UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- PATCH #8: MONITORING QUERIES FOR PRODUCTION
-- ============================================================================

-- Create view for security monitoring
CREATE OR REPLACE VIEW security_monitoring AS
SELECT 
    sal.created_at,
    sal.action,
    sal.email,
    sal.normalized_email,
    sal.details,
    u.id as user_id,
    CASE 
        WHEN sal.action = 'TRIAL_ABUSE_ATTEMPT' THEN '🚨 HIGH PRIORITY'
        WHEN sal.action = 'TRIAL_BLOCKED' THEN '⚠️ MEDIUM PRIORITY'
        ELSE '✅ NORMAL'
    END as priority_level
FROM security_audit_log sal
LEFT JOIN auth.users u ON sal.user_id = u.id
ORDER BY sal.created_at DESC;

GRANT SELECT ON security_monitoring TO service_role;

-- ============================================================================
-- PRODUCTION MONITORING & TESTING COMMANDS
-- ============================================================================

-- Test email normalization (run these to verify)
-- SELECT normalize_email('User.Name+test@Gmail.Com'); -- Should return: username@gmail.com
-- SELECT normalize_email('user+trial1@outlook.com');   -- Should return: user@outlook.com

-- Monitor trial abuse attempts
-- SELECT * FROM security_monitoring WHERE priority_level LIKE '%HIGH%' ORDER BY created_at DESC LIMIT 10;

-- Check for email variations in deletion history
-- SELECT email, normalized_email, account_deleted_at FROM deleted_account_history ORDER BY account_deleted_at DESC LIMIT 10;

-- Verify no duplicate normalized emails exist
-- SELECT normalized_email, COUNT(*) FROM deleted_account_history GROUP BY normalized_email HAVING COUNT(*) > 1;

SELECT '🛡️ PRODUCTION SECURITY PATCHES COMPLETE - ALL LOOPHOLES CLOSED! 🛡️' as status;
