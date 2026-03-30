-- Update query to replace submission portal stage labels with their keys
UPDATE daily_deal_flow
SET status = ps.key
FROM portal_stages ps
WHERE ps.pipeline = 'submission_portal'
  AND ps.is_active = true
  AND ps.label = daily_deal_flow.status
  AND daily_deal_flow.status IS NOT NULL;

-- After running the update, you can verify the changes with: