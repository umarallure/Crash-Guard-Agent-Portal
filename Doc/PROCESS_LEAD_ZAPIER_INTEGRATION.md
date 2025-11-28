# Process Lead Edge Function - Zapier Integration Guide

## Overview
The `process-lead` Edge Function has been updated to accept lead data directly from Zapier instead of fetching from JotForm API. This allows for more flexible data integration and eliminates the dependency on JotForm.

## API Endpoint
```
POST https://your-project.supabase.co/functions/v1/process-lead
```

## Request Format

### Method
`POST`

### Headers
```
Content-Type: application/json
Authorization: Bearer YOUR_ANON_KEY
```

### Body Parameters
Send all lead data as JSON in the request body. All fields are optional except `submission_id`.

```json
{
  "submission_id": "6362053437892942105",
  "submission_date": "2025-10-13T18:55:43.000Z",
  "customer_full_name": "New test lead",
  "street_address": "111 Pine Street",
  "city": "San Francisco",
  "state": "CA",
  "zip_code": "94111",
  "phone_number": "(111) 111-1111",
  "email": "",
  "birth_state": "ALABAMA",
  "date_of_birth": "2025-10-13",
  "age": null,
  "social_security": "1",
  "driver_license": "textbox_sample18",
  "existing_coverage": "textbox_sample19",
  "previous_applications": "textbox_sample20",
  "height": "textbox_sample21",
  "weight": "textbox_sample22",
  "doctors_name": "textbox_sample23",
  "tobacco_use": "Yes",
  "health_conditions": "health luminex",
  "medications": "health luminex",
  "carrier": "Liberty",
  "product_type": "GI",
  "coverage_amount": 1,
  "monthly_premium": 1,
  "draft_date": "textbox_sample26",
  "future_draft_date": "textbox_sample32",
  "beneficiary_information": "info",
  "institution_name": "textbox_sample29",
  "beneficiary_routing": "textbox_sample30",
  "beneficiary_account": "textbox_sample31",
  "additional_notes": "textbox_sample33",
  "lead_vendor": "test",
  "buffer_agent": "",
  "agent": "info",
  "account_type": "Checking Account",
  "is_callback": false,
  "is_retention_call": false
}
```

## Field Mapping

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `submission_id` | string | ✅ | Unique identifier for the lead |
| `submission_date` | string | ❌ | ISO date string (defaults to current time) |
| `customer_full_name` | string | ❌ | Full name of the customer |
| `street_address` | string | ❌ | Street address |
| `city` | string | ❌ | City |
| `state` | string | ❌ | State |
| `zip_code` | string | ❌ | ZIP code |
| `phone_number` | string | ❌ | Phone number |
| `email` | string | ❌ | Email address |
| `birth_state` | string | ❌ | State of birth |
| `date_of_birth` | string | ❌ | Date of birth (YYYY-MM-DD) |
| `age` | number | ❌ | Age in years |
| `social_security` | string | ❌ | Social security number |
| `driver_license` | string | ❌ | Driver's license number |
| `existing_coverage` | string | ❌ | Existing coverage information |
| `previous_applications` | string | ❌ | Previous application history |
| `height` | string | ❌ | Height |
| `weight` | string | ❌ | Weight |
| `doctors_name` | string | ❌ | Doctor's name |
| `tobacco_use` | string | ❌ | Tobacco usage |
| `health_conditions` | string | ❌ | Health conditions |
| `medications` | string | ❌ | Medications |
| `carrier` | string | ❌ | Insurance carrier |
| `product_type` | string | ❌ | Product type |
| `coverage_amount` | number | ❌ | Coverage amount |
| `monthly_premium` | number | ❌ | Monthly premium |
| `draft_date` | string | ❌ | Draft date |
| `future_draft_date` | string | ❌ | Future draft date |
| `beneficiary_information` | string | ❌ | Beneficiary information |
| `institution_name` | string | ❌ | Institution name |
| `beneficiary_routing` | string | ❌ | Routing number |
| `beneficiary_account` | string | ❌ | Account number |
| `additional_notes` | string | ❌ | Additional notes |
| `lead_vendor` | string | ❌ | Lead vendor/source |
| `buffer_agent` | string | ❌ | Buffer agent assigned |
| `agent` | string | ❌ | Agent assigned |
| `account_type` | string | ❌ | Account type |
| `is_callback` | boolean | ❌ | Whether this is a callback (defaults to false) |
| `is_retention_call` | boolean | ❌ | Whether this is a retention call (defaults to false) |

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "leadId": "844d3532-e7e8-401d-b270-06ab7331aaf2",
  "submissionId": "6362053437892942105",
  "message": "Lead processed and stored successfully"
}
```

### Duplicate Lead Response (200)
```json
{
  "success": true,
  "message": "Lead already processed",
  "leadId": "existing-lead-id",
  "submissionId": "6362053437892942105"
}
```

### Error Response (500)
```json
{
  "error": "Error message description"
}
```

## Zapier Setup

### 1. Create a Zap
1. **Trigger**: Choose your data source (e.g., Webhook, Google Sheets, etc.)
2. **Action**: Code by Zapier → Run JavaScript

### 2. Configure Code Step
```javascript
// Input Data (from previous step)
const inputData = inputData; // Your data from trigger

// Transform data to match expected format
const leadData = {
  submission_id: inputData.submission_id || inputData.id,
  customer_full_name: `${inputData.first_name || ''} ${inputData.last_name || ''}`.trim(),
  phone_number: inputData.phone,
  email: inputData.email,
  // ... map all your fields
  is_callback: false,
  is_retention_call: false
};

// Make HTTP request
const response = await fetch('https://your-project.supabase.co/functions/v1/process-lead', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  },
  body: JSON.stringify(leadData)
});

const result = await response.json();
output = result;
```

### 3. Test the Zap
- Send test data through your Zap
- Verify the lead appears in your Supabase `leads` table
- Check that all fields are populated correctly

## Data Type Handling

### Automatic Conversions
- **Numbers**: `coverage_amount`, `monthly_premium`, `age` are automatically converted to numbers
- **Booleans**: `is_callback`, `is_retention_call` accept both string `"true"/"false"` and boolean `true/false`
- **Dates**: `date_of_birth` should be in YYYY-MM-DD format
- **Strings**: All other fields are stored as strings

### Default Values
- Empty strings for missing text fields
- `null` for missing numbers/dates
- `false` for boolean flags
- Current timestamp for `submission_date` if not provided

## Error Handling

### Validation
- `submission_id` is required
- Function checks for duplicate leads before insertion
- Returns existing lead ID if already processed

### Error Cases
- Missing `submission_id`: Returns 500 with error message
- Database errors: Logged and returned as 500 error
- Invalid data types: May cause insertion errors (check Supabase logs)

## Migration from JotForm

### Before (JotForm Integration)
```javascript
// Old way - required JotForm API
{
  "submissionId": "jotform_id",
  "formId": "optional_form_id",
  "center": "optional_vendor"
}
```

### After (Direct Data)
```javascript
// New way - all data in body
{
  "submission_id": "your_id",
  "customer_full_name": "John Doe",
  "phone_number": "(555) 123-4567",
  // ... all other fields
}
```

## Benefits of This Approach

1. **Flexibility**: Accept data from any source, not just JotForm
2. **Performance**: No external API calls
3. **Reliability**: No dependency on JotForm API availability
4. **Control**: Full control over data mapping and validation
5. **Cost**: No JotForm API rate limits or costs

## Testing

### Test with cURL
```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/process-lead' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{
    "submission_id": "test123",
    "customer_full_name": "Test User",
    "phone_number": "(555) 123-4567",
    "email": "test@example.com",
    "is_retention_call": true
  }'
```

### Verify in Database
```sql
SELECT * FROM leads WHERE submission_id = 'test123';
```

Expected result should show all provided fields with correct data types and the retention flag set to true.

---

**Last Updated:** October 18, 2025
**Function Version:** Direct Data Input (No JotForm API)
**Status:** Ready for Zapier Integration