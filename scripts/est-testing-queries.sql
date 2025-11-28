-- EST Timezone Database Verification Query
-- Run this in your Supabase SQL editor to verify EST timestamps

-- Check recent daily_deal_flow entries with timezone info
SELECT 
  id,
  submission_id,
  date,
  created_at,
  updated_at,
  -- Convert UTC stored timestamps to EST for comparison
  created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York' as created_at_est,
  updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York' as updated_at_est,
  -- Show today's date in EST
  CURRENT_DATE AT TIME ZONE 'America/New_York' as today_est
FROM daily_deal_flow 
WHERE created_at >= NOW() - INTERVAL '1 day'
ORDER BY created_at DESC 
LIMIT 10;

-- Check if dates match EST timezone expectations
SELECT 
  COUNT(*) as entries_today_est,
  date,
  MIN(created_at) as first_entry,
  MAX(created_at) as last_entry
FROM daily_deal_flow 
WHERE date = (CURRENT_DATE AT TIME ZONE 'America/New_York')::date::text
GROUP BY date;