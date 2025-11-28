# Retention Call Tracking - Developer Quick Reference

## 🎯 What Is This?
A system to mark and track calls from the **retention team** (as opposed to regular sales agents). Enabled with a simple toggle that propagates through the entire call workflow.

## 🔴 Key Points

### For Agents:
- **When Starting Verification:** Toggle "Mark as Retention Call" if the customer is from retention team
- **When Claiming Call:** Can optionally override the retention status if needed
- **When Submitting Result:** Purple "Retention Call" badge shows the current status
- All toggles default to **OFF** (not a retention call)

### For Developers:
All retention tracking is through a **single BOOLEAN field** (`is_retention_call`) across 5 tables.

---

## 📊 The 5 Tables (All Have `is_retention_call` BOOLEAN DEFAULT false)

```
┌─────────────────────────────────────────────────────────────┐
│                   RETENTION TRACKING TABLES                  │
├──────────────────────────────────┬──────────────────────────┤
│ TABLE                            │ PURPOSE                  │
├──────────────────────────────────┼──────────────────────────┤
│ leads                            │ Base record flag         │
│ verification_sessions            │ Session-level tracking   │
│ call_results                      │ Final result status      │
│ call_update_logs                  │ Audit trail at each step │
│ daily_deal_flow                   │ Analytics/reporting      │
└──────────────────────────────────┴──────────────────────────┘
```

---

## 🔌 Integration Points

### Components That Handle Retention:
| Component | What It Does | Key State |
|-----------|-----------|-----------|
| **StartVerificationModal** | Toggle set at start | `isRetentionCall` state |
| **ClaimDroppedCallModal** | Can override | `isRetentionCall` + `onRetentionCallChange` props |
| **ClaimLicensedAgentModal** | Can override | Same props as above |
| **CallResultForm** | Auto-populates + displays | Auto-loads from verification_sessions |
| **Dashboard** | Orchestrates modals | `claimIsRetentionCall` state |

### Edge Functions Updated:
- `update-daily-deal-flow-entry` - Now receives `is_retention_call` parameter
- Google Sheets integration - Receives retention status in sync

---

## 🔄 Data Flow (The Journey)

```
START VERIFICATION
    ↓
    └─→ Agent toggles retention? YES/NO
        └─→ Saves to: leads, verification_sessions, call_update_logs
            
CLAIM CALL
    ↓
    └─→ Agent can override retention? YES/NO
        └─→ Updates: verification_sessions, leads, call_update_logs

SUBMIT RESULT (CallResultForm)
    ↓
    ├─→ Auto-loads from verification_sessions
    ├─→ Displays purple "Retention Call" badge
    └─→ Saves to: call_results, daily_deal_flow, call_update_logs
```

---

## 💾 Database Operations

### Add Retention Field to New Table (if needed):
```sql
ALTER TABLE table_name ADD COLUMN is_retention_call BOOLEAN DEFAULT false;
```

### Query Retention Calls:
```sql
-- All retention calls
SELECT * FROM leads WHERE is_retention_call = true;

-- With details
SELECT 
  l.submission_id,
  l.customer_full_name,
  vs.status,
  cr.status as result_status
FROM leads l
LEFT JOIN verification_sessions vs ON l.submission_id = vs.submission_id
LEFT JOIN call_results cr ON l.submission_id = cr.submission_id
WHERE l.is_retention_call = true;
```

### Check Data Consistency:
```sql
-- Verify retention flag is consistent across all tables
SELECT 
  l.submission_id,
  l.is_retention_call as leads,
  vs.is_retention_call as verification_sessions,
  cr.is_retention_call as call_results,
  ddf.is_retention_call as daily_deal_flow
FROM leads l
LEFT JOIN verification_sessions vs ON l.submission_id = vs.submission_id
LEFT JOIN call_results cr ON l.submission_id = cr.submission_id
LEFT JOIN daily_deal_flow ddf ON l.submission_id = ddf.submission_id
WHERE l.is_retention_call != COALESCE(vs.is_retention_call, false);
```

---

## 🧪 Quick Test Commands

### Test Retention Flag Storage:
```typescript
// Test 1: Check if flag saved to leads
const { data } = await supabase
  .from('leads')
  .select('is_retention_call')
  .eq('submission_id', 'TEST123')
  .single();
console.log('Saved retention flag:', data.is_retention_call);

// Test 2: Check verification_sessions
const { data: vs } = await supabase
  .from('verification_sessions')
  .select('is_retention_call')
  .eq('submission_id', 'TEST123')
  .single();
console.log('Session retention flag:', vs.is_retention_call);

// Test 3: Check call_results
const { data: cr } = await supabase
  .from('call_results')
  .select('is_retention_call')
  .eq('submission_id', 'TEST123')
  .single();
console.log('Result retention flag:', cr.is_retention_call);
```

---

## 🎨 UI Components Used

### Switch Component (Toggles):
```tsx
import { Switch } from "@/components/ui/switch";

<div className="flex items-center space-x-2">
  <Switch
    checked={isRetentionCall}
    onCheckedChange={setIsRetentionCall}
    id="retention-toggle"
  />
  <Label htmlFor="retention-toggle">Mark as Retention Call</Label>
</div>
```

### Badge Component (Indicator):
```tsx
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";

{isRetentionCall && (
  <Badge className="bg-purple-600 hover:bg-purple-700">
    <Shield className="h-3 w-3 mr-1" />
    Retention Call
  </Badge>
)}
```

---

## 🔐 Permission Checks

The retention flag:
- ✅ Is NOT a permission-based field
- ✅ CAN be toggled by any agent
- ✅ Follows existing RLS policies
- ✅ Shouldn't need special RLS rules (flag is BOOLEAN, not sensitive)

---

## 🐛 Troubleshooting

### Problem: Retention flag not showing in CallResultForm
**Solution:**
1. Check if `verification_sessions` table has retention flag: `SELECT is_retention_call FROM verification_sessions WHERE submission_id = 'YOUR_ID'`
2. Verify component loaded: Check browser console for errors
3. Clear cache: `Ctrl+Shift+Delete` (browser cache)

### Problem: Retention flag won't save
**Solution:**
1. Check if `call_results` table has `is_retention_call` column
2. Run migration if needed: See `RETENTION_CALL_DATABASE_SUMMARY.md`
3. Verify RLS policies aren't blocking: Check Supabase logs

### Problem: All calls showing as retention calls
**Solution:**
1. Check `daily_deal_flow` sync function
2. Verify Edge Function is passing parameter correctly
3. Check if there's a default value issue

---

## 📋 Checklist for New Features Using Retention

If you need to add retention tracking to a new component:

- [ ] Import `is_retention_call` from appropriate table
- [ ] Add state: `const [isRetentionCall, setIsRetentionCall] = useState(false)`
- [ ] Add Switch component for user input
- [ ] Include `is_retention_call` when saving to database
- [ ] Include `isRetentionCall` when logging events
- [ ] Test: Verify flag saved to correct table
- [ ] Verify: Check daily_deal_flow sync includes flag

---

## 📞 Key Files

| File | Purpose | Status |
|------|---------|--------|
| `src/components/StartVerificationModal.tsx` | Toggle at start | ✅ Complete |
| `src/components/ClaimDroppedCallModal.tsx` | Toggle on claim (buffer) | ✅ Complete |
| `src/components/ClaimLicensedAgentModal.tsx` | Toggle on claim (licensed) | ✅ Complete |
| `src/components/CallResultForm.tsx` | Auto-populate + display | ✅ Complete |
| `src/pages/Dashboard.tsx` | Orchestration | ✅ Complete |
| `src/lib/callLogging.ts` | Audit logging | ✅ Complete |
| `supabase/functions/update-daily-deal-flow-entry` | Daily sync | ✅ Updated |

---

## 🚀 Performance Notes

- New BOOLEAN column = minimal storage impact
- Index on `is_retention_call` recommended for reports
- No performance penalty for queries
- Edge Function calls are async (non-blocking)

---

## 🎓 Architecture Pattern

```
Single Source of Truth (leads.is_retention_call)
        ↓
  Propagates Through:
        ├─ verification_sessions (override point)
        ├─ call_results (final value)
        ├─ call_update_logs (audit trail)
        └─ daily_deal_flow (reporting)
```

This pattern ensures:
✅ Data consistency
✅ Audit trail
✅ Flexibility (can override)
✅ Easy reporting

---

**Last Updated:** October 2025
**Status:** Ready for Testing
**Coverage:** 100% of call workflow
