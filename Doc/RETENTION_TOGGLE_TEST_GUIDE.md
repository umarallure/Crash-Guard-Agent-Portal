# Retention Call Toggle - Testing Guide

## ✅ Completed Features

### Step 1 & 2: Toggle Implementation
- ✅ **StartVerificationModal** - Retention toggle added
- ✅ **ClaimDroppedCallModal** - Retention toggle added  
- ✅ **ClaimLicensedAgentModal** - Retention toggle added
- ✅ **Database Integration** - All saves include `is_retention_call`
- ✅ **Call Logging** - All logs include `is_retention_call`

---

## 🧪 Testing Scenarios

### **Test 1: Start Verification with Retention Toggle**

**Flow:**
1. Go to Dashboard
2. Click "Start Verification" button on any lead
3. Select an agent type (Buffer or Licensed)
4. **Turn ON the "Mark as Retention Call" toggle**
5. Select an agent
6. Click "Start Verification"

**Expected Results:**
- ✅ Verification session is created
- ✅ `is_retention_call = true` in `verification_sessions` table
- ✅ `is_retention_call = true` in `leads` table
- ✅ `is_retention_call = true` in `call_update_logs` table with event `verification_started`

**Database Verification:**
```sql
-- Check verification session
SELECT submission_id, is_retention_call, status 
FROM verification_sessions 
WHERE submission_id = 'YOUR_TEST_SUBMISSION_ID';

-- Check leads table
SELECT submission_id, customer_full_name, is_retention_call 
FROM leads 
WHERE submission_id = 'YOUR_TEST_SUBMISSION_ID';

-- Check call logs
SELECT submission_id, event_type, is_retention_call 
FROM call_update_logs 
WHERE submission_id = 'YOUR_TEST_SUBMISSION_ID' 
AND event_type = 'verification_started';
```

---

### **Test 2: Start Verification WITHOUT Retention Toggle**

**Flow:**
1. Go to Dashboard  
2. Click "Start Verification" on a different lead
3. **Leave the "Mark as Retention Call" toggle OFF** (default)
4. Select agent and start
5. Verify in database

**Expected Results:**
- ✅ Verification session created with `is_retention_call = false`
- ✅ All related tables show `is_retention_call = false`

---

### **Test 3: Claim Call with Retention Toggle (Buffer Agent)**

**Flow:**
1. Go to Dashboard
2. Click "Claim Call" button on a lead
3. Modal opens: "Claim Dropped Call"
4. Select "Buffer Agent" workflow type
5. Select a buffer agent
6. **Turn ON "Mark as Retention Call" toggle**
7. Click "Claim & Reconnect"

**Expected Results:**
- ✅ Verification session updated with:
  - `is_retention_call = true`
  - `buffer_agent_id = selected_agent`
  - `status = 'in_progress'`
- ✅ Lead updated with `is_retention_call = true`
- ✅ Call log created with `is_retention_call = true` and event `call_claimed`
- ✅ Redirected to call result update page

**Database Check:**
```sql
SELECT 
  vs.submission_id,
  vs.is_retention_call,
  vs.buffer_agent_id,
  vs.status,
  l.is_retention_call as lead_retention
FROM verification_sessions vs
JOIN leads l ON vs.submission_id = l.submission_id
WHERE vs.submission_id = 'YOUR_SUBMISSION_ID';
```

---

### **Test 4: Claim Call with Retention Toggle (Licensed Agent)**

**Flow:**
1. Go to Dashboard
2. Click "Claim Call" on a lead
3. Modal opens
4. Select "Licensed Agent" workflow type (if available)
5. Select a licensed agent
6. **Turn ON "Mark as Retention Call" toggle**
7. Click "Claim & Reconnect"

**Expected Results:**
- ✅ Same as Test 3, but with `licensed_agent_id` instead of `buffer_agent_id`
- ✅ All retention flags set to `true`

---

### **Test 5: Claim WITHOUT Retention Toggle**

**Flow:**
1. Click "Claim Call"
2. Leave retention toggle OFF (default)
3. Complete the claim

**Expected Results:**
- ✅ All `is_retention_call` values are `false`
- ✅ No retention indication in logs

---

### **Test 6: Toggle Behavior**

**Flow:**
1. Open "Start Verification" modal
2. Toggle switch ON → should show checked state
3. Toggle switch OFF → should show unchecked state
4. Repeat on Claim modals

**Expected Results:**
- ✅ Toggle switches smoothly
- ✅ Visual feedback (checked/unchecked)
- ✅ State persists while modal is open
- ✅ State resets when modal closes

---

## 📊 Comprehensive Database Check Query

Run this to verify everything is working:

```sql
-- Comprehensive retention call tracking check
SELECT 
  l.submission_id,
  l.customer_full_name,
  l.is_retention_call as lead_retention,
  vs.id as session_id,
  vs.is_retention_call as session_retention,
  vs.status,
  vs.buffer_agent_id,
  vs.licensed_agent_id,
  COUNT(DISTINCT cul.id) as log_count,
  MAX(CASE WHEN cul.event_type = 'verification_started' THEN cul.is_retention_call END) as started_retention,
  MAX(CASE WHEN cul.event_type = 'call_claimed' THEN cul.is_retention_call END) as claimed_retention
FROM leads l
LEFT JOIN verification_sessions vs ON l.submission_id = vs.submission_id
LEFT JOIN call_update_logs cul ON vs.submission_id = cul.submission_id
WHERE l.created_at >= NOW() - INTERVAL '1 hour'
  AND l.is_retention_call = true  -- Only retention calls
GROUP BY l.id, vs.id
ORDER BY l.created_at DESC;
```

---

## 🎯 Expected Behavior Summary

| Action | Toggle State | Expected Result |
|--------|--------------|-----------------|
| Start Verification | ON | `is_retention_call = true` in all tables |
| Start Verification | OFF | `is_retention_call = false` in all tables |
| Claim Call | ON | Session + Lead + Logs all have `true` |
| Claim Call | OFF | Session + Lead + Logs all have `false` |
| Toggle appears | N/A | Should show in both modals |
| Default state | N/A | Should be OFF (false) |

---

## ⚠️ Troubleshooting

### Issue: Toggle doesn't appear in modal
**Solution:** 
- Clear browser cache (Ctrl+Shift+Delete)
- Restart dev server
- Check console for TypeScript errors

### Issue: Toggle appears but doesn't save to database
**Solution:**
- Check if `is_retention_call` columns exist: Run verification query at top
- Check browser console for errors
- Verify RLS policies aren't blocking updates

### Issue: Retention flag is always false
**Solution:**
- Confirm toggle component is connected via `onRetentionCallChange` handler
- Check state in React DevTools
- Verify all three modals have the toggle

### Issue: Can't find test data in database
**Solution:**
- Double-check submission_id is correct
- Make sure you're querying recent records (`created_at >= NOW() - INTERVAL '1 hour'`)
- Check if your user has access to the data (RLS policies)

---

## ✅ Testing Checklist

**Before moving to Step 3 (CallResultForm):**

- [ ] Toggle appears in StartVerificationModal
- [ ] Toggle appears in ClaimDroppedCallModal
- [ ] Toggle appears in ClaimLicensedAgentModal
- [ ] Toggle switches ON/OFF smoothly
- [ ] Retention toggle ON saves `true` to database
- [ ] Retention toggle OFF saves `false` to database
- [ ] `verification_sessions` table gets `is_retention_call`
- [ ] `leads` table gets `is_retention_call`
- [ ] `call_update_logs` table gets `is_retention_call`
- [ ] All claim types work (buffer, licensed)
- [ ] All start verification workflows work (buffer, licensed)
- [ ] Call logs show correct retention status
- [ ] No errors in browser console
- [ ] No errors in database logs

---

## 📝 Test Cases Completed

| Test # | Description | Status | Notes |
|--------|-------------|--------|-------|
| 1 | Start Verification + Retention ON | ⏳ | Ready to test |
| 2 | Start Verification + Retention OFF | ⏳ | Ready to test |
| 3 | Claim Buffer Agent + Retention ON | ⏳ | Ready to test |
| 4 | Claim Licensed Agent + Retention ON | ⏳ | Ready to test |
| 5 | Claim + Retention OFF | ⏳ | Ready to test |
| 6 | Toggle UI Behavior | ⏳ | Ready to test |

---

## 🚀 Next Steps

Once all tests pass:

1. **Step 3**: Update `CallResultForm` to:
   - Auto-read `is_retention_call` from `verification_sessions`
   - Display retention badge/indicator
   - Auto-save to `call_results` table

2. **Step 4**: Ensure `daily_deal_flow` sync includes `is_retention_call`

3. **Step 5**: End-to-end testing of complete workflow

---

## 📞 Quick Links

- **Start Verification Modal**: `src/components/StartVerificationModal.tsx`
- **Claim Dropped Call Modal**: `src/components/ClaimDroppedCallModal.tsx`
- **Claim Licensed Agent Modal**: `src/components/ClaimLicensedAgentModal.tsx`
- **Dashboard**: `src/pages/Dashboard.tsx`
- **Call Logging**: `src/lib/callLogging.ts`

---

**Please run these tests and let me know the results! Once confirmed working, we'll move to Step 3! 🎉**
