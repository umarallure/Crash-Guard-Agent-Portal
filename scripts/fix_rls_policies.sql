-- Fix RLS Policy Issue for Verification Items
-- This will allow authenticated users to update verification items

-- First, let's check what RLS policies currently exist
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'verification_items';

-- Drop any overly restrictive policies that might be blocking updates
DROP POLICY IF EXISTS "verification_items_select_policy" ON public.verification_items;
DROP POLICY IF EXISTS "verification_items_update_policy" ON public.verification_items;
DROP POLICY IF EXISTS "verification_items_insert_policy" ON public.verification_items;
DROP POLICY IF EXISTS "verification_items_delete_policy" ON public.verification_items;

-- Create comprehensive policies that allow authenticated users to manage verification items
CREATE POLICY "verification_items_select_policy" 
ON public.verification_items 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "verification_items_insert_policy" 
ON public.verification_items 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "verification_items_update_policy" 
ON public.verification_items 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "verification_items_delete_policy" 
ON public.verification_items 
FOR DELETE 
TO authenticated 
USING (true);

-- Also check verification_sessions policies
DROP POLICY IF EXISTS "verification_sessions_select_policy" ON public.verification_sessions;
DROP POLICY IF EXISTS "verification_sessions_update_policy" ON public.verification_sessions;
DROP POLICY IF EXISTS "verification_sessions_insert_policy" ON public.verification_sessions;

CREATE POLICY "verification_sessions_select_policy" 
ON public.verification_sessions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "verification_sessions_insert_policy" 
ON public.verification_sessions 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "verification_sessions_update_policy" 
ON public.verification_sessions 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Enable RLS on both tables
ALTER TABLE public.verification_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_sessions ENABLE ROW LEVEL SECURITY;

-- Test the update with the session you have
-- Replace this with an actual verification item ID from your session
-- You can get the IDs by running: SELECT id FROM verification_items WHERE session_id = 'b18e15d1-76ba-40d2-9ed3-6b484bca8de0' LIMIT 1;

-- Run this to get a verification item ID to test with:
SELECT 
    'Test this item ID:' as message,
    id as verification_item_id,
    field_name,
    is_verified
FROM public.verification_items 
WHERE session_id = 'b18e15d1-76ba-40d2-9ed3-6b484bca8de0' 
LIMIT 1;
