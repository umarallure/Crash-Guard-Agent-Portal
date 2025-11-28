# Lead Vendor Performance Reporting System

## Overview
This document describes the **Lead Vendor Performance** reporting page - a comprehensive analytics system designed to track call center performance metrics.

## Access
- **URL**: `http://localhost:8080/lead-vendor-performance`
- **Permissions**: Admin only (currently restricted to Ben - user ID: `424f4ea8-1b8c-4c0f-bc13-3ea699900c79`)
- **Navigation**: Available in the top navigation menu under "Reports & Analytics" → "Lead Vendor Performance"

## Current Implementation: Point #1 - Transfers Per Call Center

### What's Implemented
✅ **Number of transfers per call center** - Tracking daily deal flow calls/updates by lead vendor

### Data Source
- **Database Table**: `daily_deal_flow`
- **Key Fields**:
  - `lead_vendor` - The call center/BPO name
  - `date` - The date of the transfer
  - `submission_id` - Unique identifier for each transfer

### Features

#### 1. **Multi-Vendor Selection**
- Select one or multiple lead vendors to analyze
- 47 unique vendors available in the system
- "Select All" / "Deselect All" functionality
- Checkbox grid interface for easy selection

#### 2. **Time Range Filters**
- **Today**: Current day's transfers
- **Last 7 Days**: Weekly performance (default)
- **Last 30 Days**: Monthly trends
- **Last 90 Days**: Quarterly analysis
- **Custom Range**: Select specific start and end dates

#### 3. **Performance Metrics**
For each lead vendor, the system displays:
- **Total Transfers**: Total number of calls transferred in the selected period
- **Daily Average**: Average number of transfers per day
- **Ranking**: Vendors ranked by total transfers

#### 4. **Summary Dashboard**
- **Active Vendors**: Count of vendors with data in the period
- **Total Transfers**: Sum of all transfers across selected vendors
- **Avg Per Vendor**: Average transfers per vendor
- **Time Range**: Currently selected filter period

### Technical Implementation

#### Database Query
```sql
SELECT lead_vendor, date 
FROM daily_deal_flow
WHERE lead_vendor IN ('selected_vendors')
  AND date >= 'start_date'
  AND date <= 'end_date'
```

#### Performance Calculation
- Groups transfers by `lead_vendor`
- Counts total transfers for each vendor
- Calculates daily average: `total_transfers / days_in_period`
- Sorts vendors by total transfers (descending)

#### Real-time Updates
- Refresh button to reload latest data
- Automatic recalculation when filters change
- Toast notifications for data loading status

### UI Components

#### Summary Cards (Top Row)
1. **Active Vendors** (Blue) - Shows filtered vendor count
2. **Total Transfers** (Green) - Sum of all transfers
3. **Avg Per Vendor** (Purple) - Average across vendors
4. **Time Range** (Orange) - Selected period

#### Filters Card
- Time range dropdown
- Custom date range inputs (when "Custom Range" selected)
- Vendor multi-select checkboxes with scrollable grid
- Clear filters button
- Refresh data button

#### Performance Cards
- Ranked list of vendors (1st, 2nd, 3rd, etc.)
- Large metric displays for quick scanning
- Visual hierarchy with card hover effects
- Color-coded metrics:
  - Green: Total transfers
  - Purple: Daily average

### Future Enhancements (Planned)

#### Point #2: Application Submissions
- Number of entries with policy numbers in Monday.com
- Integration with Monday.com API
- Filter by submission status

#### Point #3: Policies Approved
- Exclude: Declined, Closed as Incomplete, Chargeback, Withdrawn, Cannot Find Carrier
- Status-based filtering
- Approval rate calculation

#### Point #4: Approved Placed Policies by Status
- Pending lapse tracking
- Active policies persistence (3 months, 6 months, 9+ months from draft date)
- Status breakdown visualization

#### Point #5: Policies Paid
- Deal value tracking
- Paid status verification
- Revenue metrics

#### Point #6: Chargebacks
- Commission portal chargeback report integration
- Chargeback rate calculation
- Financial impact analysis

#### Point #7: Carrier Distribution
- Percentage breakdown by carrier
- Carrier performance comparison
- Visual pie/bar charts

#### Point #8: Average Deal Size
- Calculate by center
- Premium amount analysis
- Deal size trends over time

### Vendor List (47 Total)
The system currently tracks these lead vendors:
- AJ BPO
- Ambition
- Argon Comm
- Avenue Consultancy
- Cerberus BPO
- Crown Connect BPO
- CrossNotch
- Cyber Leads
- DownTown BPO
- Emperor BPO
- Ethos BPO
- Exito BPO
- GrowthOnics BPO
- Helix BPO
- Maverick
- NanoTech
- Networkize
- Plexi
- Pro Solutions BPO
- Progressive BPO
- Rock BPO
- SellerZ BPO
- StratiX BPO
- TechPlanet
- TM Global
- Trust Link
- Ultimate Solutions
- Vize BPO
- Vyn BPO
- WinBPO
- And more...

### Code Files
- **Page Component**: `src/pages/LeadVendorPerformance.tsx`
- **Route**: Added to `src/App.tsx`
- **Navigation**: Updated in `src/components/NavigationHeader.tsx`

### Testing Checklist
✅ Build successful (no compilation errors)
✅ TypeScript validation passed
✅ Route configured correctly
✅ Navigation link added to menu
✅ Admin-only access enforcement
✅ Database schema validated
✅ Query optimization for performance

### Usage Instructions

1. **Access the Page**
   - Login as admin user
   - Click navigation menu (top right)
   - Select "Reports & Analytics" → "Lead Vendor Performance"

2. **Filter Data**
   - Choose time range (default: Last 7 Days)
   - Select vendors to analyze (default: All selected)
   - For custom dates, select "Custom Range" and pick dates
   - Click "Refresh" to reload data

3. **Analyze Results**
   - View summary cards for quick insights
   - Scroll through ranked vendor performance cards
   - Compare total transfers and daily averages
   - Identify top-performing call centers

4. **Export/Share** (Future Enhancement)
   - Screenshot the page for reports
   - Copy metrics manually (export feature planned)

### Performance Considerations
- Optimized queries with proper indexing on `lead_vendor` and `date` fields
- Efficient grouping and aggregation
- Client-side caching for vendor list
- Lazy loading for large datasets
- Responsive design for various screen sizes

### Data Accuracy
- Data pulled directly from `daily_deal_flow` table
- Real-time calculations on every filter change
- No cached/stale data
- Timestamp-accurate date filtering

### Security
- Admin-only access (currently Ben only)
- Protected route with authentication check
- Automatic redirect for unauthorized users
- Supabase RLS policies enforced

### Next Steps
1. ✅ **Point #1 Complete**: Transfers per call center implemented
2. ⏳ **Point #2 Next**: Monday.com integration for application submissions
3. ⏳ **Points #3-8**: Additional metrics as per requirements

---

**Created**: November 26, 2025
**Developer**: AI Assistant
**Status**: Point #1 Implemented and Tested
**Version**: 1.0.0
