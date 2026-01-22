import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RequestBody = {
  submission_id: string;
  call_source: string;
  buffer_agent?: string | null;
  agent?: string | null;
  licensed_agent_account?: string | null;
  status?: string | null;
  call_result?: string | null;
  carrier?: string | null;
  product_type?: string | null;
  draft_date?: string | null;
  monthly_premium?: number | null;
  face_amount?: number | null;
  notes?: string | null;
  policy_number?: string | null;
  carrier_audit?: string | null;
  product_type_carrier?: string | null;
  level_or_gi?: string | null;
  from_callback?: boolean | null;
  is_callback?: boolean | null;
  create_new_entry?: boolean | null;
  original_submission_id?: string | null;
  application_submitted?: boolean | null;
  sent_to_underwriting?: boolean | null;
  lead_vendor?: string | null;
  is_retention_call?: boolean | null;
  carrier_attempted_1?: string | null;
  carrier_attempted_2?: string | null;
  carrier_attempted_3?: string | null;
  accident_date?: string | null;
  prior_attorney_involved?: boolean | null;
  prior_attorney_details?: string | null;
  medical_attention?: string | null;
  police_attended?: boolean | null;
  accident_location?: string | null;
  accident_scenario?: string | null;
  insured?: boolean | null;
  injuries?: string | null;
  vehicle_registration?: string | null;
  insurance_company?: string | null;
  third_party_vehicle_registration?: string | null;
  other_party_admit_fault?: boolean | null;
  passengers_count?: number | null;
  assigned_attorney_id?: string | null;
};
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// EST timezone utility functions
const isDST = (date)=>{
  const year = date.getFullYear();
  // Second Sunday in March
  const marchSecondSunday = new Date(year, 2, 1);
  marchSecondSunday.setDate(1 + (7 - marchSecondSunday.getDay()) + 7);
  // First Sunday in November  
  const novemberFirstSunday = new Date(year, 10, 1);
  novemberFirstSunday.setDate(1 + (7 - novemberFirstSunday.getDay()) % 7);
  return date >= marchSecondSunday && date < novemberFirstSunday;
};
const getTodayDateEST = ()=>{
  const now = new Date();
  const estOffset = isDST(now) ? -4 : -5; // DST handling
  const estDate = new Date(now.getTime() + estOffset * 60 * 60 * 1000);
  return estDate.toISOString().split('T')[0];
};
const getCurrentTimestampEST = ()=>{
  const now = new Date();
  const estOffset = isDST(now) ? -4 : -5; // DST handling
  const estDate = new Date(now.getTime() + estOffset * 60 * 60 * 1000);
  return estDate.toISOString();
};
// Function to generate new submission ID for callback entries
const generateCallbackSubmissionId = (originalSubmissionId)=>{
  const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `CB${randomDigits}${originalSubmissionId}`;
};
// Complete status mapping function (matches CallResultForm statusOptions)
const mapStatusToSheetValue = (userSelectedStatus)=>{
  const statusMap = {
    // New statuses map to themselves
    "Incomplete Transfer": "Incomplete Transfer",
    "Returned To Center - DQ": "Returned To Center - DQ",
    "Previously Sold BPO": "Previously Sold BPO",
    "Needs BPO Callback": "Needs BPO Callback",
    "Application Withdrawn": "Application Withdrawn",
    "Pending Information": "Pending Information",
    // Legacy mappings for backward compatibility
    "Needs callback": "Needs BPO Callback",
    "Call Never Sent": "Incomplete Transfer",
    "Not Interested": "Returned To Center - DQ",
    "DQ": "DQ'd Can't be sold",
    "⁠DQ": "DQ'd Can't be sold",
    "Future Submission Date": "Application Withdrawn",
    "Disconnected": "Incomplete Transfer",
    "Disconnected - Never Retransferred": "Incomplete Transfer",
    "Fulfilled carrier requirements": "Fulfilled carrier requirements",
    "Updated Banking/draft date": "Pending Failed Payment Fix",
    "Chargeback DQ": "Chargeback DQ",
    "GI - Currently DQ": "Returned To Center - DQ"
  };
  // Clean the status to handle Unicode characters
  const cleanStatus = userSelectedStatus?.trim().replace(/⁠/g, ''); // Remove word joiner
  const mappedStatus = statusMap[cleanStatus] || statusMap[userSelectedStatus] || userSelectedStatus;
  console.log(`Status mapping: "${userSelectedStatus}" -> "${mappedStatus}"`);
  return mappedStatus;
};
// Function to determine final status based on application submission
const determineFinalStatus = (applicationSubmitted, sentToUnderwriting, originalStatus)=>{
  let finalStatus = "";
  if (applicationSubmitted === true) {
    // Preserve provided status (e.g., qualified stage) exactly as sent
    finalStatus = originalStatus || 'Pending Approval';
  } else if (applicationSubmitted === false) {
    finalStatus = mapStatusToSheetValue(originalStatus || 'Not Submitted');
  } else {
    // Handle undefined/null application_submitted
    finalStatus = mapStatusToSheetValue(originalStatus || 'Not Submitted');
  }
  console.log(`Final status determination:`, {
    applicationSubmitted,
    sentToUnderwriting,
    originalStatus,
    finalStatus
  });
  return finalStatus;
};
// Function to determine call result status
const determineCallResultStatus = (applicationSubmitted)=>{
  if (applicationSubmitted === true) {
    return "Qualified";
  }
  if (applicationSubmitted === false) {
    return "Not Qualified";
  }
  return "";
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  let requestBody: RequestBody | null = null;
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get parameters from request body
    requestBody = await req.json();
    const body = requestBody as RequestBody;
    const {
      submission_id,
      call_source,
      buffer_agent = null,
      agent = null,
      licensed_agent_account = null,
      status = null,
      call_result = null,
      carrier = null,
      product_type = null,
      draft_date = null,
      monthly_premium = null,
      face_amount = null,
      notes = null,
      policy_number = null,
      carrier_audit = null,
      product_type_carrier = null,
      level_or_gi = null,
      from_callback = null,
      is_callback = false,
      create_new_entry = false,
      original_submission_id = null,
      application_submitted = null,
      sent_to_underwriting = null,
      lead_vendor = null,
      is_retention_call = false,
      carrier_attempted_1 = null,
      carrier_attempted_2 = null,
      carrier_attempted_3 = null,
      accident_date = null,
      prior_attorney_involved = null,
      prior_attorney_details = null,
      medical_attention = null,
      police_attended = null,
      accident_location = null,
      accident_scenario = null,
      insured = null,
      injuries = null,
      vehicle_registration = null,
      insurance_company = null,
      third_party_vehicle_registration = null,
      other_party_admit_fault = null,
      passengers_count = null,
      assigned_attorney_id = null
    } = body;
    // Validate required fields
    if (!submission_id) {
      throw new Error('Missing required field: submission_id');
    }
    if (!call_source) {
      throw new Error('Missing required field: call_source');
    }
    console.log('Updating daily deal flow for submission:', submission_id, 'call source:', call_source);
    // Get today's date in EST YYYY-MM-DD format
    const todayDate = getTodayDateEST();
    // Fetch lead data for insertions
    const { data: leadData, error: leadError } = await supabase.from('leads').select('customer_full_name, phone_number, lead_vendor').eq('submission_id', submission_id).single();
    if (leadError && call_source !== 'First Time Transfer') {
      console.error('Error fetching lead data:', leadError);
      throw new Error('Failed to fetch lead data');
    }
    let operation = '';
    let result = null;
    let finalSubmissionId = submission_id;
    // Determine the final status using our mapping functions
    const finalStatus = determineFinalStatus(application_submitted, sent_to_underwriting, status);
    const callResultStatus = call_result || (
      sent_to_underwriting === true
        ? "Underwriting"
        : application_submitted === true
          ? "Qualified"
          : application_submitted === false
            ? "Not Qualified"
            : ""
    );
    if (call_source === 'First Time Transfer') {
      // Check existing entry and decide whether to create new or update
      const { data: existingEntry, error: existingError } = await supabase.from('daily_deal_flow').select('date').eq('submission_id', submission_id).order('created_at', {
        ascending: false
      }).limit(1).maybeSingle();
      let shouldCreateNew = false;
      if (existingEntry && existingEntry.date && existingEntry.date !== todayDate) {
        finalSubmissionId = generateCallbackSubmissionId(submission_id);
        shouldCreateNew = true;
        console.log(`Creating new daily deal flow entry for First Time Transfer: ${submission_id} -> ${finalSubmissionId}`);
      }
      if (shouldCreateNew) {
        // Create new entry with today's date
        const { data: leadData, error: leadError } = await supabase.from('leads').select('customer_full_name, phone_number, lead_vendor').eq('submission_id', submission_id).single();
        if (leadError) {
          console.error('Error fetching lead data for new entry:', leadError);
          throw new Error('Failed to fetch lead data for new entry');
        }
        const { data, error } = await supabase.from('daily_deal_flow').insert({
          submission_id: finalSubmissionId,
          lead_vendor: leadData?.lead_vendor,
          insured_name: leadData?.customer_full_name,
          client_phone_number: leadData?.phone_number,
          date: todayDate,
          buffer_agent,
          agent,
          licensed_agent_account,
          status: finalStatus,
          call_result: callResultStatus,
          carrier,
          product_type,
          draft_date,
          monthly_premium,
          face_amount,
          notes,
          policy_number,
          carrier_audit,
          product_type_carrier,
          level_or_gi,
          from_callback,
          is_callback,
          is_retention_call,
          assigned_attorney_id
        }).select().single();
        if (error) {
          console.error('Error inserting new daily deal flow entry:', error);
          throw new Error(`Failed to create new entry: ${error.message}`);
        }
        operation = 'inserted';
        result = data;
      } else {
        if (existingEntry) {
          // Update the most recent existing entry
          const { data: mostRecentEntry, error: fetchError } = await supabase.from('daily_deal_flow').select('id').eq('submission_id', submission_id).order('created_at', {
            ascending: false
          }).limit(1).single();
          if (fetchError) {
            console.error('Error finding most recent entry:', fetchError);
            throw new Error(`Failed to find existing entry: ${fetchError.message}`);
          }
          const { data, error } = await supabase.from('daily_deal_flow').update({
            buffer_agent,
            agent,
            licensed_agent_account,
            status: finalStatus,
            call_result: callResultStatus,
            carrier,
            product_type,
            draft_date,
            monthly_premium,
            face_amount,
            notes,
            policy_number,
            carrier_attempted_1,
            carrier_attempted_2,
            carrier_attempted_3,
            accident_date,
            prior_attorney_involved,
            prior_attorney_details,
            medical_attention,
            police_attended,
            accident_location,
            accident_scenario,
            insured,
            injuries,
            vehicle_registration,
            insurance_company,
            third_party_vehicle_registration,
            other_party_admit_fault,
            passengers_count,
            carrier_audit,
            product_type_carrier,
            level_or_gi,
            from_callback,
            is_callback,
            is_retention_call,
            assigned_attorney_id,
            updated_at: getCurrentTimestampEST()
          }).eq('id', mostRecentEntry.id).select().single();
          if (error) {
            console.error('Error updating daily deal flow:', error);
            throw new Error(`Failed to update entry: ${error.message}`);
          }
          operation = 'updated';
          result = data;
        } else {
          // Create new entry
          const { data, error } = await supabase.from('daily_deal_flow').insert({
            submission_id,
            lead_vendor: leadData?.lead_vendor,
            insured_name: leadData?.customer_full_name,
            client_phone_number: leadData?.phone_number,
            date: todayDate,
            buffer_agent,
            agent,
            licensed_agent_account,
            status: finalStatus,
            call_result: callResultStatus,
            carrier,
            product_type,
            draft_date,
            monthly_premium,
            face_amount,
            notes,
            policy_number,
            carrier_audit,
            product_type_carrier,
            level_or_gi,
            from_callback,
            is_callback,
            is_retention_call,
            carrier_attempted_1,
            carrier_attempted_2,
            carrier_attempted_3,
            accident_date,
            prior_attorney_involved,
            prior_attorney_details,
            medical_attention,
            police_attended,
            accident_location,
            accident_scenario,
            insured,
            injuries,
            vehicle_registration,
            insurance_company,
            third_party_vehicle_registration,
            other_party_admit_fault,
            passengers_count,
            assigned_attorney_id
          }).select().single();
          if (error) {
            console.error('Error inserting new daily deal flow entry:', error);
            throw new Error(`Failed to create new entry: ${error.message}`);
          }
          operation = 'inserted';
          result = data;
        }
      }
    }
    else {
      // Handle other call sources (Agent Callback, etc.)
      // Check if entry exists for today
      const { data: existingEntry, error: existingError } = await supabase.from('daily_deal_flow').select('id, date').eq('submission_id', submission_id).eq('date', todayDate).maybeSingle();
      if (existingError) {
        console.error('Error checking existing entry:', existingError);
        throw new Error('Failed to check existing entry');
      }
      if (existingEntry) {
        // Update existing entry for today
        const { data, error } = await supabase.from('daily_deal_flow').update({
          buffer_agent,
          agent,
          licensed_agent_account,
          status: finalStatus,
          call_result: callResultStatus,
          carrier,
          product_type,
          draft_date,
          monthly_premium,
          face_amount,
          notes,
          policy_number,
          carrier_audit,
          product_type_carrier,
          level_or_gi,
          from_callback,
          is_callback,
          is_retention_call,
          carrier_attempted_1,
          carrier_attempted_2,
          carrier_attempted_3,
          accident_date,
          prior_attorney_involved,
          prior_attorney_details,
          medical_attention,
          police_attended,
          accident_location,
          accident_scenario,
          insured,
          injuries,
          vehicle_registration,
          insurance_company,
          third_party_vehicle_registration,
          other_party_admit_fault,
          passengers_count,
          assigned_attorney_id,
          updated_at: getCurrentTimestampEST()
        }).eq('id', existingEntry.id).select().single();
        if (error) {
          console.error('Error updating daily deal flow:', error);
          throw new Error(`Failed to update entry: ${error.message}`);
        }
        operation = 'updated';
        result = data;
      } else {
        // Create new entry for today
        const { data, error } = await supabase.from('daily_deal_flow').insert({
          submission_id,
          lead_vendor: leadData?.lead_vendor,
          insured_name: leadData?.customer_full_name,
          client_phone_number: leadData?.phone_number,
          date: todayDate,
          buffer_agent,
          agent,
          licensed_agent_account,
          status: finalStatus,
          call_result: callResultStatus,
          carrier,
          product_type,
          draft_date,
          monthly_premium,
          face_amount,
          notes,
          policy_number,
          carrier_audit,
          product_type_carrier,
          level_or_gi,
          from_callback,
          is_callback,
          is_retention_call,
          carrier_attempted_1,
          carrier_attempted_2,
          carrier_attempted_3,
          accident_date,
          prior_attorney_involved,
          prior_attorney_details,
          medical_attention,
          police_attended,
          accident_location,
          accident_scenario,
          insured,
          injuries,
          vehicle_registration,
          insurance_company,
          third_party_vehicle_registration,
          other_party_admit_fault,
          passengers_count,
          assigned_attorney_id
        }).select().single();
        if (error) {
          console.error('Error inserting new daily deal flow entry:', error);
          throw new Error(`Failed to create new entry: ${error.message}`);
        }
        operation = 'inserted';
        result = data;
      }
    }
    // Update verification session status to completed if one exists
    try {
      const { error: sessionUpdateError } = await supabase.from('verification_sessions').update({
        status: 'completed'
      }).eq('submission_id', submission_id).in('status', [
        'pending',
        'in_progress',
        'ready_for_transfer',
        'transferred'
      ]);
      if (sessionUpdateError) {
        console.error("Error updating verification session:", sessionUpdateError);
      // Don't fail the entire process if session update fails
      } else {
        console.log("Verification session marked as completed");
      }
    } catch (sessionError) {
      console.error("Verification session update failed:", sessionError);
    // Don't fail the entire process if session update fails
    }
    // Update lead vendor in leads table if provided and application is submitted
    if (application_submitted === true && lead_vendor) {
      try {
        const { error: leadUpdateError } = await supabase.from("leads").update({
          lead_vendor
        }).eq("submission_id", submission_id);
        if (leadUpdateError) {
          console.error("Error updating lead vendor:", leadUpdateError);
        // Don't fail the entire process if lead vendor update fails
        } else {
          console.log("Lead vendor updated successfully");
        }
      } catch (leadVendorError) {
        console.error("Lead vendor update failed:", leadVendorError);
      // Don't fail the entire process if lead vendor update fails
      }
    }
    // Update Google Sheets based on Call Source selection
    try {
      console.log('Updating Google Sheets for submission:', submission_id);
      // Determine which sheet to update based on call source
      let sheetName = '';
      let sheetId = '';
      switch(call_source){
        case 'Agent Callback':
          sheetName = 'Agent Callback';
          sheetId = Deno.env.get('GOOGLE_SHEETS_AGENT_CALLBACK_ID') ?? '';
          break;
        case 'First Time Transfer':
          sheetName = 'Daily Deal Flow';
          sheetId = Deno.env.get('GOOGLE_SHEETS_DAILY_DEAL_FLOW_ID') ?? '';
          break;
        default:
          console.log('No Google Sheets update needed for call source:', call_source);
          break;
      }
      if (sheetName && sheetId) {
        const sheetsResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/google-sheets-update`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sheetId,
            sheetName,
            submission_id: finalSubmissionId,
            lead_vendor: leadData?.lead_vendor,
            insured_name: leadData?.customer_full_name,
            client_phone_number: leadData?.phone_number,
            buffer_agent,
            agent,
            licensed_agent_account,
            status: finalStatus,
            call_result: callResultStatus,
            carrier,
            product_type,
            draft_date,
            monthly_premium,
            face_amount,
            notes,
            policy_number,
            carrier_audit,
            product_type_carrier,
            level_or_gi,
            from_callback
          })
        });
        if (!sheetsResponse.ok) {
          console.error('Google Sheets update failed:', await sheetsResponse.text());
        } else {
          console.log('Google Sheets updated successfully');
        }
      }
    } catch (sheetsError) {
      console.error('Google Sheets update error:', sheetsError);
    // Don't fail the entire process if Google Sheets update fails
    }
    // Send Slack notification for submitted applications
    if (application_submitted === true) {
      try {
        console.log('Sending Slack notification for submitted application');
        const slackResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/slack-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            submission_id: finalSubmissionId,
            customer_name: leadData?.customer_full_name,
            lead_vendor: leadData?.lead_vendor,
            agent,
            licensed_agent_account,
            carrier,
            product_type,
            monthly_premium,
            coverage_amount: face_amount,
            draft_date,
            sent_to_underwriting,
            call_source
          })
        });
        if (!slackResponse.ok) {
          console.error('Slack notification failed:', await slackResponse.text());
        } else {
          console.log('Slack notification sent successfully');
        }
      } catch (slackError) {
        console.error('Slack notification error:', slackError);
      // Don't fail the entire process if Slack notification fails
      }
    }
    // Send center notification for NOT submitted applications
    if (application_submitted === false) {
      try {
        console.log('Sending center notification for not submitted application');
        const centerResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/center-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            submission_id: finalSubmissionId,
            customer_name: leadData?.customer_full_name,
            lead_vendor: leadData?.lead_vendor,
            status: finalStatus,
            call_source,
            notes
          })
        });
        if (!centerResponse.ok) {
          console.error('Center notification failed:', await centerResponse.text());
        } else {
          console.log('Center notification sent successfully');
        }
      } catch (centerError) {
        console.error('Center notification error:', centerError);
      // Don't fail the entire process if center notification fails
      }
    }
    // Send disconnected call notification for disconnected statuses
    if (application_submitted === false && (status === 'Disconnected' || status === 'Disconnected - Never Retransferred')) {
      try {
        console.log('Sending disconnected call notification');
        const disconnectedResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/disconnected-call-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            submission_id: finalSubmissionId,
            customer_name: leadData?.customer_full_name,
            lead_vendor: leadData?.lead_vendor,
            agent,
            call_source
          })
        });
        if (!disconnectedResponse.ok) {
          console.error('Disconnected call notification failed:', await disconnectedResponse.text());
        } else {
          console.log('Disconnected call notification sent successfully');
        }
      } catch (disconnectedError) {
        console.error('Disconnected call notification error:', disconnectedError);
      // Don't fail the entire process if disconnected notification fails
      }
    }
    return new Response(JSON.stringify({
      success: true,
      operation,
      submission_id: finalSubmissionId,
      data: result
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
