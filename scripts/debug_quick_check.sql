-- Quick debugging queries to check your current setup
-- Run these in your Supabase SQL editor

-- 1. Check what users exist
SELECT 
  id, 
  email, 
  created_at
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 10;

-- 2. Check profiles  
SELECT 
  user_id, 
  display_name, 
  created_at
FROM public.profiles 
ORDER BY created_at DESC;

-- 3. Check agent_status records
SELECT 
  user_id, 
  status, 
  agent_type, 
  created_at
FROM public.agent_status 
ORDER BY created_at DESC;

-- 4. Check complete buffer agent setup
SELECT 
  ast.user_id,
  ast.status,
  ast.agent_type,
  p.display_name,
  au.email,
  ast.created_at as agent_created
FROM public.agent_status ast
LEFT JOIN public.profiles p ON p.user_id = ast.user_id
LEFT JOIN auth.users au ON au.id = ast.user_id
WHERE ast.agent_type = 'buffer'
ORDER BY p.display_name;

-- 5. Check verification sessions
SELECT 
  id,
  submission_id,
  buffer_agent_id,
  status,
  progress_percentage,
  verified_fields,
  total_fields,
  created_at
FROM public.verification_sessions
ORDER BY created_at DESC;

-- 6. Check verification items for latest session
SELECT 
  vi.id,
  vi.field_name,
  vi.field_category,
  vi.original_value,
  vi.verified_value,
  vi.is_verified,
  vi.is_modified,
  vs.submission_id
FROM public.verification_items vi
LEFT JOIN public.verification_sessions vs ON vs.id = vi.session_id
ORDER BY vs.created_at DESC, vi.field_category, vi.field_name
LIMIT 20;

-- 7. If no buffer agents exist, insert them using real user IDs
-- First get some user IDs:
-- SELECT id FROM auth.users LIMIT 3;

-- Then insert buffer agents (replace UUIDs with real ones):
/*
INSERT INTO public.profiles (user_id, display_name) VALUES
('REPLACE-WITH-REAL-UUID-1', 'Kyla'),
('REPLACE-WITH-REAL-UUID-2', 'Ira'),
('REPLACE-WITH-REAL-UUID-3', 'Bryan')
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.agent_status (user_id, status, agent_type, last_activity) VALUES
('REPLACE-WITH-REAL-UUID-1', 'available', 'buffer', NOW()),
('REPLACE-WITH-REAL-UUID-2', 'available', 'buffer', NOW()),
('REPLACE-WITH-REAL-UUID-3', 'available', 'buffer', NOW())
ON CONFLICT (user_id) DO UPDATE SET 
  status = 'available', 
  agent_type = 'buffer', 
  last_activity = NOW();
*/
