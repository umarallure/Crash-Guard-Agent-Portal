# Manual Testing Guide: notify-eligible-agents-with-upline
**Date:** November 13, 2025  
**Call Center:** Maverick  
**Slack Channel:** #sample-center-transfer-channel

---

## Quick Test Scenarios

### Test 1: AMAM + California (Override State)
```json
{
  "carrier": "AMAM",
  "state": "California",
  "lead_vendor": "Maverick"
}
```
**Expected Result:**
- ✅ 2 eligible agents: Benjamin, Lydia
- ✅ Isaac blocked (Abdul lacks CA license)
- ✅ Override state warning shown
- ✅ Slack notification to #sample-center-transfer-channel

---

### Test 2: AMAM + Texas (Override State)
```json
{
  "carrier": "AMAM",
  "state": "Texas",
  "lead_vendor": "Maverick"
}
```
**Expected Result:**
- ✅ 4 eligible agents: Abdul, Isaac, Tatumn, Zack
- ✅ Benjamin NOT included (lacks TX license)
- ✅ Override state warning shown
- ✅ Slack notification sent

---

### Test 3: Aetna + Iowa (Override State)
```json
{
  "carrier": "Aetna",
  "state": "Iowa",
  "lead_vendor": "Maverick"
}
```
**Expected Result:**
- ✅ At least 1 eligible agent (Zack has Aetna + Iowa)
- ✅ Override state warning shown
- ✅ Upline licenses verified

---

### Test 4: SBLI + New York
```json
{
  "carrier": "SBLI",
  "state": "New York",
  "lead_vendor": "Maverick"
}
```
**Expected Result:**
- Check if NY is an override state for SBLI
- Return agents with SBLI + NY licenses
- Show upline verification if override state

---

### Test 5: Invalid Carrier
```json
{
  "carrier": "InvalidCarrier",
  "state": "Texas",
  "lead_vendor": "Maverick"
}
```
**Expected Result:**
- ✅ 0 eligible agents
- ✅ "No eligible agents found" message
- ✅ Slack notification sent explaining no agents

---

### Test 6: Invalid State
```json
{
  "carrier": "AMAM",
  "state": "InvalidState",
  "lead_vendor": "Maverick"
}
```
**Expected Result:**
- ✅ 0 eligible agents
- ✅ "No eligible agents found" message
- ✅ Slack notification sent

---

## How to Test

### Option 1: Using Supabase Dashboard (Easiest)
1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions** → `notify-eligible-agents-with-upline`
3. Click "Invoke Function"
4. Paste one of the JSON payloads above
5. Click "Send Request"
6. Check the response and your Slack channel

### Option 2: Using curl
```bash
curl -L -X POST 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/notify-eligible-agents-with-upline' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "carrier": "AMAM",
    "state": "California",
    "lead_vendor": "Maverick"
  }'
```

### Option 3: Using PowerShell
```powershell
$body = @{
    carrier = "AMAM"
    state = "California"
    lead_vendor = "Maverick"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://YOUR_PROJECT_ID.supabase.co/functions/v1/notify-eligible-agents-with-upline" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer YOUR_ANON_KEY"
        "Content-Type" = "application/json"
    } `
    -Body $body
```

### Option 4: Using the PowerShell Test Script
```powershell
# Edit test-notify-function.ps1 with your Supabase URL and key
.\test-notify-function.ps1
```

---

## What to Check in Slack

When you invoke the function, check the Slack channel (**#sample-center-transfer-channel**) for:

### Successful Case (Agents Found):
```
🔔 New Lead Available

Call Center: Maverick
Carrier: AMAM
State: California

⚠️ This is an override state - upline licenses verified

────────────────

Agents who can take this call:
• @Benjamin
• @Lydia (upline: Benjamin)

2 eligible agent(s) (upline licenses verified)
```

### No Agents Case:
```
🚨 New Lead Available - No eligible agents found for AMAM in InvalidState

Call Center: Maverick
Carrier: AMAM
State: InvalidState

⚠️ No eligible agents found for this carrier/state combination

This may be due to upline license requirements for override states.
```

---

## Response Format

### Success Response:
```json
{
  "success": true,
  "eligible_agents_count": 2,
  "eligible_agents": [
    {
      "name": "Benjamin",
      "upline": null,
      "upline_required": true
    },
    {
      "name": "Lydia",
      "upline": "Benjamin",
      "upline_required": true
    }
  ],
  "override_state": true,
  "messageTs": "1699876543.123456",
  "channel": "#sample-center-transfer-channel",
  "debug": { ... }
}
```

### No Agents Response:
```json
{
  "success": true,
  "eligible_agents_count": 0,
  "message": "No eligible agents found (after upline checks), notification sent",
  "channel": "#sample-center-transfer-channel"
}
```

### Error Response:
```json
{
  "success": false,
  "message": "Missing required fields: carrier, state, or lead_vendor"
}
```

---

## Agent Slack IDs (for Maverick channel)
The function will tag these agents:
- **Abdul** → @U07ULU99VD4 (Benjamin Wunder - Sales Manager)
- **Zack** → @U09AWBNGBQF (Zack Lesnar - Insurance Agent)
- **Lydia** → @U08216BSGE4 (Lydia Sutton - Insurance Agent)
- **Tatumn** → @U09FKU50KFT (Tatumn - Insurance Agent)
- **Isaac** → @U099W0RKYDB (Isaac Reed - Insurance Agent)

---

## Test Checklist

- [ ] Test 1: AMAM + California → Expect 2 agents (Benjamin, Lydia)
- [ ] Test 2: AMAM + Texas → Expect 4 agents (Abdul, Isaac, Tatumn, Zack)
- [ ] Test 3: Aetna + Iowa → Check agent count
- [ ] Test 4: SBLI + New York → Check if override state
- [ ] Test 5: Invalid Carrier → Expect 0 agents, notification sent
- [ ] Test 6: Invalid State → Expect 0 agents, notification sent
- [ ] Verify Slack notifications appear in #sample-center-transfer-channel
- [ ] Verify agent mentions work correctly (@mentions)
- [ ] Verify override state warning appears when applicable
- [ ] Verify upline names shown in notifications
- [ ] Verify Sales Managers appear at bottom of list

---

## Troubleshooting

### No Slack Notification Sent
- Check SLACK_BOT_TOKEN environment variable is set
- Verify bot has permission to post in #sample-center-transfer-channel
- Check Supabase function logs for errors

### Wrong Agents Returned
- Run SQL query directly: `SELECT * FROM get_eligible_agents_with_upline_check('AMAM', 'California')`
- Verify agent licenses in database
- Check upline relationships in agent_upline_hierarchy table

### Function Timeout
- Check database function performance
- Verify RLS policies aren't causing slow queries
- Check Supabase function logs

---

## Additional Carriers to Test

Try these carriers with various states:
- **SBLI** - 13 override states
- **Royal Neighbors** - 13 override states
- **TransAmerica** - 11 override states
- **Liberty Bankers** - 8 override states
- **MOA** - 7 override states
- **GTL** - 5 override states
- **Aetna** - 28 override states

Query to see all override states for a carrier:
```sql
SELECT s.state_name
FROM carrier_override_states cos
JOIN carriers c ON c.id = cos.carrier_id
JOIN states s ON s.id = cos.state_id
WHERE LOWER(c.carrier_name) = 'amam'
ORDER BY s.state_name;
```
