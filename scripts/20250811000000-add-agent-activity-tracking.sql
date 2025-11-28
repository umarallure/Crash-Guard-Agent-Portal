-- Migration to enhance verification system for comprehensive agent activity tracking
-- Add fields to track when buffer agent ends call at transfer
-- Add agent activity tracking

-- Add columns to verification_sessions for better tracking
ALTER TABLE verification_sessions 
ADD COLUMN IF NOT EXISTS buffer_call_ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS transferred_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS claim_method VARCHAR(50) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS agent_notes TEXT;

-- Create agent_activity table for real-time status tracking
CREATE TABLE IF NOT EXISTS agent_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_type VARCHAR(20) NOT NULL CHECK (agent_type IN ('buffer', 'licensed')),
    status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'in_call', 'available', 'offline', 'break')),
    current_session_id UUID REFERENCES verification_sessions(id),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_started_at TIMESTAMPTZ,
    total_calls_today INTEGER DEFAULT 0,
    total_transfers_today INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent_id ON agent_activity(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_status ON agent_activity(status);
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent_type ON agent_activity(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_activity_last_activity ON agent_activity(last_activity_at);

-- Add RLS policies for agent_activity
ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all agent activity (for dashboard)
CREATE POLICY "Users can view all agent activity" ON agent_activity
    FOR SELECT USING (true);

-- Policy: Users can update their own activity
CREATE POLICY "Users can update own activity" ON agent_activity
    FOR UPDATE USING (agent_id = auth.uid());

-- Policy: Users can insert their own activity
CREATE POLICY "Users can insert own activity" ON agent_activity
    FOR INSERT WITH CHECK (agent_id = auth.uid());

-- Function to automatically update agent activity
CREATE OR REPLACE FUNCTION update_agent_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- When verification session status changes, update agent activity
    IF TG_OP = 'UPDATE' THEN
        -- Update buffer agent activity
        IF OLD.status != NEW.status AND NEW.buffer_agent_id IS NOT NULL THEN
            INSERT INTO agent_activity (agent_id, agent_type, status, current_session_id, last_activity_at)
            VALUES (
                NEW.buffer_agent_id, 
                'buffer', 
                CASE 
                    WHEN NEW.status IN ('pending', 'in_progress') THEN 'in_call'
                    WHEN NEW.status = 'transferred' THEN 'available'
                    ELSE 'available'
                END,
                NEW.id,
                NOW()
            )
            ON CONFLICT (agent_id) DO UPDATE SET
                status = EXCLUDED.status,
                current_session_id = EXCLUDED.current_session_id,
                last_activity_at = EXCLUDED.last_activity_at,
                total_transfers_today = CASE 
                    WHEN NEW.status = 'transferred' AND OLD.status != 'transferred' 
                    THEN agent_activity.total_transfers_today + 1
                    ELSE agent_activity.total_transfers_today
                END,
                updated_at = NOW();
        END IF;

        -- Update licensed agent activity
        IF NEW.licensed_agent_id IS NOT NULL AND NEW.licensed_agent_id != OLD.licensed_agent_id THEN
            INSERT INTO agent_activity (agent_id, agent_type, status, current_session_id, last_activity_at)
            VALUES (
                NEW.licensed_agent_id, 
                'licensed', 
                CASE 
                    WHEN NEW.status = 'in_progress' THEN 'in_call'
                    ELSE 'available'
                END,
                NEW.id,
                NOW()
            )
            ON CONFLICT (agent_id) DO UPDATE SET
                status = EXCLUDED.status,
                current_session_id = EXCLUDED.current_session_id,
                last_activity_at = EXCLUDED.last_activity_at,
                updated_at = NOW();
        END IF;

        -- Mark buffer call as ended when transferred
        IF NEW.status = 'transferred' AND OLD.status != 'transferred' THEN
            NEW.buffer_call_ended_at = NOW();
            NEW.transferred_by = NEW.buffer_agent_id::VARCHAR;
        END IF;
    END IF;

    -- For INSERT operations
    IF TG_OP = 'INSERT' THEN
        -- Update buffer agent activity when new session starts
        IF NEW.buffer_agent_id IS NOT NULL THEN
            INSERT INTO agent_activity (agent_id, agent_type, status, current_session_id, last_activity_at, session_started_at, total_calls_today)
            VALUES (
                NEW.buffer_agent_id, 
                'buffer', 
                'in_call',
                NEW.id,
                NOW(),
                NOW(),
                1
            )
            ON CONFLICT (agent_id) DO UPDATE SET
                status = 'in_call',
                current_session_id = NEW.id,
                last_activity_at = NOW(),
                session_started_at = NOW(),
                total_calls_today = agent_activity.total_calls_today + 1,
                updated_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic agent activity tracking
DROP TRIGGER IF EXISTS trigger_update_agent_activity ON verification_sessions;
CREATE TRIGGER trigger_update_agent_activity
    BEFORE INSERT OR UPDATE ON verification_sessions
    FOR EACH ROW EXECUTE FUNCTION update_agent_activity();

-- Create function to mark agents as offline after inactivity
CREATE OR REPLACE FUNCTION mark_inactive_agents_offline()
RETURNS void AS $$
BEGIN
    UPDATE agent_activity 
    SET 
        status = 'offline',
        current_session_id = NULL,
        updated_at = NOW()
    WHERE 
        status != 'offline' 
        AND last_activity_at < NOW() - INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint to ensure one activity record per agent
ALTER TABLE agent_activity ADD CONSTRAINT unique_agent_activity UNIQUE (agent_id);

-- Add some sample data for testing (optional)
-- This will be populated automatically by the trigger when sessions are created

-- Create a view for easy agent activity dashboard queries
CREATE OR REPLACE VIEW agent_activity_summary AS
SELECT 
    aa.agent_id,
    p.display_name as agent_name,
    aa.agent_type,
    aa.status,
    aa.current_session_id,
    vs.submission_id,
    l.customer_full_name,
    vs.status as session_status,
    vs.progress_percentage,
    aa.session_started_at,
    aa.last_activity_at,
    aa.total_calls_today,
    aa.total_transfers_today,
    EXTRACT(EPOCH FROM (NOW() - aa.session_started_at))/60 as session_duration_minutes
FROM agent_activity aa
LEFT JOIN profiles p ON aa.agent_id = p.user_id
LEFT JOIN verification_sessions vs ON aa.current_session_id = vs.id
LEFT JOIN leads l ON vs.submission_id = l.submission_id
ORDER BY aa.last_activity_at DESC;
