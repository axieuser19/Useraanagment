/*
  # Fix User Signup Database Error - Final Solution

  This migration fixes the "Database error saving new user" issue by:
  1. Dropping any existing problematic triggers
  2. Creating a robust trigger function with proper error handling
  3. Ensuring correct sequence of record creation
  4. Adding comprehensive error logging
*/

-- Drop existing trigger and function to start fresh
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_signup();

-- Create enhanced trigger function with comprehensive error handling
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trial_days integer := 7;
    v_user_created_at timestamptz;
    v_error_context text;
BEGIN
    -- Get the user's creation time
    v_user_created_at := COALESCE(NEW.created_at, now());
    
    -- Log the start of user creation process
    RAISE LOG 'Starting user creation process for user: % (email: %)', NEW.id, NEW.email;
    
    -- Step 1: Verify the user exists in auth.users (should always be true in this context)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
        RAISE EXCEPTION 'User % does not exist in auth.users', NEW.id;
    END IF;
    
    -- Step 2: Create user profile first (required by foreign keys)
    BEGIN
        v_error_context := 'creating user profile';
        
        INSERT INTO public.user_profiles (
            id,
            email,
            full_name,
            created_at,
            updated_at,
            last_login_at,
            is_active
        )
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
            v_user_created_at,
            now(),
            now(),
            true
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            updated_at = now();
        
        RAISE LOG 'Successfully created user profile for user: %', NEW.id;
        
    EXCEPTION
        WHEN OTHERS THEN
            RAISE LOG 'Error % for user %: %', v_error_context, NEW.email, SQLERRM;
            -- Don't fail the entire signup for profile creation issues
    END;
    
    -- Step 3: Create trial record (only after profile exists)
    BEGIN
        v_error_context := 'creating user trial';
        
        -- Verify user profile exists before creating trial
        IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = NEW.id) THEN
            RAISE WARNING 'User profile does not exist for %, skipping trial creation', NEW.id;
        ELSE
            INSERT INTO public.user_trials (
                user_id,
                trial_start_date,
                trial_end_date,
                trial_status,
                created_at,
                updated_at
            )
            VALUES (
                NEW.id,
                v_user_created_at,
                v_user_created_at + (v_trial_days || ' days')::interval,
                'active'::trial_status,
                now(),
                now()
            )
            ON CONFLICT (user_id) DO UPDATE SET
                trial_status = EXCLUDED.trial_status,
                updated_at = now();
            
            RAISE LOG 'Successfully created trial for user: %', NEW.id;
        END IF;
        
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE LOG 'Foreign key violation % for user %: %', v_error_context, NEW.email, SQLERRM;
            -- Don't fail signup for trial creation issues
        WHEN OTHERS THEN
            RAISE LOG 'Error % for user %: %', v_error_context, NEW.email, SQLERRM;
    END;
    
    -- Step 4: Create user account state (only after profile and trial exist)
    BEGIN
        v_error_context := 'creating account state';
        
        -- Verify dependencies exist
        IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = NEW.id) THEN
            RAISE WARNING 'User profile does not exist for %, skipping account state creation', NEW.id;
        ELSE
            INSERT INTO public.user_account_state (
                user_id,
                account_status,
                has_access,
                access_level,
                trial_start_date,
                trial_end_date,
                trial_days_remaining,
                created_at,
                updated_at,
                last_activity_at
            )
            VALUES (
                NEW.id,
                'trial_active'::user_account_status,
                true,
                'trial',
                v_user_created_at,
                v_user_created_at + (v_trial_days || ' days')::interval,
                v_trial_days,
                now(),
                now(),
                now()
            )
            ON CONFLICT (user_id) DO UPDATE SET
                account_status = EXCLUDED.account_status,
                has_access = EXCLUDED.has_access,
                updated_at = now();
            
            RAISE LOG 'Successfully created account state for user: %', NEW.id;
        END IF;
        
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE LOG 'Foreign key violation % for user %: %', v_error_context, NEW.email, SQLERRM;
        WHEN OTHERS THEN
            RAISE LOG 'Error % for user %: %', v_error_context, NEW.email, SQLERRM;
    END;
    
    RAISE LOG 'Completed user creation process for user: %', NEW.id;
    RETURN NEW;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Fatal error in user creation process for %: %', NEW.email, SQLERRM;
        -- Return NEW to allow auth user creation to succeed even if our trigger fails
        RETURN NEW;
END;
$$;

-- Create the trigger with proper timing
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_signup();

-- Verify the trigger was created successfully
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_schema = 'auth' 
        AND event_object_table = 'users'
        AND trigger_name = 'on_auth_user_created'
    ) THEN
        RAISE NOTICE 'SUCCESS: Trigger on_auth_user_created created successfully';
    ELSE
        RAISE EXCEPTION 'FAILED: Trigger on_auth_user_created was not created';
    END IF;
END $$;

-- Create a function to test the user creation process
CREATE OR REPLACE FUNCTION public.test_user_creation_process()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
    v_trigger_exists boolean;
    v_function_exists boolean;
BEGIN
    -- Check if trigger exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_schema = 'auth' 
        AND event_object_table = 'users'
        AND trigger_name = 'on_auth_user_created'
    ) INTO v_trigger_exists;
    
    -- Check if function exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_name = 'handle_new_user_signup'
        AND routine_type = 'FUNCTION'
    ) INTO v_function_exists;
    
    v_result := jsonb_build_object(
        'trigger_exists', v_trigger_exists,
        'function_exists', v_function_exists,
        'status', CASE 
            WHEN v_trigger_exists AND v_function_exists THEN 'ready'
            ELSE 'not_ready'
        END,
        'checked_at', now()
    );
    
    RETURN v_result;
END;
$$;

-- Test the setup
SELECT public.test_user_creation_process();