-- ============================================================
-- RETENTION CALL TRACKING - TESTING & VERIFICATION QUERIES
-- ============================================================
-- Created: October 14, 2025
-- Purpose: Test and verify the is_retention_call feature
-- ============================================================

-- ============================================================
-- 1. VERIFY COLUMN CREATION
-- ============================================================

-- Check all tables have is_retention_call column
SELECT 
  table_name,
  column_name,
  data_type,
  column_default,
  is_nullable,
  col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position) as column_comment
FROM information_schema.columns
WHERE column_name = 'is_retention_call'
  AND table_schema = 'public'
ORDER BY table_name;

-- Expected: 5 rows (leads, call_results, verification_sessions, call_update_logs, daily_deal_flow)


-- ============================================================
-- 2. TEST DATA INSERTION
-- ============================================================

-- Test inserting a retention call in verification_sessions
INSERT INTO verification_sessions (
  submission_id,
  is_retention_call,
  status,
  buffer_agent_id
) VALUES (
  'TEST-RETENTION-001',
  true,
  'pending',
  NULL -- Replace with actual user_id if testing
)
ON CONFLICT DO NOTHING;

-- Test inserting a regular sales call
INSERT INTO verification_sessions (
  submission_id,
  is_retention_call,
  status,
  buffer_agent_id
) VALUES (
  'TEST-SALES-001',
  false,
  'pending',
  NULL -- Replace with actual user_id if testing
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. QUERY STATISTICS
-- ============================================================

-- Count calls by team type
SELECT 
  CASE 
    WHEN is_retention_call = true THEN 'Retention Team'
    WHEN is_retention_call = false THEN 'Sales Team'
    ELSE 'Unknown'
  END as team_type,
  COUNT(*) as total_calls
FROM verification_sessions
GROUP BY is_retention_call
ORDER BY team_type;

-- Daily deal flow by team
SELECT 
  CASE 
    WHEN is_retention_call = true THEN 'Retention Team'
    WHEN is_retention_call = false THEN 'Sales Team'
    ELSE 'Unknown'
  END as team_type,
  COUNT(*) as total_entries,
  COUNT(CASE WHEN status = 'Submitted' THEN 1 END) as submitted_count,
  SUM(monthly_premium) as total_premium,
  AVG(monthly_premium) as avg_premium
FROM daily_deal_flow
GROUP BY is_retention_call
ORDER BY team_type;

-- Call results by team
SELECT 
  is_retention_call,
  status,
  COUNT(*) as call_count,
  SUM(coverage_amount) as total_coverage,
  AVG(monthly_premium) as avg_premium
FROM call_results
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY is_retention_call, status
ORDER BY is_retention_call, status;


-- ============================================================
-- 4. DATA CONSISTENCY CHECKS
-- ============================================================

-- Check if retention flag is consistent across related tables
SELECT 
  l.submission_id,
  l.customer_full_name,
  l.is_retention_call as lead_retention,
  vs.is_retention_call as session_retention,
  cr.is_retention_call as result_retention,
  ddf.is_retention_call as daily_flow_retention,
  -- Flag inconsistencies
  CASE 
    WHEN l.is_retention_call = vs.is_retention_call 
     AND vs.is_retention_call = cr.is_retention_call 
     AND cr.is_retention_call = ddf.is_retention_call THEN 'Consistent'
    ELSE 'INCONSISTENT - NEEDS REVIEW'
  END as consistency_check
FROM leads l
LEFT JOIN verification_sessions vs ON l.submission_id = vs.submission_id
LEFT JOIN call_results cr ON l.submission_id = cr.submission_id
LEFT JOIN daily_deal_flow ddf ON l.submission_id = ddf.submission_id
WHERE l.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY l.created_at DESC
LIMIT 50;


-- ============================================================
-- 5. AGENT ACTIVITY BY TEAM
-- ============================================================

-- Buffer agent activity by call type
SELECT 
  p.display_name as agent_name,
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN vs.is_retention_call = true THEN 1 END) as retention_calls,
  COUNT(CASE WHEN vs.is_retention_call = false THEN 1 END) as sales_calls,
  ROUND(
    COUNT(CASE WHEN vs.is_retention_call = true THEN 1 END)::numeric / 
    NULLIF(COUNT(*), 0) * 100, 
    2
  ) as retention_percentage
FROM verification_sessions vs
JOIN profiles p ON vs.buffer_agent_id = p.user_id
WHERE vs.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.display_name
ORDER BY total_sessions DESC;

-- Licensed agent activity by call type
SELECT 
  p.display_name as agent_name,
  COUNT(*) as total_claims,
  COUNT(CASE WHEN vs.is_retention_call = true THEN 1 END) as retention_claims,
  COUNT(CASE WHEN vs.is_retention_call = false THEN 1 END) as sales_claims
FROM verification_sessions vs
JOIN profiles p ON vs.licensed_agent_id = p.user_id
WHERE vs.claimed_at >= CURRENT_DATE - INTERVAL '30 days'
  AND vs.licensed_agent_id IS NOT NULL
GROUP BY p.display_name
ORDER BY total_claims DESC;


-- ============================================================
-- 6. CALL UPDATE LOGS ANALYSIS
-- ============================================================

-- Event distribution by team
SELECT 
  CASE 
    WHEN is_retention_call = true THEN 'Retention'
    ELSE 'Sales'
  END as team,
  event_type,
  COUNT(*) as event_count
FROM call_update_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY is_retention_call, event_type
ORDER BY team, event_count DESC;


-- ============================================================
-- 7. PERFORMANCE METRICS BY TEAM
-- ============================================================

-- Conversion rates by team
SELECT 
  CASE 
    WHEN is_retention_call = true THEN 'Retention Team'
    ELSE 'Sales Team'
  END as team,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN application_submitted = true THEN 1 END) as submitted,
  COUNT(CASE WHEN status = 'DQ' THEN 1 END) as disqualified,
  ROUND(
    COUNT(CASE WHEN application_submitted = true THEN 1 END)::numeric / 
    NULLIF(COUNT(*), 0) * 100, 
    2
  ) as conversion_rate_percent
FROM call_results
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY is_retention_call
ORDER BY team;

-- Average call duration by team (if you have timestamp data)
SELECT 
  CASE 
    WHEN is_retention_call = true THEN 'Retention Team'
    ELSE 'Sales Team'
  END as team,
  COUNT(*) as total_sessions,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_duration_minutes
FROM verification_sessions
WHERE completed_at IS NOT NULL
  AND started_at IS NOT NULL
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY is_retention_call
ORDER BY team;


-- ============================================================
-- 8. DATA MIGRATION UTILITIES
-- ============================================================

-- Set all calls from specific lead vendor as retention calls
-- CAUTION: Review before running!
/*
UPDATE leads 
SET is_retention_call = true
WHERE lead_vendor = 'RETENTION_VENDOR_NAME';

UPDATE verification_sessions vs
SET is_retention_call = true
FROM leads l
WHERE vs.submission_id = l.submission_id
  AND l.lead_vendor = 'RETENTION_VENDOR_NAME';

UPDATE call_results cr
SET is_retention_call = true
FROM leads l
WHERE cr.submission_id = l.submission_id
  AND l.lead_vendor = 'RETENTION_VENDOR_NAME';

UPDATE daily_deal_flow ddf
SET is_retention_call = true
WHERE lead_vendor = 'RETENTION_VENDOR_NAME';
*/

-- Mark specific submissions as retention calls
-- CAUTION: Replace submission IDs before running!
/*
DO $$
DECLARE
  retention_submissions TEXT[] := ARRAY['SUB-001', 'SUB-002', 'SUB-003'];
BEGIN
  UPDATE leads SET is_retention_call = true 
  WHERE submission_id = ANY(retention_submissions);
  
  UPDATE verification_sessions SET is_retention_call = true 
  WHERE submission_id = ANY(retention_submissions);
  
  UPDATE call_results SET is_retention_call = true 
  WHERE submission_id = ANY(retention_submissions);
  
  UPDATE daily_deal_flow SET is_retention_call = true 
  WHERE submission_id = ANY(retention_submissions);
  
  UPDATE call_update_logs SET is_retention_call = true 
  WHERE submission_id = ANY(retention_submissions);
END $$;
*/


-- ============================================================
-- 9. CLEANUP TEST DATA
-- ============================================================

-- Remove test entries (if you created any)
/*
DELETE FROM verification_sessions 
WHERE submission_id LIKE 'TEST-%';

DELETE FROM leads 
WHERE submission_id LIKE 'TEST-%';

DELETE FROM call_results 
WHERE submission_id LIKE 'TEST-%';

DELETE FROM daily_deal_flow 
WHERE submission_id LIKE 'TEST-%';

DELETE FROM call_update_logs 
WHERE submission_id LIKE 'TEST-%';
*/


-- ============================================================
-- 10. PERFORMANCE INDEXES (Optional - only if queries are slow)
-- ============================================================

-- Check if indexes exist
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('verification_sessions', 'call_results', 'daily_deal_flow', 'call_update_logs', 'leads')
  AND indexdef LIKE '%is_retention_call%'
ORDER BY tablename;

-- Create indexes if needed (run only if filtering by is_retention_call is slow)
/*
CREATE INDEX IF NOT EXISTS idx_verification_sessions_retention 
ON verification_sessions(is_retention_call) 
WHERE is_retention_call = true;

CREATE INDEX IF NOT EXISTS idx_call_results_retention 
ON call_results(is_retention_call) 
WHERE is_retention_call = true;

CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_retention 
ON daily_deal_flow(is_retention_call) 
WHERE is_retention_call = true;

CREATE INDEX IF NOT EXISTS idx_leads_retention 
ON leads(is_retention_call) 
WHERE is_retention_call = true;
*/


-- ============================================================
-- 11. REPORTING QUERIES
-- ============================================================

-- Weekly team performance report
SELECT 
  DATE_TRUNC('week', created_at) as week_start,
  CASE 
    WHEN is_retention_call = true THEN 'Retention'
    ELSE 'Sales'
  END as team,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN application_submitted = true THEN 1 END) as submitted,
  SUM(monthly_premium) as total_premium,
  AVG(monthly_premium) as avg_premium
FROM call_results
WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', created_at), is_retention_call
ORDER BY week_start DESC, team;

-- Top performing agents by team
SELECT 
  CASE 
    WHEN cr.is_retention_call = true THEN 'Retention'
    ELSE 'Sales'
  END as team,
  p.display_name as agent_name,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN cr.application_submitted = true THEN 1 END) as submissions,
  SUM(cr.monthly_premium) as total_premium,
  ROUND(AVG(cr.monthly_premium), 2) as avg_premium
FROM call_results cr
JOIN profiles p ON cr.user_id = p.user_id
WHERE cr.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY cr.is_retention_call, p.display_name
ORDER BY team, total_premium DESC;


-- ============================================================
-- END OF TEST QUERIES
-- ============================================================
