# Multi-Select Status Filter - Agent Performance Tab

## Overview
Added a multi-select status filter to the Agent Performance tab, allowing admins to filter placements by one or multiple statuses to better track placement progress across all agents.

## What Was Added

### 1. Multi-Select Component (`src/components/ui/multi-select.tsx`)
Created a reusable multi-select component with:
- **Search functionality** - Search through options
- **Badge display** - Shows selected items as removable badges
- **Checkbox interface** - Visual checkboxes for selection
- **Compact display** - Shows "X selected" when more than 3 items chosen
- **Keyboard navigation** - Full keyboard support
- **Click-to-remove** - Click X on badges to remove selection

### 2. Updated Agent Performance Tab (`components/AgentsPerformanceTab.tsx`)
Added:
- **Status filter UI** at the top of the tab
- Multi-select dropdown for status selection
- Helper text showing currently selected statuses
- **Status breakdown section** for each agent showing placement count per status
- Props: `uniqueStatuses`, `selectedStatuses`, `onStatusFilterChange`

### 3. Updated Admin Analytics (`AdminAnalytics.tsx`)
Added:
- State: `agentStatusFilter` (array of selected statuses)
- Updated `getAgentPerformance()` to:
  - Apply agent-specific status filter after global filters
  - Calculate status breakdown for each agent
  - Include `statusBreakdown` in agent performance data
- Pass filter props to AgentsPerformanceTab component

## How It Works

### Filter Hierarchy
```
1. Global Filters (Date, Carrier, General Status)
   ↓
2. Filter by Agent Name
   ↓
3. Agent-Specific Status Filter (Multi-select)
   ↓
4. Calculate Metrics & Status Breakdown
```

### User Experience

#### Without Status Filter (Default)
- All statuses included
- Agent cards show total placements across all statuses
- Status breakdown shows all statuses for each agent

#### With Status Filter
1. User clicks status filter dropdown
2. Searches/selects one or more statuses (e.g., "Issued Paid", "Issued Not Paid")
3. Agent cards instantly update to show only those statuses
4. Metrics recalculate based on filtered placements
5. Status breakdown shows only selected statuses

### Example Use Cases

#### Scenario 1: Track Paid Policies
- Select: "Issued Paid"
- See which agents have the most paid policies
- Compare paid policy premiums across agents

#### Scenario 2: Monitor Pending Pipeline
- Select: "Pending", "Pending Lapse"
- Track agents' pending workload
- Identify bottlenecks in the pipeline

#### Scenario 3: Analyze Declined Cases
- Select: "Declined", "Withdrawn"
- Understand decline patterns per agent
- Identify training opportunities

#### Scenario 4: Multiple Status Analysis
- Select: "Issued Paid", "Issued Not Paid", "Pending"
- See only active/viable placements
- Exclude closed/incomplete cases

## Visual Features

### Filter Section
```
┌─────────────────────────────────────────────────────┐
│ Filter by Status                                    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Issued Paid × | Issued Not Paid × | Pending ×  │ │
│ └─────────────────────────────────────────────────┘ │
│ Showing placements with status: Issued Paid, ...   │
└─────────────────────────────────────────────────────┘
```

### Agent Card with Status Breakdown
```
┌──────────────────────────────────────────────────────┐
│ #1  Isaac Reed                    5 carriers         │
│     ┌──────────┬──────────┬──────────┐              │
│     │   45     │ $125,000 │  $2,778  │              │
│     │Placements│  Total   │   Avg    │              │
│     └──────────┴──────────┴──────────┘              │
│     ─────────────────────────────────────────────    │
│     Status Breakdown:                                │
│     [Issued Paid: 20] [Issued Not Paid: 15]         │
│     [Pending: 10]                                    │
└──────────────────────────────────────────────────────┘
```

## Technical Implementation

### Multi-Select Component
```typescript
<MultiSelect
  options={uniqueStatuses}
  selected={selectedStatuses}
  onChange={onStatusFilterChange}
  placeholder="All statuses (click to filter)"
/>
```

### Status Filtering Logic
```typescript
// First apply global filters
let agentPlacements = filteredPlacements.filter(
  p => getColumnValue(p, 'color_mkq0rkaw') === agentName
);

// Then apply agent-specific status filter
if (agentStatusFilter.length > 0) {
  agentPlacements = agentPlacements.filter(
    p => agentStatusFilter.includes(getColumnValue(p, 'status'))
  );
}
```

### Status Breakdown Calculation
```typescript
const statusBreakdown: Record<string, number> = {};
agentPlacements.forEach(p => {
  const status = getColumnValue(p, 'status');
  if (status) {
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
  }
});
```

## Files Modified

1. ✅ `src/components/ui/multi-select.tsx` - New reusable component
2. ✅ `src/pages/AdminAnalytics/components/AgentsPerformanceTab.tsx` - Added filter UI
3. ✅ `src/pages/AdminAnalytics/AdminAnalytics.tsx` - Added filter logic
4. ✅ `src/pages/AdminAnalytics/README.md` - Updated documentation

## Benefits

### For Admins
- **Granular tracking** - Monitor specific placement statuses
- **Quick insights** - Instantly see which agents excel in paid policies
- **Pipeline management** - Track pending cases across team
- **Performance analysis** - Compare agents on specific metrics

### Performance
- **Client-side filtering** - No API calls, instant results
- **Works with cache** - Leverages React Query cached data
- **Efficient** - Only recalculates when filter changes

### User Experience
- **Intuitive UI** - Familiar multi-select pattern
- **Visual feedback** - Badges show selected items clearly
- **Flexible** - Select as many or few statuses as needed
- **Searchable** - Find statuses quickly in long lists

## Available Statuses

Based on the image you provided, the system includes:
- All Statuses (default)
- Charge Back (31)
- Closed as Incomplete (5)
- Declined (79)
- Issued Not Paid (109)
- Issued Paid (100)
- Pending (37)
- Pending Lapse (8)
- Withdrawn (34)

## Testing Checklist

- [x] Multi-select component renders correctly
- [x] Can select multiple statuses
- [x] Can deselect statuses by clicking X
- [x] Search functionality works
- [x] Agent metrics update when filter changes
- [x] Status breakdown displays correctly
- [x] Works with global filters
- [x] No TypeScript errors
- [x] No console errors
- [x] Responsive design works

## Future Enhancements

- [ ] Add "Select All" and "Clear All" quick actions
- [ ] Save filter preferences per user
- [ ] Add status color coding (red for declined, green for paid, etc.)
- [ ] Export filtered data to CSV
- [ ] Add status trend charts (status changes over time)
- [ ] Add agent comparison mode with status filters

## Notes

- Filter is **additive** - selecting multiple statuses shows placements matching ANY of them (OR logic)
- Filter works **in addition to** global filters (AND logic between global and agent-specific)
- Status breakdown always shows actual counts even when no filter is applied
- Empty filter means "all statuses" (no filtering)
