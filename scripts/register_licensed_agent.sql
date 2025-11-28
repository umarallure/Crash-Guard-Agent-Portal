

INSERT INTO public.profiles (
    user_id, 
    display_name, 
    agent_code,
    created_at, 
    updated_at
) 
VALUES (
    '424f4ea8-1b8c-4c0f-bc13-3ea699900c79',  -- Replace with actual user UUID from auth.users
    'Ben',   -- Replace with actual agent name
    'Ben001',           -- Replace with actual agent code (optional)
    NOW(), 
    NOW()
)
ON CONFLICT (user_id) 
DO UPDATE SET 
    display_name = EXCLUDED.display_name,
    agent_code = EXCLUDED.agent_code,
    updated_at = NOW();

-- Step 2: Register the agent in the agent_status table for tracking
INSERT INTO public.agent_status (
    user_id,
    agent_type,
    status,
    last_activity,
    created_at,
    updated_at
)
VALUES (
    '424f4ea8-1b8c-4c0f-bc13-3ea699900c79',  -- Same user UUID as above
    'licensed',        -- Agent type: 'licensed' for LA
    'offline',         -- Initial status (will be updated when agent comes online)
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (user_id) 
DO UPDATE SET 
    agent_type = EXCLUDED.agent_type,
    updated_at = NOW();

