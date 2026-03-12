-- Migration: Add Storage bucket policies for lead-documents
-- Created: 2026-03-11

-- =====================================================
-- STORAGE BUCKET POLICIES FOR lead-documents
-- =====================================================

-- Allow public (anon) users to upload files to the lead-documents bucket
-- This is needed for customers to upload documents via the upload portal
CREATE POLICY "Allow anon uploads to lead-documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'lead-documents'
);

-- Allow public (anon) users to read files from lead-documents bucket
-- This allows customers to view their uploaded documents
CREATE POLICY "Allow anon read from lead-documents"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'lead-documents'
);

-- Allow authenticated users full access to lead-documents bucket
CREATE POLICY "Allow authenticated full access to lead-documents"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'lead-documents'
)
WITH CHECK (
  bucket_id = 'lead-documents'
);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON POLICY "Allow anon uploads to lead-documents" ON storage.objects IS 'Allows customers to upload documents via anon key';
COMMENT ON POLICY "Allow anon read from lead-documents" ON storage.objects IS 'Allows customers to view their uploaded documents';
COMMENT ON POLICY "Allow authenticated full access to lead-documents" ON storage.objects IS 'Allows staff full access to all documents';
