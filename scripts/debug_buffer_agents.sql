-- Simple query to debug agent setup
-- Run these queries in your Supabase SQL editor to debug the issue

-- 1. Check what users exist in auth.users
SELECT 
  id, 
  email, 
  created_at,
  email_confirmed_at
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 10;

-- 2. Check what profiles exist
SELECT 
  user_id, 
  display_name, 
  created_at
FROM public.profiles 
ORDER BY created_at DESC;

-- 3. Check what agent_status records exist
SELECT 
  user_id, 
  status, 
  agent_type, 
  created_at
FROM public.agent_status 
ORDER BY created_at DESC;

-- 4. Check the complete buffer agent setup
SELECT 
  ast.user_id,
  ast.status,
  ast.agent_type,
  p.display_name,
  au.email,
  ast.created_at as agent_created,
  p.created_at as profile_created
FROM public.agent_status ast
LEFT JOIN public.profiles p ON p.user_id = ast.user_id
LEFT JOIN auth.users au ON au.id = ast.user_id
WHERE ast.agent_type = 'buffer'
ORDER BY p.display_name;

-- 5. If you see NULLs in display_name, manually insert buffer agents:
-- (Replace with actual user IDs from your auth.users table)

-- First, get a list of available user IDs:
-- SELECT id, email FROM auth.users LIMIT 5;

-- Then use those IDs to set up buffer agents:
/*
-- Example setup (replace UUIDs with real ones from your auth.users):
INSERT INTO public.profiles (user_id, display_name) VALUES
('your-user-id-1', 'Kyla'),
('your-user-id-2', 'Ira'),
('your-user-id-3', 'Bryan')
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.agent_status (user_id, status, agent_type, last_activity) VALUES
('your-user-id-1', 'available', 'buffer', NOW()),
('your-user-id-2', 'available', 'buffer', NOW()),
('your-user-id-3', 'available', 'buffer', NOW())
ON CONFLICT (user_id) DO UPDATE SET 
  status = 'available', 
  agent_type = 'buffer', 
  last_activity = NOW();
*/

-- 6. Check the final result
SELECT 
  ast.user_id,
  p.display_name,
  au.email,
  ast.status,
  ast.agent_type
FROM public.agent_status ast
LEFT JOIN public.profiles p ON p.user_id = ast.user_id
LEFT JOIN auth.users au ON au.id = ast.user_id
WHERE ast.agent_type = 'buffer';
