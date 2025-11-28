-- Quick Debug and Fix for Verification System
-- This script will help identify and fix the verification system issues

-- Function to create a test verification session with items
CREATE OR REPLACE FUNCTION debug_create_test_verification()
RETURNS TABLE(
    session_id UUID,
    items_created INTEGER,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    test_session_id UUID;
    test_submission_id TEXT := 'TEST_' || extract(epoch from now())::text;
    items_count INTEGER;
BEGIN
    -- Create a test lead first
    INSERT INTO public.leads (
        submission_id,
        customer_full_name,
        phone_number,
        lead_vendor
    ) VALUES (
        test_submission_id,
        'Test Customer',
        '555-0123',
        'Test Vendor'
    );

    -- Create a test verification session
    INSERT INTO public.verification_sessions (
        submission_id,
        status,
        progress_percentage,
        verified_fields,
        total_fields
    ) VALUES (
        test_submission_id,
        'pending',
        0,
        0,
        0
    )
    RETURNING id INTO test_session_id;

    -- Call the initialize function
    PERFORM public.initialize_verification_items(test_session_id, test_submission_id);

    -- Count items created
    SELECT COUNT(*) INTO items_count 
    FROM public.verification_items 
    WHERE session_id = test_session_id;

    RETURN QUERY SELECT 
        test_session_id,
        items_count,
        'Test verification session created successfully'::TEXT;
END;
$$;

-- Function to check RLS policies and permissions
CREATE OR REPLACE FUNCTION debug_check_permissions()
RETURNS TABLE(
    check_type TEXT,
    result TEXT,
    details TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check if RLS is enabled
    RETURN QUERY 
    SELECT 
        'RLS Status'::TEXT,
        CASE WHEN relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END::TEXT,
        'Row Level Security on verification_items'::TEXT
    FROM pg_class 
    WHERE relname = 'verification_items';

    -- Check current user
    RETURN QUERY
    SELECT 
        'Current User'::TEXT,
        current_user::TEXT,
        'Database user executing queries'::TEXT;

    -- Check if user can see verification_items
    RETURN QUERY
    SELECT 
        'Table Access'::TEXT,
        CASE WHEN has_table_privilege('verification_items', 'SELECT') 
             THEN 'CAN SELECT' 
             ELSE 'CANNOT SELECT' 
        END::TEXT,
        'SELECT permission on verification_items'::TEXT;

    -- Check if user can update verification_items
    RETURN QUERY
    SELECT 
        'Update Access'::TEXT,
        CASE WHEN has_table_privilege('verification_items', 'UPDATE') 
             THEN 'CAN UPDATE' 
             ELSE 'CANNOT UPDATE' 
        END::TEXT,
        'UPDATE permission on verification_items'::TEXT;
END;
$$;

-- Function to test verification item updates
CREATE OR REPLACE FUNCTION debug_test_verification_update(item_id_param UUID)
RETURNS TABLE(
    operation TEXT,
    success BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    update_count INTEGER;
BEGIN
    -- Test if we can find the item
    RETURN QUERY
    SELECT 
        'FIND ITEM'::TEXT,
        EXISTS(SELECT 1 FROM public.verification_items WHERE id = item_id_param),
        CASE WHEN EXISTS(SELECT 1 FROM public.verification_items WHERE id = item_id_param)
             THEN 'Item found'
             ELSE 'Item not found'
        END::TEXT;

    -- Test if we can update the item
    BEGIN
        UPDATE public.verification_items 
        SET is_verified = NOT is_verified,
            updated_at = now()
        WHERE id = item_id_param;
        
        GET DIAGNOSTICS update_count = ROW_COUNT;
        
        RETURN QUERY
        SELECT 
            'UPDATE ITEM'::TEXT,
            update_count > 0,
            CASE WHEN update_count > 0 
                 THEN 'Update successful' 
                 ELSE 'No rows updated'
            END::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY
        SELECT 
            'UPDATE ITEM'::TEXT,
            FALSE,
            SQLERRM::TEXT;
    END;
END;
$$;

-- Quick fix for RLS policies if they are too restrictive
-- This will temporarily allow all authenticated users to access verification items
CREATE POLICY IF NOT EXISTS "Allow authenticated users to manage verification items"
ON public.verification_items
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Enable RLS on the table
ALTER TABLE public.verification_items ENABLE ROW LEVEL SECURITY;
