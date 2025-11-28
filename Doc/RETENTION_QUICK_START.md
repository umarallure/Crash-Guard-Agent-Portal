# Retention Call Tracking - Quick Start Guide

## 🎯 What This Feature Does

Allows your team to distinguish between **regular sales calls** and **retention team calls** throughout the entire agent portal system.

## ✅ What's Already Done (Database Layer)

All database tables now have an `is_retention_call` boolean column:
- ✅ `leads` - Track which leads are retention
- ✅ `verification_sessions` - Track which sessions are retention
- ✅ `call_results` - Track which results are retention
- ✅ `call_update_logs` - Track which logs are retention
- ✅ `daily_deal_flow` - Track which flows are retention

**Default value:** `false` (all existing data remains sales calls)

## 🚀 What You Need to Implement (Frontend)

### Step 1: Add Checkbox to Claim Modals (5 minutes)

**File:** `src/components/ClaimModal.tsx` (or similar)

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";

function ClaimModal({ session, onClaim }) {
  const [isRetentionCall, setIsRetentionCall] = useState(false);
  
  const handleClaim = async () => {
    await supabase
      .from('verification_sessions')
      .update({ 
        licensed_agent_id: userId,
        claimed_at: new Date().toISOString(),
        is_retention_call: isRetentionCall  // ← ADD THIS
      })
      .eq('id', session.id);
      
    onClaim();
  };
  
  return (
    <Dialog>
      <DialogContent>
        {/* Your existing modal content */}
        
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="retention"
            checked={isRetentionCall}
            onCheckedChange={setIsRetentionCall}
          />
          <label htmlFor="retention" className="text-sm">
            Mark as Retention Call
          </label>
        </div>
        
        <Button onClick={handleClaim}>Claim Call</Button>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 2: Add to Verification Start (5 minutes)

**File:** `src/components/VerificationDashboard.tsx`

```typescript
const startVerification = async (submissionId: string) => {
  // Add checkbox state in your component
  const [isRetentionCall, setIsRetentionCall] = useState(false);
  
  // When creating verification session:
  const { data: session } = await supabase
    .from('verification_sessions')
    .insert({
      submission_id: submissionId,
      buffer_agent_id: userId,
      is_retention_call: isRetentionCall,  // ← ADD THIS
      status: 'in_progress'
    })
    .select()
    .single();
    
  // Also update the lead:
  await supabase
    .from('leads')
    .update({ is_retention_call: isRetentionCall })
    .eq('submission_id', submissionId);
};
```

### Step 3: Update Call Logging (2 minutes)

**File:** `src/lib/callLogging.ts`

```typescript
export const logCallUpdate = async ({
  submissionId,
  agentId,
  agentName,
  eventType,
  isRetentionCall,  // ← ADD THIS PARAMETER
  ...otherParams
}) => {
  await supabase.from('call_update_logs').insert({
    submission_id: submissionId,
    agent_id: agentId,
    agent_name: agentName,
    event_type: eventType,
    is_retention_call: isRetentionCall,  // ← ADD THIS FIELD
    ...otherParams
  });
};
```

### Step 4: Update Call Results Submission (3 minutes)

**Everywhere you insert into `call_results`:**

```typescript
// Before submitting call results, get the retention flag from session:
const { data: session } = await supabase
  .from('verification_sessions')
  .select('is_retention_call')
  .eq('submission_id', submissionId)
  .single();

// Then include it in call_results:
await supabase.from('call_results').insert({
  submission_id: submissionId,
  // ... all your other fields ...
  is_retention_call: session?.is_retention_call || false  // ← ADD THIS
});
```

### Step 5: Add Visual Indicators (10 minutes)

**Create a badge component:**

```typescript
// File: src/components/RetentionBadge.tsx
import { Badge } from "@/components/ui/badge";

export function RetentionBadge({ isRetentionCall }: { isRetentionCall?: boolean }) {
  if (!isRetentionCall) return null;
  
  return (
    <Badge variant="secondary" className="ml-2 bg-purple-100 text-purple-800">
      Retention
    </Badge>
  );
}
```

**Use it in your tables:**

```typescript
import { RetentionBadge } from "@/components/RetentionBadge";

// In your table cell:
<TableCell>
  {call.insured_name}
  <RetentionBadge isRetentionCall={call.is_retention_call} />
</TableCell>
```

### Step 6: Add Team Filter (15 minutes)

**Add filter to your dashboard:**

```typescript
import { Select } from "@/components/ui/select";

function Dashboard() {
  const [teamFilter, setTeamFilter] = useState('all');
  
  // In your query:
  let query = supabase.from('verification_sessions').select('*');
  
  if (teamFilter === 'sales') {
    query = query.eq('is_retention_call', false);
  } else if (teamFilter === 'retention') {
    query = query.eq('is_retention_call', true);
  }
  
  return (
    <div>
      <Select value={teamFilter} onValueChange={setTeamFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Teams</SelectItem>
          <SelectItem value="sales">Sales Team Only</SelectItem>
          <SelectItem value="retention">Retention Team Only</SelectItem>
        </SelectContent>
      </Select>
      
      {/* Your table/grid */}
    </div>
  );
}
```

### Step 7: Update Analytics (Optional - 20 minutes)

**Split stats by team:**

```typescript
// Get retention stats
const { count: retentionCount } = await supabase
  .from('verification_sessions')
  .select('*', { count: 'exact' })
  .eq('is_retention_call', true)
  .gte('created_at', startDate);

// Get sales stats
const { count: salesCount } = await supabase
  .from('verification_sessions')
  .select('*', { count: 'exact' })
  .eq('is_retention_call', false)
  .gte('created_at', startDate);

// Display in separate cards
<Card>
  <CardHeader>Sales Team Calls</CardHeader>
  <CardContent>{salesCount}</CardContent>
</Card>

<Card>
  <CardHeader>Retention Team Calls</CardHeader>
  <CardContent>{retentionCount}</CardContent>
</Card>
```

## 📊 Testing Your Implementation

### 1. Manual Test Flow
1. Go to dashboard
2. Claim a call
3. Check the "Mark as Retention Call" checkbox
4. Complete the verification
5. Submit call result
6. Check database: `SELECT * FROM verification_sessions WHERE submission_id = 'YOUR_ID'`
7. Verify `is_retention_call = true`

### 2. Database Verification
```sql
-- Run this to see your test data:
SELECT 
  vs.submission_id,
  vs.is_retention_call as session_retention,
  cr.is_retention_call as result_retention,
  ddf.is_retention_call as flow_retention
FROM verification_sessions vs
LEFT JOIN call_results cr ON vs.submission_id = cr.submission_id
LEFT JOIN daily_deal_flow ddf ON vs.submission_id = ddf.submission_id
WHERE vs.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY vs.created_at DESC;
```

### 3. UI Verification
- [ ] Checkbox appears in claim modal
- [ ] Checkbox appears when starting verification
- [ ] Badge shows on retention calls in tables
- [ ] Team filter works correctly
- [ ] Stats show separate numbers for each team

## 🐛 Common Issues & Solutions

### Issue: `is_retention_call` is always null
**Solution:** Make sure you're using `false` as default, not leaving it undefined:
```typescript
is_retention_call: isRetentionCall || false
```

### Issue: Flag not propagating to all tables
**Solution:** Update all related records when setting retention flag:
```typescript
await Promise.all([
  supabase.from('leads').update({ is_retention_call: true }).eq('submission_id', id),
  supabase.from('verification_sessions').update({ is_retention_call: true }).eq('submission_id', id),
  supabase.from('call_results').update({ is_retention_call: true }).eq('submission_id', id),
  supabase.from('daily_deal_flow').update({ is_retention_call: true }).eq('submission_id', id)
]);
```

### Issue: TypeScript errors about missing field
**Solution:** Regenerate types or add to your local interface:
```typescript
interface VerificationSession {
  // ... existing fields
  is_retention_call?: boolean;
}
```

## 📁 Files You'll Need to Update

**Minimum Required:**
1. ✏️ Claim modal component(s)
2. ✏️ Verification start component
3. ✏️ Call logging utility

**Recommended:**
4. ✏️ All call result submission forms
5. ✏️ Dashboard analytics/stats
6. ✏️ Table/list views (add badge)

**Optional:**
7. ✏️ Reporting screens
8. ✏️ Google Sheets sync (if applicable)
9. ✏️ Export functions

## 🎨 UI Component Examples

### Color Coding Table Rows
```typescript
<TableRow 
  className={call.is_retention_call ? 'bg-purple-50' : ''}
>
  {/* cells */}
</TableRow>
```

### Icon Indicator
```typescript
import { Users, Phone } from "lucide-react";

{call.is_retention_call ? (
  <Users className="h-4 w-4 text-purple-600" />
) : (
  <Phone className="h-4 w-4 text-blue-600" />
)}
```

## 📚 Documentation Reference

- **Full Guide:** `RETENTION_TEAM_TRACKING.md`
- **Database Summary:** `RETENTION_CALL_DATABASE_SUMMARY.md`
- **Test Queries:** `retention_call_testing_queries.sql`
- **Project Docs:** `PROJECT_DOCUMENTATION.md`

## ⏱️ Estimated Implementation Time

- **Minimum viable (checkboxes + basic tracking):** 30 minutes
- **With visual indicators and filters:** 1-2 hours
- **Full implementation with analytics:** 3-4 hours

## 🆘 Need Help?

1. Check existing callback implementation (`is_callback` column) - same pattern!
2. Search codebase for `is_callback` to see similar usage
3. Review `src/lib/callLogging.ts` for logging patterns
4. Check `src/components/VerificationDashboard.tsx` for session management

## ✨ Quick Win

**Want to see it working immediately?**

Just add this to ANY claim modal:

```typescript
const [isRetention, setIsRetention] = useState(false);

// In your JSX:
<Checkbox 
  checked={isRetention}
  onCheckedChange={setIsRetention}
/>
<label>Retention Call</label>

// When saving:
is_retention_call: isRetention
```

That's it! The database is ready, just add the checkbox. 🎉

---

**Remember:** Start small, test often, and build incrementally. The database is already set up - you're just adding the UI controls now!
