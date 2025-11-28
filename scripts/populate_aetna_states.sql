-- Populate aetna_agent_state_availability with all 52 states for each agent
-- This inserts initial data based on which agents have Aetna carrier licenses

-- First, get the list of all 52 US states and territories
WITH aetna_states AS (
  SELECT state_name, state_code FROM (VALUES
    ('Alabama', 'AL'),
    ('Alaska', 'AK'),
    ('Arizona', 'AZ'),
    ('Arkansas', 'AR'),
    ('California', 'CA'),
    ('Colorado', 'CO'),
    ('Connecticut', 'CT'),
    ('Delaware', 'DE'),
    ('District of Columbia', 'DC'),
    ('Florida', 'FL'),
    ('Georgia', 'GA'),
    ('Guam', 'GU'),
    ('Hawaii', 'HI'),
    ('Idaho', 'ID'),
    ('Illinois', 'IL'),
    ('Indiana', 'IN'),
    ('Iowa', 'IA'),
    ('Kansas', 'KS'),
    ('Kentucky', 'KY'),
    ('Louisiana', 'LA'),
    ('Maine', 'ME'),
    ('Maryland', 'MD'),
    ('Massachusetts', 'MA'),
    ('Michigan', 'MI'),
    ('Minnesota', 'MN'),
    ('Mississippi', 'MS'),
    ('Missouri', 'MO'),
    ('Montana', 'MT'),
    ('Nebraska', 'NE'),
    ('Nevada', 'NV'),
    ('New Hampshire', 'NH'),
    ('New Jersey', 'NJ'),
    ('New Mexico', 'NM'),
    ('New York', 'NY'),
    ('North Carolina', 'NC'),
    ('North Dakota', 'ND'),
    ('Ohio', 'OH'),
    ('Oklahoma', 'OK'),
    ('Oregon', 'OR'),
    ('Pennsylvania', 'PA'),
    ('Puerto Rico', 'PR'),
    ('Rhode Island', 'RI'),
    ('South Carolina', 'SC'),
    ('South Dakota', 'SD'),
    ('Tennessee', 'TN'),
    ('Texas', 'TX'),
    ('Utah', 'UT'),
    ('Vermont', 'VT'),
    ('Virgin Islands', 'VI'),
    ('Virginia', 'VA'),
    ('Washington', 'WA'),
    ('West Virginia', 'WV'),
    ('Wisconsin', 'WI'),
    ('Wyoming', 'WY')
  ) AS states(state_name, state_code)
),
-- Get agents who have Aetna carrier license
aetna_agents AS (
  SELECT DISTINCT acl.agent_user_id
  FROM agent_carrier_licenses acl
  JOIN carriers c ON c.id = acl.carrier_id
  WHERE LOWER(c.carrier_name) = 'aetna'
  AND acl.is_licensed = true
)
-- Insert all 52 states for each Aetna-licensed agent
INSERT INTO aetna_agent_state_availability (
  agent_user_id,
  state_name,
  state_code,
  is_available,
  requires_upline_license,
  notes,
  effective_date
)
SELECT 
  aa.agent_user_id,
  ast.state_name,
  ast.state_code,
  true as is_available, -- Start with all available, can be modified later
  true as requires_upline_license, -- Always true for Aetna
  'Initial data load - all Aetna states' as notes,
  CURRENT_DATE as effective_date
FROM aetna_agents aa
CROSS JOIN aetna_states ast
ON CONFLICT (agent_user_id, state_name) DO NOTHING; -- Skip if already exists

-- Show summary of what was inserted
SELECT 
  p.display_name as agent_name,
  COUNT(*) as states_added
FROM aetna_agent_state_availability aasa
JOIN profiles p ON p.user_id = aasa.agent_user_id
GROUP BY p.display_name
ORDER BY p.display_name;
