-- Debug Verification System Issues
-- Run these queries to understand what's happening with the verification system

-- 1. Check if verification_sessions table exists and has data
SELECT 'verification_sessions' as table_name, COUNT(*) as row_count FROM public.verification_sessions
UNION ALL
SELECT 'verification_items' as table_name, COUNT(*) as row_count FROM public.verification_items
UNION ALL  
SELECT 'leads' as table_name, COUNT(*) as row_count FROM public.leads
UNION ALL
SELECT 'profiles' as table_name, COUNT(*) as row_count FROM public.profiles
UNION ALL
SELECT 'agent_status' as table_name, COUNT(*) as row_count FROM public.agent_status;

-- 2. Check recent verification sessions
SELECT 
    vs.id as session_id,
    vs.submission_id,
    vs.status,
    vs.buffer_agent_id,
    vs.licensed_agent_id,
    vs.progress_percentage,
    vs.verified_fields,
    vs.total_fields,
    vs.created_at,
    l.customer_full_name
FROM public.verification_sessions vs
LEFT JOIN public.leads l ON l.submission_id = vs.submission_id
ORDER BY vs.created_at DESC
LIMIT 10;

-- 3. Check verification items for recent sessions
SELECT 
    vi.id as item_id,
    vi.session_id,
    vi.field_name,
    vi.field_category,
    vi.original_value,
    vi.verified_value,
    vi.is_verified,
    vi.is_modified,
    vi.created_at,
    vs.submission_id
FROM public.verification_items vi
LEFT JOIN public.verification_sessions vs ON vs.id = vi.session_id
ORDER BY vi.created_at DESC
LIMIT 20;

-- 4. Check for the specific verification item that's failing
-- Replace the ID with the one from your error: 1313b808-6698-4b65-84c1-63bccc9421c7
SELECT 
    vi.*,
    vs.submission_id,
    vs.status as session_status
FROM public.verification_items vi
LEFT JOIN public.verification_sessions vs ON vs.id = vi.session_id
WHERE vi.id = '1313b808-6698-4b65-84c1-63bccc9421c7';

-- 5. Check RLS policies on verification_items table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'verification_items';

-- 6. Check current user permissions
SELECT 
    current_user as current_db_user,
    session_user,
    current_setting('request.jwt.claims', true)::json as jwt_claims;

-- 7. Test if we can see verification items at all (bypass RLS temporarily for testing)
-- WARNING: This disables RLS temporarily - only use for debugging
SET row_security = off;
SELECT COUNT(*) as total_verification_items FROM public.verification_items;
SET row_security = on;

-- 8. Check if the initialize_verification_items function exists
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'initialize_verification_items';

-- 9. Check for any buffer agents
SELECT 
    p.display_name,
    a.status,
    a.agent_type,
    a.current_session_id,
    a.last_activity
FROM public.profiles p
INNER JOIN public.agent_status a ON a.user_id = p.user_id
WHERE a.agent_type = 'buffer';

-- 10. Check leads table for submission IDs
SELECT 
    submission_id,
    customer_full_name,
    phone_number,
    lead_vendor,
    created_at
FROM public.leads
ORDER BY created_at DESC
LIMIT 10;

-- 11. Test manual verification item creation to see if it works
-- Replace session_id and submission_id with actual values from your data
/*
INSERT INTO public.verification_items (
    session_id, 
    field_name, 
    field_category, 
    original_value,
    is_verified
) VALUES (
    'YOUR_SESSION_ID_HERE',  -- Replace with actual session ID
    'test_field',
    'test_category', 
    'test_value',
    false
);
*/

-- 12. Check if there are any active verification sessions you can use for testing
SELECT 
    vs.id as session_id,
    vs.submission_id,
    vs.status,
    COUNT(vi.id) as verification_items_count
FROM public.verification_sessions vs
LEFT JOIN public.verification_items vi ON vi.session_id = vs.id
GROUP BY vs.id, vs.submission_id, vs.status
ORDER BY vs.created_at DESC;
