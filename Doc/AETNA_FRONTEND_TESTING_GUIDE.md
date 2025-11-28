# Aetna State Availability - Frontend Testing Guide

## Overview
The Aetna state availability system has been fully integrated into the frontend with UI components for testing and management.

## Updated Components

### 1. EligibleAgentFinder Component
**Location:** `src/components/EligibleAgentFinder.tsx`

**Updates:**
- Added Aetna detection logic: `if (carrierName.toLowerCase() === 'aetna')`
- Routes Aetna searches to `get_eligible_agents_for_aetna()` function
- Routes all other carriers to `get_eligible_agents_with_upline_check()` function
- Added visual alert when Aetna is selected explaining special requirements
- Updated toast messages to indicate Aetna-specific behavior

**Test Scenario:**
1. Navigate to: http://localhost:8080/agent-licensing
2. Select "Aetna" carrier
3. Notice blue alert appears explaining special requirements
4. Select any state (e.g., "California", "Texas")
5. Click "Search for Eligible Agents"
6. Should return agents with Aetna license + state availability + upline approval

### 2. AgentEligibilityPage
**Location:** `src/pages/AgentEligibilityPage.tsx`

**Updates:**
- Updated `searchEligibleAgents()` function with Aetna detection
- Added conditional logic to call appropriate database function
- Added Aetna-specific alert in the search UI
- Enhanced error messages to indicate Aetna requirements

**Test Scenario:**
1. Navigate to: http://localhost:8080/agent-eligibility
2. Scroll to "Find Eligible Agents" section
3. Select "Aetna" from carrier dropdown
4. Blue alert appears explaining Aetna special requirements
5. Select a state
6. Click "Search for Eligible Agents"
7. Results show eligible agents based on Aetna state availability table

### 3. NEW: AetnaStateAvailabilityManager Component
**Location:** `src/components/AetnaStateAvailabilityManager.tsx`

**Features:**
- Select any agent from dropdown
- Automatically checks if agent has Aetna carrier license
- If no license, shows warning with "Enable Aetna License" button
- Displays all 54 US states/territories with checkboxes
- Shows current availability count (e.g., "35 / 54 Available")
- Select All / Deselect All buttons for bulk operations
- Save changes to `aetna_agent_state_availability` table
- Real-time validation and status updates

**Test Scenario:**
1. Navigate to: http://localhost:8080/agent-licensing
2. Click "Aetna States" tab
3. Select an agent (e.g., "Benjamin", "Lydia", "Abdul")
4. View their current Aetna state availability
5. Toggle individual states on/off
6. Use "Select All" or "Deselect All" for bulk changes
7. Click "Save Aetna State Availability"
8. Verify changes persist after refresh

### 4. Updated AgentLicensing Page
**Location:** `src/pages/AgentLicensing.tsx`

**Updates:**
- Added Tabs component with two tabs:
  - "Find Eligible Agents" (original functionality)
  - "Aetna States" (NEW - Aetna state availability manager)
- Updated page title to "Agent Licensing & Eligibility"

## Database Functions Used

### For Aetna
- `get_eligible_agents_for_aetna(p_state_name TEXT)`
- Queries: `aetna_agent_state_availability` table

### For All Other Carriers
- `get_eligible_agents_with_upline_check(p_carrier_name TEXT, p_state_name TEXT)`
- Queries: `agent_carrier_licenses`, `agent_state_licenses`, `carrier_override_states`

## Current Agent Configuration Status

| Agent | Aetna License | States Configured | Available States | Notes |
|-------|--------------|-------------------|------------------|-------|
| Benjamin | ✅ Yes | 54 | 36 | Top-level (no upline) |
| Lydia | ✅ Yes | 54 | 35 | Upline: Benjamin |
| Tatumn | ✅ Yes | 54 | 25 | Top-level (no upline) |
| Zack | ✅ Yes | 54 | 26 | Upline: Abdul |
| Isaac | ✅ Yes | 54 | 27 | Upline: Abdul |
| Abdul | ✅ Yes | 54 | 28 | Top-level (no upline) |

## Test Scenarios

### Test 1: Search for California Aetna Agents
**Expected Results:**
- Benjamin ✅ (has CA = YES)
- Tatumn ✅ (has CA = YES)
- Lydia ❌ (has CA = NO)
- Abdul ❌ (has CA = NO)
- Isaac ✅ (has CA = YES, upline Abdul has CA = NO, but Isaac himself has CA = YES)
- Zack ❌ (has CA = NO)

### Test 2: Search for Texas Aetna Agents
**Expected Results:**
- All 6 agents should appear (all have TX = YES)
- Benjamin, Tatumn, Abdul as top-level
- Lydia via upline Benjamin
- Isaac, Zack via upline Abdul

### Test 3: Search for Alaska Aetna Agents
**Expected Results:**
- Lydia ✅ (has AK = YES)
- Abdul ✅ (has AK = YES)
- Zack ✅ (has AK = YES, upline Abdul has AK = YES)
- Benjamin ❌ (has AK = NO)
- Tatumn ❌ (has AK = NO)
- Isaac ❌ (has AK = NO)

### Test 4: Add New Agent Aetna Availability
1. Go to http://localhost:8080/agent-licensing → "Aetna States" tab
2. Select an agent without Aetna license
3. Click "Enable Aetna License"
4. Configure states (select/deselect as needed)
5. Click "Save Aetna State Availability"
6. Go to "Find Eligible Agents" tab
7. Search for a state you enabled
8. New agent should appear in results

### Test 5: Modify Existing Agent Aetna States
1. Go to "Aetna States" tab
2. Select "Lydia"
3. Toggle "California" from NO to YES
4. Save changes
5. Go to "Find Eligible Agents" tab
6. Search for Aetna + California
7. Lydia should now appear in results (was blocked before)

## API Testing with Edge Function

The Edge Function v5 is already deployed with Aetna detection:
```typescript
if (carrier.toLowerCase() === 'aetna') {
  // Use get_eligible_agents_for_aetna
} else {
  // Use get_eligible_agents_with_upline_check
}
```

Test with curl:
```powershell
# Test Aetna California
curl -X POST "https://your-project.supabase.co/functions/v1/notify-eligible-agents-with-upline" `
  -H "Authorization: Bearer YOUR_ANON_KEY" `
  -H "Content-Type: application/json" `
  -d '{\"carrier\":\"Aetna\",\"state\":\"California\",\"call_center\":\"Maverick\"}'
```

## Key Features

### Visual Indicators
- 🔵 Blue alerts for Aetna special requirements
- ✅ Green badges for licensed/available states
- ⚠️ Orange alerts for missing Aetna license
- 📊 Real-time state counts (e.g., "35 / 54 Available")

### User Experience
- Automatic detection of Aetna carrier selection
- Contextual help messages explaining Aetna requirements
- One-click enable Aetna license for agents
- Bulk select/deselect all states
- Persistent changes with immediate feedback

### Data Integrity
- Separate table for Aetna (`aetna_agent_state_availability`)
- All 52 states require upline verification
- Per-agent custom state approvals
- Upline checking enforced at database level

## Troubleshooting

### Agent not appearing in Aetna search results?
1. Check if agent has Aetna carrier license
2. Check if agent has state marked as available in `aetna_agent_state_availability`
3. Check if agent's upline (if exists) has Aetna license
4. Check if agent's upline has the state available

### Changes not saving?
1. Ensure agent has Aetna carrier license first
2. Check browser console for errors
3. Verify database permissions (RLS policies)
4. Refresh page and try again

## Next Steps

### Additional Features to Consider
1. Bulk agent state configuration (configure multiple agents at once)
2. Import/export state configurations (CSV)
3. Copy state settings from one agent to another
4. History/audit log of state availability changes
5. Notification when agent state availability changes
6. Visual state map showing geographic coverage

### Documentation
- Add user guide for Aetna state management
- Create video walkthrough for admins
- Document upline hierarchy requirements
- Add FAQ section for common issues
