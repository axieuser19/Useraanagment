-- 🚨 CRITICAL FIX: AxieStudio Account Deactivation System
-- This SQL ensures proper tracking of AxieStudio account status during deletion
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- 1. ENSURE AXIESTUDIO_ACCOUNTS TABLE HAS PROPER STRUCTURE
-- ============================================================================

-- Update axiestudio_accounts table to ensure is_active column exists
ALTER TABLE axiestudio_accounts 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add index for better performance on is_active queries
CREATE INDEX IF NOT EXISTS idx_axiestudio_accounts_is_active 
ON axiestudio_accounts(is_active);

-- ============================================================================
-- 2. ENSURE AXIE_STUDIO_ACCOUNTS TABLE HAS PROPER STRUCTURE  
-- ============================================================================

-- Update axie_studio_accounts table to ensure account_status column exists
ALTER TABLE axie_studio_accounts 
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' 
CHECK (account_status IN ('active', 'suspended', 'deleted', 'deactivated'));

-- Add index for better performance on account_status queries
CREATE INDEX IF NOT EXISTS idx_axie_studio_accounts_status 
ON axie_studio_accounts(account_status);

-- ============================================================================
-- 3. CREATE FUNCTION TO UPDATE LOCAL AXIESTUDIO ACCOUNT STATUS
-- ============================================================================

-- Function to mark AxieStudio account as deactivated in our database
CREATE OR REPLACE FUNCTION deactivate_local_axiestudio_account(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update axiestudio_accounts table
    UPDATE axiestudio_accounts 
    SET 
        is_active = false,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Update axie_studio_accounts table
    UPDATE axie_studio_accounts 
    SET 
        account_status = 'deactivated',
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Update user_account_state table
    UPDATE user_account_state 
    SET 
        axie_studio_status = 'deactivated',
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN true;
END;
$$;

-- ============================================================================
-- 4. CREATE FUNCTION TO TRACK AXIESTUDIO DELETION ATTEMPTS
-- ============================================================================

-- Table to track AxieStudio deletion attempts and status
CREATE TABLE IF NOT EXISTS axiestudio_deletion_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('deactivation_attempt', 'deactivation_success', 'deletion_attempt', 'deletion_success', 'deletion_failed')),
    axiestudio_user_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_axiestudio_deletion_log_user_id 
ON axiestudio_deletion_log(user_id);

CREATE INDEX IF NOT EXISTS idx_axiestudio_deletion_log_action 
ON axiestudio_deletion_log(action);

-- ============================================================================
-- 5. CREATE FUNCTION TO LOG AXIESTUDIO OPERATIONS
-- ============================================================================

-- Function to log AxieStudio operations
CREATE OR REPLACE FUNCTION log_axiestudio_operation(
    p_user_id UUID,
    p_user_email TEXT,
    p_action TEXT,
    p_axiestudio_user_id TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO axiestudio_deletion_log (
        user_id,
        user_email,
        action,
        axiestudio_user_id,
        error_message,
        metadata
    ) VALUES (
        p_user_id,
        p_user_email,
        p_action,
        p_axiestudio_user_id,
        p_error_message,
        p_metadata
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- ============================================================================
-- 6. CREATE VIEW FOR AXIESTUDIO ACCOUNT STATUS MONITORING
-- ============================================================================

-- View to monitor AxieStudio account status across all tables
CREATE OR REPLACE VIEW axiestudio_account_status_view AS
SELECT 
    up.id as user_id,
    up.email,
    up.full_name,
    
    -- From axiestudio_accounts table
    aa.is_active as axiestudio_is_active,
    aa.access_token as has_access_token,
    aa.last_accessed as axiestudio_last_accessed,
    
    -- From axie_studio_accounts table  
    asa.account_status as axie_studio_account_status,
    asa.axie_studio_user_id,
    asa.axie_studio_email,
    asa.last_sync_at as axie_studio_last_sync,
    
    -- From user_account_state table
    uas.axie_studio_status as user_state_axie_status,
    uas.account_status as main_account_status,
    uas.has_access as user_has_access,
    
    -- Deletion log summary
    (
        SELECT COUNT(*) 
        FROM axiestudio_deletion_log adl 
        WHERE adl.user_id = up.id 
        AND adl.action = 'deactivation_success'
    ) as deactivation_count,
    
    (
        SELECT COUNT(*) 
        FROM axiestudio_deletion_log adl 
        WHERE adl.user_id = up.id 
        AND adl.action = 'deletion_success'
    ) as deletion_count,
    
    up.created_at as user_created_at,
    up.updated_at as user_updated_at

FROM user_profiles up
LEFT JOIN axiestudio_accounts aa ON up.id = aa.user_id
LEFT JOIN axie_studio_accounts asa ON up.id = asa.user_id  
LEFT JOIN user_account_state uas ON up.id = uas.user_id
WHERE up.is_active = true OR aa.user_id IS NOT NULL OR asa.user_id IS NOT NULL;

-- ============================================================================
-- 7. GRANT NECESSARY PERMISSIONS
-- ============================================================================

-- Grant permissions for the service role to execute these functions
GRANT EXECUTE ON FUNCTION deactivate_local_axiestudio_account(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION log_axiestudio_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- Grant permissions for authenticated users to view their own status
GRANT SELECT ON axiestudio_account_status_view TO authenticated;

-- ============================================================================
-- 8. ENABLE ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on the new table
ALTER TABLE axiestudio_deletion_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for deletion log
CREATE POLICY "Users can view their own deletion log" ON axiestudio_deletion_log
    FOR SELECT USING (auth.uid() = user_id);

-- Create RLS policy for service role (for logging operations)
CREATE POLICY "Service role can insert deletion log" ON axiestudio_deletion_log
    FOR INSERT WITH CHECK (true);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Query to check AxieStudio account status for all users
-- SELECT * FROM axiestudio_account_status_view ORDER BY user_created_at DESC LIMIT 10;

-- Query to check recent AxieStudio operations
-- SELECT * FROM axiestudio_deletion_log ORDER BY created_at DESC LIMIT 20;

-- Query to find users with deactivated AxieStudio accounts
-- SELECT * FROM axiestudio_account_status_view 
-- WHERE axiestudio_is_active = false OR axie_studio_account_status = 'deactivated';

SELECT '✅ AXIESTUDIO ACCOUNT DEACTIVATION SYSTEM SETUP COMPLETE!' as status;
