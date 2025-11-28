# Retention Call Tracking - Database Implementation Summary

## ✅ Completed Actions

### Database Migrations Applied

Successfully added `is_retention_call` boolean column to **5 critical tables**:

#### 1. **leads** table
```sql
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS is_retention_call BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.leads.is_retention_call IS 
  'Indicates whether this lead is assigned to the retention team';
```

#### 2. **call_results** table
```sql
ALTER TABLE public.call_results
ADD COLUMN IF NOT EXISTS is_retention_call BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.call_results.is_retention_call IS 
  'Indicates whether this call was handled by the retention team';
```

#### 3. **verification_sessions** table
```sql
ALTER TABLE public.verification_sessions
ADD COLUMN IF NOT EXISTS is_retention_call BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.verification_sessions.is_retention_call IS 
  'Indicates whether this verification session is for a retention team call';
```

#### 4. **call_update_logs** table
```sql
ALTER TABLE public.call_update_logs
ADD COLUMN IF NOT EXISTS is_retention_call BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.call_update_logs.is_retention_call IS 
  'Indicates whether this log entry is for a retention team call';
```

#### 5. **daily_deal_flow** table
```sql
ALTER TABLE public.daily_deal_flow
ADD COLUMN IF NOT EXISTS is_retention_call BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.daily_deal_flow.is_retention_call IS 
  'Indicates whether this call was handled by the retention team';
```

## Database Verification

### Column Verification Query Results
All 5 tables now have the `is_retention_call` column with:
- **Data Type:** `boolean`
- **Default Value:** `false`
- **Nullable:** `YES`
- **Comments:** Descriptive text explaining purpose

## Architecture Overview

### Data Flow with Retention Tracking

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Dashboard                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Claim Call Modal                                     │  │
│  │  ☐ Mark as Retention Call [CHECKBOX]                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ is_retention_call = true/false
                      ▼
┌─────────────────────────────────────────────────────────────┐
│             verification_sessions table                      │
│  - session_id                                                │
│  - buffer_agent_id                                           │
│  - is_retention_call ◄── NEW FIELD                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ Propagates to all related tables
                      ▼
        ┌─────────────┴─────────────┬──────────────┐
        ▼                           ▼              ▼
┌──────────────┐          ┌──────────────┐  ┌──────────────┐
│    leads     │          │call_results  │  │call_update   │
│              │          │              │  │    _logs     │
│is_retention  │          │is_retention  │  │is_retention  │
│   _call      │          │   _call      │  │   _call      │
└──────────────┘          └──────────────┘  └──────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │ daily_deal_flow  │
                      │                  │
                      │  is_retention    │
                      │     _call        │
                      └──────────────────┘
```

## Use Cases

### 1. **Claiming a Call**
When an agent claims a call from the dashboard:
```typescript
// Frontend: Add checkbox to claim modal
<Checkbox 
  checked={isRetentionCall}
  onCheckedChange={setIsRetentionCall}
  label="Mark as Retention Call"
/>

// Backend: Update verification session
await supabase
  .from('verification_sessions')
  .update({ 
    is_retention_call: isRetentionCall,
    licensed_agent_id: agentId,
    claimed_at: now()
  })
  .eq('id', sessionId);
```

### 2. **Starting Verification**
When buffer agent starts verification:
```typescript
// Create verification session with retention flag
const { data } = await supabase
  .from('verification_sessions')
  .insert({
    submission_id,
    buffer_agent_id: userId,
    is_retention_call: isRetentionCall, // From checkbox
    status: 'in_progress'
  });

// Update lead to match
await supabase
  .from('leads')
  .update({ is_retention_call: isRetentionCall })
  .eq('submission_id', submission_id);
```

### 3. **Logging Call Updates**
All call update logs should track retention status:
```typescript
await supabase.from('call_update_logs').insert({
  submission_id,
  agent_id,
  event_type: 'call_claimed',
  is_retention_call: isRetentionCall, // Include in logs
  // ... other fields
});
```

### 4. **Filtering & Analytics**
Query calls by team:
```typescript
// Sales team calls only
const { data: salesCalls } = await supabase
  .from('verification_sessions')
  .select('*')
  .eq('is_retention_call', false);

// Retention team calls only
const { data: retentionCalls } = await supabase
  .from('verification_sessions')
  .select('*')
  .eq('is_retention_call', true);

// Team-specific stats
const { count: retentionCount } = await supabase
  .from('daily_deal_flow')
  .select('*', { count: 'exact' })
  .eq('is_retention_call', true)
  .gte('date', startDate);
```

## Frontend Implementation Checklist

### 🔲 Phase 1: Core UI Components
- [ ] Add "Mark as Retention Call" checkbox to claim modals
- [ ] Add retention checkbox to verification start screen
- [ ] Create retention badge/indicator component
- [ ] Add retention filter to dashboard tables

### 🔲 Phase 2: Data Integration
- [ ] Update all `INSERT` operations to include `is_retention_call`
- [ ] Update all `UPDATE` operations to propagate flag
- [ ] Modify call logging functions to include retention status
- [ ] Update bulk import scripts

### 🔲 Phase 3: Analytics & Reporting
- [ ] Add retention stats to dashboard
- [ ] Create separate metrics cards for each team
- [ ] Update Google Sheets sync (if applicable)
- [ ] Add retention filters to reporting screens

### 🔲 Phase 4: Visual Enhancements
- [ ] Color-code retention calls in tables
- [ ] Add team badges to call cards
- [ ] Implement retention-specific icons
- [ ] Create team leaderboards

## Key Implementation Files

### Components to Update
1. **`src/components/ClaimModal.tsx`** - Add retention checkbox
2. **`src/components/VerificationDashboard.tsx`** - Start verification with flag
3. **`src/components/DailyDealFlow.tsx`** - Display retention indicator
4. **`src/pages/Dashboard.tsx`** - Add team filters

### Utilities to Update
1. **`src/lib/callLogging.ts`** - Include `is_retention_call` in logs
2. **`src/integrations/supabase/types.ts`** - Updated TypeScript types (generated)

### Database Functions to Update (if needed)
1. **`log_call_update`** - Add parameter for retention flag
2. **`get_dashboard_analytics`** - Split stats by team
3. Any triggers syncing to `daily_deal_flow`

## Example Code Snippets

### Adding Checkbox to Modal
```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function ClaimModal({ sessionId, onClaim }) {
  const [isRetentionCall, setIsRetentionCall] = useState(false);
  
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim Call</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Existing fields */}
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="retention-call"
              checked={isRetentionCall}
              onCheckedChange={setIsRetentionCall}
            />
            <Label 
              htmlFor="retention-call" 
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Mark as Retention Call
            </Label>
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={() => onClaim({ isRetentionCall })}>
            Claim Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Retention Badge Component
```typescript
import { Badge } from "@/components/ui/badge";

function RetentionBadge({ isRetentionCall }: { isRetentionCall: boolean }) {
  if (!isRetentionCall) return null;
  
  return (
    <Badge variant="secondary" className="ml-2">
      Retention
    </Badge>
  );
}

// Usage in table
<TableCell>
  {call.insured_name}
  <RetentionBadge isRetentionCall={call.is_retention_call} />
</TableCell>
```

### Team Filter Component
```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function TeamFilter({ value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Filter by team" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Calls</SelectItem>
        <SelectItem value="sales">Sales Team</SelectItem>
        <SelectItem value="retention">Retention Team</SelectItem>
      </SelectContent>
    </Select>
  );
}

// In your query
const filterQuery = teamFilter === 'all' 
  ? supabase.from('verification_sessions').select('*')
  : supabase.from('verification_sessions').select('*').eq('is_retention_call', teamFilter === 'retention');
```

## Testing Strategy

### Database Tests
```sql
-- Test 1: Verify columns exist
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE column_name = 'is_retention_call'
  AND table_schema = 'public';

-- Test 2: Insert test data
INSERT INTO verification_sessions (submission_id, is_retention_call, status)
VALUES ('TEST-001', true, 'pending');

-- Test 3: Query by retention status
SELECT COUNT(*) FROM verification_sessions WHERE is_retention_call = true;

-- Test 4: Join across tables
SELECT 
  l.submission_id,
  l.is_retention_call as lead_retention,
  vs.is_retention_call as session_retention,
  cr.is_retention_call as result_retention
FROM leads l
LEFT JOIN verification_sessions vs ON l.submission_id = vs.submission_id
LEFT JOIN call_results cr ON l.submission_id = cr.submission_id
WHERE l.is_retention_call = true;
```

### Frontend Tests
1. **Claim Modal**: Verify checkbox appears and state updates
2. **Data Submission**: Confirm `is_retention_call` is sent to API
3. **Display**: Check badge/indicator shows on retention calls
4. **Filtering**: Test team filter returns correct results
5. **Analytics**: Verify stats split correctly by team

## Performance Considerations

### Indexing (if needed for large datasets)
```sql
-- Add index if filtering by is_retention_call is slow
CREATE INDEX IF NOT EXISTS idx_verification_sessions_retention 
ON verification_sessions(is_retention_call);

CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_retention 
ON daily_deal_flow(is_retention_call);

CREATE INDEX IF NOT EXISTS idx_call_results_retention 
ON call_results(is_retention_call);
```

### Query Optimization
```sql
-- Instead of separate queries
-- Inefficient:
SELECT * FROM calls WHERE is_retention_call = true;
SELECT * FROM calls WHERE is_retention_call = false;

-- Better: Use single query with GROUP BY
SELECT 
  is_retention_call,
  COUNT(*) as call_count,
  AVG(monthly_premium) as avg_premium
FROM daily_deal_flow
GROUP BY is_retention_call;
```

## Security & Permissions

### RLS Policies (Optional)
If you want to restrict which agents can see retention calls:

```sql
-- Example: Retention agents only see retention calls
CREATE POLICY "retention_agents_see_retention_calls"
ON verification_sessions
FOR SELECT
USING (
  CASE 
    WHEN auth.uid() IN (
      SELECT user_id FROM profiles 
      WHERE agent_code LIKE 'RET-%'
    )
    THEN is_retention_call = true
    ELSE true  -- Sales agents see all
  END
);
```

## Migration Files Reference

All migrations are timestamped and stored in Supabase:

1. ✅ `add_is_retention_call_to_daily_deal_flow`
2. ✅ `add_is_retention_call_to_call_results`
3. ✅ `add_is_retention_call_to_call_update_logs`
4. ✅ `add_is_retention_call_to_verification_sessions`
5. ✅ `add_is_retention_call_to_leads`

## Next Steps

### Immediate Actions
1. ✅ Database migrations completed
2. ⏳ Update TypeScript types (generate from Supabase)
3. ⏳ Implement UI checkbox in claim modals
4. ⏳ Add retention flag to verification start
5. ⏳ Update call logging functions

### Short-term Goals
- Display retention indicators in tables
- Add team filter to dashboards
- Update analytics queries
- Test end-to-end workflows

### Long-term Enhancements
- Team-specific dashboards
- Retention vs Sales performance comparison
- Advanced analytics and reporting
- Automated team assignment based on lead type

## Support & Documentation

- **Full Implementation Guide**: `RETENTION_TEAM_TRACKING.md`
- **Project Architecture**: `PROJECT_DOCUMENTATION.md`
- **Database Schema**: Access via Supabase Dashboard
- **TypeScript Types**: `src/integrations/supabase/types.ts`

---

**Status**: Database layer complete ✅ | Frontend implementation ready to start 🚀

**Date Completed**: October 14, 2025

**Next Review**: After frontend implementation phase
