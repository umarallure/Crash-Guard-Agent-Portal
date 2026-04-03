-- Allow lead documents to be stored in an additional catch-all category.
ALTER TABLE lead_documents
DROP CONSTRAINT IF EXISTS lead_documents_category_check;

ALTER TABLE lead_documents
ADD CONSTRAINT lead_documents_category_check
CHECK (category IN ('police_report', 'insurance_document', 'medical_report', 'other_document'));
