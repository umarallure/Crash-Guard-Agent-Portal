INSERT INTO public.agent_status (user_id, status, agent_type, last_activity)
VALUES ('5c2822bb-225d-4fbc-8d3f-92f9c2562eac', 'available', 'buffer', NOW())
ON CONFLICT (user_id) DO UPDATE SET
  agent_type = 'buffer',
  status = 'available',
  last_activity = NOW();

