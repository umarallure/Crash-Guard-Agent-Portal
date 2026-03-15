-- Create lawyer_requirements table
CREATE TYPE sol_period AS ENUM ('6month', '12month', '24month');
CREATE TYPE yes_no_option AS ENUM ('yes', 'no');

CREATE TABLE IF NOT EXISTS lawyer_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attorney_id UUID REFERENCES attorney_profiles(user_id) ON DELETE SET NULL,
  attorney_name TEXT NOT NULL,
  doc_requirement BOOLEAN DEFAULT false,
  sol sol_period,
  states JSONB NOT NULL DEFAULT '[]',
  police_report yes_no_option DEFAULT 'no',
  insurance_report yes_no_option DEFAULT 'no',
  medical_report yes_no_option DEFAULT 'no',
  driver_id yes_no_option DEFAULT 'no',
  did_number VARCHAR(50),
  submission_link VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add RLS policy
ALTER TABLE lawyer_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lawyer_requirements_select" ON lawyer_requirements
  FOR SELECT USING (true);

CREATE POLICY "lawyer_requirements_all" ON lawyer_requirements
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_lawyer_requirements_attorney_id ON lawyer_requirements(attorney_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_lawyer_requirements_updated_at
  BEFORE UPDATE ON lawyer_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE lawyer_requirements IS 'Stores requirement criteria for attorneys';
