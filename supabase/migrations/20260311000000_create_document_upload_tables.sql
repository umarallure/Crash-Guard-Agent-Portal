-- Migration: Create document upload tracking tables
-- Created: 2026-03-11

-- =====================================================
-- 1. CREATE lead_document_requests TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id TEXT NOT NULL,
  
  -- Security
  passcode_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Requirements (which documents are required)
  police_report_required BOOLEAN DEFAULT false,
  insurance_document_required BOOLEAN DEFAULT false,
  medical_report_required BOOLEAN DEFAULT false,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Email tracking
  email_sent_at TIMESTAMPTZ,
  email_sent_to TEXT,
  
  CONSTRAINT unique_submission_request UNIQUE(submission_id)
);

-- Indexes for lead_document_requests
CREATE INDEX IF NOT EXISTS idx_lead_document_requests_submission_id ON lead_document_requests(submission_id);
CREATE INDEX IF NOT EXISTS idx_lead_document_requests_status ON lead_document_requests(status);
CREATE INDEX IF NOT EXISTS idx_lead_document_requests_expires_at ON lead_document_requests(expires_at);

-- =====================================================
-- 2. CREATE lead_documents TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id TEXT NOT NULL,
  request_id UUID REFERENCES lead_document_requests(id) ON DELETE SET NULL,
  
  -- Document info
  category TEXT NOT NULL CHECK (category IN ('police_report', 'insurance_document', 'medical_report')),
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  
  -- Storage path in Supabase Storage
  storage_path TEXT NOT NULL,
  bucket_name TEXT DEFAULT 'lead-documents',
  
  -- Metadata
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id),
  
  -- Status
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'verified', 'rejected', 'archived')),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  
  -- Notes
  notes TEXT
);

-- Indexes for lead_documents
CREATE INDEX IF NOT EXISTS idx_lead_documents_submission_id ON lead_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_category ON lead_documents(category);
CREATE INDEX IF NOT EXISTS idx_lead_documents_request_id ON lead_documents(request_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_status ON lead_documents(status);
CREATE INDEX IF NOT EXISTS idx_lead_documents_uploaded_at ON lead_documents(uploaded_at DESC);

-- =====================================================
-- 3. CREATE lead_document_request_events TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_document_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES lead_document_requests(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'request_created',
    'email_sent',
    'passcode_verified',
    'document_uploaded',
    'request_completed',
    'request_expired'
  )),
  
  event_data JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for lead_document_request_events
CREATE INDEX IF NOT EXISTS idx_lead_document_request_events_request_id ON lead_document_request_events(request_id);
CREATE INDEX IF NOT EXISTS idx_lead_document_request_events_created_at ON lead_document_request_events(created_at DESC);

-- =====================================================
-- 4. MODIFY daily_deal_flow TABLE
-- =====================================================
-- Add document tracking fields to daily_deal_flow
ALTER TABLE daily_deal_flow
ADD COLUMN IF NOT EXISTS document_references JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS documents_last_updated TIMESTAMPTZ;

-- Index for JSON queries
CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_document_references ON daily_deal_flow USING GIN (document_references);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on lead_document_requests
ALTER TABLE lead_document_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all requests
CREATE POLICY "Authenticated users can view document requests"
  ON lead_document_requests FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can create requests
CREATE POLICY "Authenticated users can create document requests"
  ON lead_document_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update requests
CREATE POLICY "Authenticated users can update document requests"
  ON lead_document_requests FOR UPDATE
  TO authenticated
  USING (true);

-- Enable RLS on lead_documents
ALTER TABLE lead_documents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all documents
CREATE POLICY "Authenticated users can view documents"
  ON lead_documents FOR SELECT
  TO authenticated
  USING (true);

-- Anyone can insert documents (for customer uploads via anon key)
CREATE POLICY "Anyone can upload documents"
  ON lead_documents FOR INSERT
  TO public
  WITH CHECK (true);

-- Authenticated users can update documents
CREATE POLICY "Authenticated users can update documents"
  ON lead_documents FOR UPDATE
  TO authenticated
  USING (true);

-- Enable RLS on lead_document_request_events
ALTER TABLE lead_document_request_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all events
CREATE POLICY "Authenticated users can view events"
  ON lead_document_request_events FOR SELECT
  TO authenticated
  USING (true);

-- Anyone can insert events (for tracking customer actions)
CREATE POLICY "Anyone can insert events"
  ON lead_document_request_events FOR INSERT
  TO public
  WITH CHECK (true);

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to check if all required documents are uploaded
CREATE OR REPLACE FUNCTION check_required_documents_uploaded(p_submission_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_request RECORD;
  v_has_police BOOLEAN;
  v_has_insurance BOOLEAN;
  v_has_medical BOOLEAN;
BEGIN
  -- Get the request
  SELECT * INTO v_request
  FROM lead_document_requests
  WHERE submission_id = p_submission_id
  AND status != 'expired'
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if required documents exist
  SELECT 
    COUNT(*) FILTER (WHERE category = 'police_report') > 0,
    COUNT(*) FILTER (WHERE category = 'insurance_document') > 0,
    COUNT(*) FILTER (WHERE category = 'medical_report') > 0
  INTO v_has_police, v_has_insurance, v_has_medical
  FROM lead_documents
  WHERE submission_id = p_submission_id
  AND status != 'rejected';
  
  -- Return true if all required documents are present
  RETURN (
    (NOT v_request.police_report_required OR v_has_police) AND
    (NOT v_request.insurance_document_required OR v_has_insurance) AND
    (NOT v_request.medical_report_required OR v_has_medical)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-update request status when documents are uploaded
CREATE OR REPLACE FUNCTION update_document_request_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update request status to 'in_progress' when first document is uploaded
  UPDATE lead_document_requests
  SET 
    status = CASE 
      WHEN status = 'pending' THEN 'in_progress'
      ELSE status
    END,
    updated_at = NOW()
  WHERE submission_id = NEW.submission_id
  AND status = 'pending';
  
  -- Check if all required documents are now uploaded
  IF check_required_documents_uploaded(NEW.submission_id) THEN
    UPDATE lead_document_requests
    SET 
      status = 'completed',
      updated_at = NOW()
    WHERE submission_id = NEW.submission_id
    AND status != 'expired';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update request status
CREATE TRIGGER trigger_update_document_request_status
  AFTER INSERT ON lead_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_document_request_status();

-- =====================================================
-- 7. COMMENTS
-- =====================================================
COMMENT ON TABLE lead_document_requests IS 'Tracks document upload requests sent to customers';
COMMENT ON TABLE lead_documents IS 'Stores metadata about uploaded documents';
COMMENT ON TABLE lead_document_request_events IS 'Audit trail for document request lifecycle';
COMMENT ON COLUMN daily_deal_flow.document_references IS 'JSON array of document references with metadata';
