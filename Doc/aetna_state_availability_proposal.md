# Aetna State Availability System - Proposal

## Overview
Create a separate state availability system for Aetna that:
- Uses agent-specific state mappings (not the general `states` table)
- Requires upline license checking for ALL 52 states/territories
- Allows independent management of Aetna state availability per agent

---

## Current System Analysis

### Existing Tables:
1. **`states`** (54 rows) - Master state list
2. **`carriers`** (17 rows) - Master carrier list (includes Aetna)
3. **`agent_state_licenses`** (248 rows) - Tracks which states agents are licensed in
4. **`agent_carrier_licenses`** (56 rows) - Tracks which carriers agents can sell
5. **`carrier_override_states`** (102 rows) - Defines carrier/state combos requiring upline
6. **`agent_upline_hierarchy`** (4 rows) - Tracks upline relationships

### Current Agents:
- **Abdul** - 8 carriers, 37 states
- **Benjamin** - 1 carrier, 40 states
- **Isaac** - 8 carriers, 40 states
- **Lydia** - 8 carriers, 49 states
- **Tatumn** - 9 carriers, 32 states
- **Zack** - 10 carriers, 42 states

---

## Proposed Solution: New Table `aetna_agent_state_availability`

### Table Structure:
```sql
CREATE TABLE aetna_agent_state_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Agent reference
  agent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- State information (stored as text, not FK to states table)
  state_name TEXT NOT NULL,
  state_code TEXT, -- Optional: e.g., "AL", "CA", etc.
  
  -- Availability flags
  is_available BOOLEAN DEFAULT true,
  requires_upline_license BOOLEAN DEFAULT true, -- Always true for Aetna
  
  -- Metadata
  notes TEXT,
  effective_date DATE, -- When this availability became effective
  expiration_date DATE, -- Optional: When availability expires
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT unique_agent_state UNIQUE(agent_user_id, state_name),
  CONSTRAINT valid_state_name CHECK (state_name <> '')
);

-- Indexes for performance
CREATE INDEX idx_aetna_availability_agent ON aetna_agent_state_availability(agent_user_id);
CREATE INDEX idx_aetna_availability_state ON aetna_agent_state_availability(state_name);
CREATE INDEX idx_aetna_availability_available ON aetna_agent_state_availability(is_available) WHERE is_available = true;

-- RLS Policies
ALTER TABLE aetna_agent_state_availability ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins have full access to Aetna availability"
  ON aetna_agent_state_availability
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
      AND user_roles.is_active = true
    )
  );

-- Agents can view their own availability
CREATE POLICY "Agents can view own Aetna availability"
  ON aetna_agent_state_availability
  FOR SELECT
  TO authenticated
  USING (agent_user_id = auth.uid());

-- Service role can read all (for functions)
CREATE POLICY "Service role full access"
  ON aetna_agent_state_availability
  FOR ALL
  TO service_role
  USING (true);
```

### 52 States/Territories for Aetna:
All states require upline licensing:
1. Alabama
2. Alaska
3. Arizona
4. Arkansas
5. California
6. Colorado
7. Connecticut
8. Delaware
9. District of Columbia
10. Florida
11. Georgia
12. Guam
13. Hawaii
14. Idaho
15. Illinois
16. Indiana
17. Iowa
18. Kansas
19. Kentucky
20. Louisiana
21. Maine
22. Maryland
23. Massachusetts
24. Michigan
25. Minnesota
26. Mississippi
27. Missouri
28. Montana
29. Nebraska
30. Nevada
31. New Hampshire
32. New Jersey
33. New Mexico
34. New York
35. North Carolina
36. North Dakota
37. Ohio
38. Oklahoma
39. Oregon
40. Pennsylvania
41. Puerto Rico
42. Rhode Island
43. South Carolina
44. South Dakota
45. Tennessee
46. Texas
47. Utah
48. Vermont
49. Virgin Islands
50. Virginia
51. Washington
52. West Virginia
53. Wisconsin
54. Wyoming

---

## New Database Function: `get_eligible_agents_for_aetna`

```sql
CREATE OR REPLACE FUNCTION get_eligible_agents_for_aetna(
  p_state_name TEXT
)
RETURNS TABLE (
  user_id UUID,
  agent_name TEXT,
  email TEXT,
  agent_code TEXT,
  aetna_licensed BOOLEAN,
  state_available BOOLEAN,
  upline_licensed BOOLEAN,
  upline_required BOOLEAN,
  upline_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH agent_info AS (
    SELECT 
      u.id as user_id,
      p.display_name as agent_name,
      u.email,
      p.agent_code,
      -- Check if agent has Aetna carrier license
      EXISTS (
        SELECT 1 FROM agent_carrier_licenses acl
        JOIN carriers c ON c.id = acl.carrier_id
        WHERE acl.agent_user_id = u.id
        AND LOWER(c.carrier_name) = 'aetna'
        AND acl.is_licensed = true
      ) as aetna_licensed,
      -- Check if agent is available in this state for Aetna
      EXISTS (
        SELECT 1 FROM aetna_agent_state_availability aasa
        WHERE aasa.agent_user_id = u.id
        AND LOWER(aasa.state_name) = LOWER(p_state_name)
        AND aasa.is_available = true
      ) as state_available,
      -- Get upline user_id if exists
      (
        SELECT upline_user_id 
        FROM agent_upline_hierarchy 
        WHERE agent_user_id = u.id 
        AND is_active = true
        LIMIT 1
      ) as upline_id,
      -- Always true for Aetna
      true as upline_required
    FROM auth.users u
    JOIN profiles p ON p.user_id = u.id
  ),
  agent_with_upline AS (
    SELECT 
      ai.*,
      up.display_name as upline_name,
      -- Check if upline has Aetna license
      CASE 
        WHEN ai.upline_id IS NULL THEN true -- No upline = automatically passes
        ELSE EXISTS (
          SELECT 1 FROM agent_carrier_licenses acl
          JOIN carriers c ON c.id = acl.carrier_id
          WHERE acl.agent_user_id = ai.upline_id
          AND LOWER(c.carrier_name) = 'aetna'
          AND acl.is_licensed = true
        )
      END as upline_has_aetna,
      -- Check if upline is available in this state for Aetna
      CASE 
        WHEN ai.upline_id IS NULL THEN true -- No upline = automatically passes
        ELSE EXISTS (
          SELECT 1 FROM aetna_agent_state_availability aasa
          WHERE aasa.agent_user_id = ai.upline_id
          AND LOWER(aasa.state_name) = LOWER(p_state_name)
          AND aasa.is_available = true
        )
      END as upline_has_state
    FROM agent_info ai
    LEFT JOIN profiles up ON up.user_id = ai.upline_id
  )
  SELECT 
    awu.user_id,
    awu.agent_name,
    awu.email,
    awu.agent_code,
    awu.aetna_licensed,
    awu.state_available,
    (awu.upline_has_aetna AND awu.upline_has_state) as upline_licensed,
    awu.upline_required,
    awu.upline_name
  FROM agent_with_upline awu
  WHERE awu.aetna_licensed = true
  AND awu.state_available = true
  AND (awu.upline_has_aetna AND awu.upline_has_state) = true
  ORDER BY 
    CASE WHEN awu.upline_name IS NULL THEN 0 ELSE 1 END, -- Agents without uplines first
    awu.agent_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Modified Edge Function Logic

Update `notify-eligible-agents-with-upline/index.ts` to detect Aetna and use special logic:

```typescript
// Get eligible agents from database
console.log(`[DEBUG] Fetching eligible agents for carrier: ${carrier}, state: ${state}`);

let eligibleAgents;
let agentsError;

// Special handling for Aetna
if (carrier.toLowerCase() === 'aetna') {
  const result = await supabase.rpc(
    'get_eligible_agents_for_aetna',
    { p_state_name: state }
  );
  eligibleAgents = result.data;
  agentsError = result.error;
} else {
  // Use existing function for other carriers
  const result = await supabase.rpc(
    'get_eligible_agents_with_upline_check',
    {
      p_carrier_name: carrier,
      p_state_name: state
    }
  );
  eligibleAgents = result.data;
  agentsError = result.error;
}
```

---

## Benefits of This Approach

### ✅ Advantages:
1. **Independent State Management**: Aetna state availability managed separately from general state licenses
2. **Granular Control**: Each agent can have different Aetna state availability
3. **Upline Checking**: Full upline license validation using the same separate table
4. **No Conflicts**: Doesn't interfere with existing `agent_state_licenses` table
5. **Scalable**: Easy to add more carriers with special requirements later
6. **Audit Trail**: Track when availability changes and who made changes
7. **Performance**: Indexed for fast lookups

### 📊 Use Cases:
- **Scenario 1**: Agent has general CA license but not Aetna CA availability → Won't show for Aetna CA leads
- **Scenario 2**: Agent's upline lacks Aetna TX availability → Agent blocked from Aetna TX leads
- **Scenario 3**: Bulk update all agents for new Aetna states → Easy batch insert
- **Scenario 4**: Temporarily disable agent's Aetna availability → Set `is_available = false`

---

## Migration Strategy

### Phase 1: Create Table ✅
```sql
-- Run migration to create aetna_agent_state_availability table
-- Include RLS policies and indexes
```

### Phase 2: Initial Data Load ✅
```sql
-- Option A: Copy from existing agent_state_licenses
INSERT INTO aetna_agent_state_availability (agent_user_id, state_name, state_code, is_available)
SELECT 
  asl.agent_user_id,
  s.state_name,
  s.state_code,
  asl.is_licensed as is_available
FROM agent_state_licenses asl
JOIN states s ON s.id = asl.state_id
JOIN agent_carrier_licenses acl ON acl.agent_user_id = asl.agent_user_id
JOIN carriers c ON c.id = acl.carrier_id
WHERE LOWER(c.carrier_name) = 'aetna'
AND acl.is_licensed = true;

-- Option B: Start fresh - manually add states per agent
-- (Better for accurate Aetna-specific availability)
```

### Phase 3: Create Function ✅
```sql
-- Create get_eligible_agents_for_aetna function
```

### Phase 4: Update Edge Function ✅
```typescript
// Add Aetna detection and routing logic
```

### Phase 5: Testing ✅
```sql
-- Test various scenarios:
-- 1. Agent with Aetna + state availability
-- 2. Agent with Aetna but no state availability
-- 3. Agent with upline check
-- 4. Agent without upline (should pass)
```

---

## Alternative Approach: Generic Carrier-State Availability

If you want to support this pattern for multiple carriers in the future:

```sql
CREATE TABLE agent_carrier_state_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id UUID NOT NULL REFERENCES auth.users(id),
  carrier_name TEXT NOT NULL, -- "Aetna", "AMAM", etc.
  state_name TEXT NOT NULL,
  state_code TEXT,
  is_available BOOLEAN DEFAULT true,
  requires_upline_license BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_agent_carrier_state UNIQUE(agent_user_id, carrier_name, state_name)
);
```

This allows ANY carrier to have custom state availability rules, but adds complexity.

---

## Recommendation

**Start with `aetna_agent_state_availability`** for these reasons:
1. ✅ Immediate solution for Aetna requirements
2. ✅ Simple, focused table design
3. ✅ Easy to understand and maintain
4. ✅ Can expand to generic table later if needed
5. ✅ Minimal risk to existing system

If other carriers need similar logic later, we can:
- Create carrier-specific tables (e.g., `sbli_agent_state_availability`)
- OR migrate to generic `agent_carrier_state_availability` table
- OR keep carrier-specific for clarity

---

## Next Steps

1. ✅ Review and approve table structure
2. ✅ Create migration SQL file
3. ✅ Run migration to create table
4. ✅ Insert initial data (all 52 states for existing agents)
5. ✅ Create `get_eligible_agents_for_aetna` function
6. ✅ Update Edge Function to detect Aetna
7. ✅ Test with various state combinations
8. ✅ Update UI to show Aetna-specific availability (optional)

Would you like me to proceed with creating the migration files?
