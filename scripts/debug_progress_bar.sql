-- Debug Progress Bar Issues
-- This migration helps debug why the progress bar isn't working

-- First, let's check if the trigger function exists and is properly set up
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'update_verification_progress_trigger';

-- Check if the function exists
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'update_verification_progress';

-- Check current verification sessions and their progress
SELECT 
    id,
    submission_id,
    status,
    progress_percentage,
    verified_fields,
    total_fields,
    created_at
FROM public.verification_sessions
ORDER BY created_at DESC;

-- Check verification items and their status
SELECT 
    vi.session_id,
    vs.submission_id,
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE vi.is_verified = true) as verified_items,
    ROUND(COUNT(*) FILTER (WHERE vi.is_verified = true) * 100.0 / COUNT(*), 0) as calculated_percentage,
    vs.progress_percentage as stored_percentage
FROM public.verification_items vi
LEFT JOIN public.verification_sessions vs ON vs.id = vi.session_id
GROUP BY vi.session_id, vs.submission_id, vs.progress_percentage
ORDER BY vs.created_at DESC;

-- Function to manually recalculate progress for all sessions
CREATE OR REPLACE FUNCTION recalculate_all_progress()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    session_record RECORD;
BEGIN
    FOR session_record IN 
        SELECT id FROM public.verification_sessions
    LOOP
        UPDATE public.verification_sessions 
        SET 
            verified_fields = (
                SELECT COUNT(*) 
                FROM public.verification_items 
                WHERE session_id = session_record.id AND is_verified = true
            ),
            progress_percentage = ROUND(
                (SELECT COUNT(*) FROM public.verification_items WHERE session_id = session_record.id AND is_verified = true) * 100.0 / 
                GREATEST((SELECT COUNT(*) FROM public.verification_items WHERE session_id = session_record.id), 1)
            ),
            total_fields = (
                SELECT COUNT(*) 
                FROM public.verification_items 
                WHERE session_id = session_record.id
            ),
            updated_at = now()
        WHERE id = session_record.id;
    END LOOP;
    
    RAISE NOTICE 'Progress recalculated for all sessions';
END;
$$;

-- Run the recalculation
SELECT recalculate_all_progress();

-- Verify the results
SELECT 
    vs.id,
    vs.submission_id,
    vs.progress_percentage,
    vs.verified_fields,
    vs.total_fields,
    COUNT(vi.id) as actual_total,
    COUNT(vi.id) FILTER (WHERE vi.is_verified = true) as actual_verified
FROM public.verification_sessions vs
LEFT JOIN public.verification_items vi ON vi.session_id = vs.id
GROUP BY vs.id, vs.submission_id, vs.progress_percentage, vs.verified_fields, vs.total_fields
ORDER BY vs.created_at DESC;
