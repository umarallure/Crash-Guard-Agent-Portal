import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle, XCircle, Loader2, Shield, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getTodayDateEST, getCurrentTimestampEST, formatDateESTLocale } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { logCallUpdate, getLeadInfo } from "@/lib/callLogging";
import { AppFixTaskTypeSelector } from "@/components/AppFixTaskTypeSelector";
import { useCenters } from "@/hooks/useCenters";

interface CallResultFormProps {
  submissionId: string;
  customerName?: string;
  onSuccess?: () => void;
}

const statusOptions = [
  "Incomplete Transfer",
  "Returned To Center - DQ",
  "Previously Sold BPO",
  "Needs BPO Callback",
  "Application Withdrawn",
  "Pending Information"
];

const carrierOptions = [
  "Liberty",
  "SBLI",
  "Corebridge",
  "MOH",
  "Transamerica",
  "RNA",
  "AMAM",
  "GTL",
  "Aetna",
  "Americo",
  "CICA",
  "N/A"
];

const productTypeOptions = [
  "Preferred",
  "Standard",
  "Graded",
  "Modified",
  "GI",
  "Immediate",
  "Level",
  "ROP",
  "N/A"
];

const bufferAgentOptions = [
  "Justine",
  "Nicole Mejia",
  "Laiza Batain",
  "Aqib Afridi",
  "Qasim Raja",
  "Noah Akins",
  "Hussain Khan",
  "N/A",
];

const agentOptions = [
  "Claudia",
  "Lydia",
  "Zack",
  "Tatumn",
  "Benjamin",
  "N/A",
  "Kaye",
  "Isaac",
  "Abdul",
  "Nicole Mejia",
  "Precy Lou",
  "Laiza Batain"
];

const licensedAccountOptions = [
  "Claudia",
  "Lydia",
  "Isaac",
  "Abdul",
  "Trinity",
  "Benjamin",
  "Tatumn",
  "Noah",
  "N/A"
];

const incompleteTransferReasonOptions = [
  "Call Disconnected",
  "Technical Issues",
  "Customer Unavailable",
  "Never Connected",
  "Other"
];

const returnedToCenterDQReasonOptions = [
  "Multiple Chargebacks",
  "Not Cognitively Functional",
  "Transferred Many Times Without Success",
  "TCPA",
  "Decline All Available Carriers",
  "Already a DQ in our System",
  "Other"
];

const previouslySoldBPOReasonOptions = [
  "Already Has Active Policy",
  "Recently Purchased Coverage",
  "Duplicate Lead",
  "Other"
];

const needsBPOCallbackReasonOptions = [
  "Banking Information Invalid",
  "Existing Policy - Draft Hasn't Passed",
  "Need Additional Information",
  "Customer Requested Callback",
  "Other"
];

const applicationWithdrawnReasonOptions = [
  "Customer Changed Mind",
  "Found Better Rate",
  "No Longer Interested",
  "Financial Concerns",
  "Other"
];

const pendingInformationReasonOptions = [
  "Waiting on Documents",
  "Pending Medical Records",
  "Awaiting Customer Response",
  "Additional Verification Needed",
  "Other"
];

const dqReasonOptions = [
  "Multiple Chargebacks",
  "Chargeback DQ",
  "Not Cognatively Functional",
  "Transferred Many Times Without Success",
  "TCPA",
  "Decline All Available Carriers",
  "Already a DQ in our System",
  "Other"
];

const needsCallbackReasonOptions = [
  "Banking information invalid",
  "Existing Policy - Draft hasn't passed",
  "Other"
];

const notInterestedReasonOptions = [
  "Existing coverage - Not Looking for More",
  "Other"
];

const futureSubmissionReasonOptions = [
  "Future Submission Date - Draft Date Too Far Away",
  "Future Submission Date - Birthday is before draft date",
  "Other"
];

const updatedBankingDraftReasonOptions = [
  "Updated Banking and draft date",
  "Updated draft w/ same banking information"
];

const fulfilledCarrierReasonOptions = [
  "Fulfilled carrier requirements"
];

const getReasonOptions = (status: string) => {
  switch (status) {
    case "Incomplete Transfer":
      return incompleteTransferReasonOptions;
    case "Returned To Center - DQ":
      return returnedToCenterDQReasonOptions;
    case "Previously Sold BPO":
      return previouslySoldBPOReasonOptions;
    case "Needs BPO Callback":
      return needsBPOCallbackReasonOptions;
    case "Application Withdrawn":
      return applicationWithdrawnReasonOptions;
    case "Pending Information":
      return pendingInformationReasonOptions;
    case "DQ":
    case "Chargeback DQ":
      return dqReasonOptions;
    case "Needs callback":
      return needsCallbackReasonOptions;
    case "Not Interested":
      return notInterestedReasonOptions;
    case "Future Submission Date":
      return futureSubmissionReasonOptions;
    case "Updated Banking/draft date":
      return updatedBankingDraftReasonOptions;
    case "Fulfilled carrier requirements":
      return fulfilledCarrierReasonOptions;
    default:
      return [];
  }
};

// Status mapping function for Daily Deal Flow sheet
const mapStatusToSheetValue = (userSelectedStatus: string) => {
  const statusMap: { [key: string]: string } = {
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
    "Fulfilled carrier requirements": "Pending Approval",
    "Updated Banking/draft date":"Pending Failed Payment Fix",
    "DQ": "DQ'd Can't be sold",
    "Chargeback DQ": "DQ'd Can't be sold",
    "Future Submission Date": "Application Withdrawn",
    "Disconnected": "Incomplete Transfer",
    "Disconnected - Never Retransferred": "Incomplete Transfer",
    "GI - Currently DQ": "Returned To Center - DQ"
  };
  return statusMap[userSelectedStatus] || userSelectedStatus;
};

const getNoteText = (status: string, reason: string, clientName: string = "[Client Name]", newDraftDate?: Date) => {
  const statusReasonMapping: { [status: string]: { [reason: string]: string } } = {
    "DQ": {
      "Multiple Chargebacks": `${clientName} has been DQ'd. They have caused multiple chargebacks in our agency, so we cannot submit another application for them`,
      "Not Cognatively Functional": `${clientName} has been DQ'd. They are not mentally able to make financial decisions. We cannot submit an application for them`,
      "Transferred Many Times Without Success": `We have spoken with ${clientName} more than 5 times and have not been able to successfully submit an application. We should move on from this caller`,
      "TCPA": `${clientName} IS A TCPA LITIGATOR. PLEASE REMOVE FROM YOUR SYSTEM IMMEDIATELY`,
      "Decline All Available Carriers": `${clientName} was denied through all carriers they are elligible to apply for`,
      "Already a DQ in our System": `${clientName} is already a DQ in our system. We will not accept this caller again.`,
      "Other": "Custom message if none of the above fit"
    },
    "Chargeback DQ": {
      "Chargeback DQ": `${clientName} has caused multiple chargebacks. We will not accept this caller into our agency`,
      "Multiple Chargebacks": `${clientName} has been DQ'd. They have caused multiple chargebacks in our agency, so we cannot submit another application for them`,
      "Not Cognatively Functional": `${clientName} has been DQ'd. They are not mentally able to make financial decisions. We cannot submit an application for them`,
      "Transferred Many Times Without Success": `We have spoken with ${clientName} more than 5 times and have not been able to successfully submit an application. We should move on from this caller`,
      "TCPA": `${clientName} IS A TCPA LITIGATOR. PLEASE REMOVE FROM YOUR SYSTEM IMMEDIATELY`,
      "Decline All Available Carriers": `${clientName} was denied through all carriers they are elligible to apply for`,
      "Already a DQ in our System": `${clientName} is already a DQ in our system. We will not accept this caller again.`,
      "Other": "Custom message if none of the above fit"
    },
    "Needs callback": {
      "Banking information invalid": `The banking information for ${clientName} could not be validated. We need to call them back and verify a new form of payment`,
      "Existing Policy - Draft hasn't passed": `${clientName} has an existing policy with an initial draft date that hasn't passed. We can call them [a week after entered draft date] to see if they want additional coverage`,
      "Other": "Custom message if none of the above fit"
    },
    "Not Interested": {
      "Existing coverage - Not Looking for More": `${clientName} has exsiting coverage and cannot afford additional coverage`,
      "Other": "Custom message if none of the above fit"
    },
    "Future Submission Date": {
      "Future Submission Date - Draft Date Too Far Away": `The application for ${clientName} has been filled out and signed, but we cannot submit until [Submission date] because the draft date is too far out`,
      "Future Submission Date - Birthday is before draft date": `${clientName}'s birthday is before their initial draft, so we need to call them on [the day after client DOB] to requote and submit application`,
      "Other": "Custom message if none of the above fit"
    },
    "Updated Banking/draft date": {
      "Updated Banking and draft date": newDraftDate ? `New Draft date ${newDraftDate.toLocaleDateString()}` : "New Draft date [Please select a date]",
      "Updated draft w/ same banking information": newDraftDate ? `New Draft date ${newDraftDate.toLocaleDateString()}` : "New Draft date [Please select a date]"
    }
  };
  
  return statusReasonMapping[status]?.[reason] || "";
};

//  Function to generate new submission ID for callback entries with CBB prefix
const generateCallbackSubmissionId = (originalSubmissionId: string): string => {
  const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `CBB${randomDigits}${originalSubmissionId}`;
};

// Function to check if entry exists and get its date
const checkExistingDailyDealFlowEntry = async (submissionId: string) => {
  try {
    const { data, error } = await supabase
      .from('daily_deal_flow')
      .select('date')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error checking existing entry:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in checkExistingDailyDealFlowEntry:', error);
    return null;
  }
};

// Using centralized EST utilities from dateUtils

// Function to generate structured notes for submitted applications
const generateSubmittedApplicationNotes = (
  accidentInfo?: {
    accidentDate?: Date;
    accidentLocation?: string;
    accidentScenario?: string;
    injuries?: string;
    medicalAttention?: string;
    policeAttended?: boolean | null;
    insured?: boolean | null;
    vehicleRegistration?: string;
    insuranceCompany?: string;
    thirdPartyVehicleRegistration?: string;
    otherPartyAdmitFault?: boolean | null;
    passengersCount?: string;
    priorAttorneyInvolved?: boolean | null;
    priorAttorneyDetails?: string;
  }
) => {
  const parts = [];

  // Add accident information if provided
  if (accidentInfo) {
    const accidentParts = [];
    
    if (accidentInfo.accidentDate) {
      accidentParts.push(`Accident Date: ${accidentInfo.accidentDate.toLocaleDateString('en-US')}`);
    }
    
    if (accidentInfo.accidentLocation) {
      accidentParts.push(`Location: ${accidentInfo.accidentLocation}`);
    }
    
    if (accidentInfo.accidentScenario) {
      accidentParts.push(`Scenario: ${accidentInfo.accidentScenario}`);
    }
    
    if (accidentInfo.injuries) {
      accidentParts.push(`Injuries: ${accidentInfo.injuries}`);
    }
    
    if (accidentInfo.medicalAttention) {
      accidentParts.push(`Medical Attention: ${accidentInfo.medicalAttention}`);
    }
    
    if (accidentInfo.policeAttended !== null) {
      accidentParts.push(`Police Attended: ${accidentInfo.policeAttended ? 'Yes' : 'No'}`);
    }
    
    if (accidentInfo.insured !== null) {
      accidentParts.push(`Insured: ${accidentInfo.insured ? 'Yes' : 'No'}`);
    }
    
    if (accidentInfo.vehicleRegistration) {
      accidentParts.push(`Vehicle Registration: ${accidentInfo.vehicleRegistration}`);
    }
    
    if (accidentInfo.insuranceCompany) {
      accidentParts.push(`Insurance Company: ${accidentInfo.insuranceCompany}`);
    }
    
    if (accidentInfo.thirdPartyVehicleRegistration) {
      accidentParts.push(`Third Party Vehicle: ${accidentInfo.thirdPartyVehicleRegistration}`);
    }
    
    if (accidentInfo.otherPartyAdmitFault !== null) {
      accidentParts.push(`Other Party Admitted Fault: ${accidentInfo.otherPartyAdmitFault ? 'Yes' : 'No'}`);
    }
    
    if (accidentInfo.passengersCount) {
      accidentParts.push(`Passengers: ${accidentInfo.passengersCount}`);
    }
    
    if (accidentInfo.priorAttorneyInvolved !== null) {
      accidentParts.push(`Prior Attorney Involved: ${accidentInfo.priorAttorneyInvolved ? 'Yes' : 'No'}`);
    }
    
    if (accidentInfo.priorAttorneyDetails) {
      accidentParts.push(`Attorney Details: ${accidentInfo.priorAttorneyDetails}`);
    }
    
    if (accidentParts.length > 0) {
      parts.push(`Accident/Incident Information:\n   ${accidentParts.join('\n   ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '';
};

// Function to combine structured notes with additional user notes
const combineNotes = (structuredNotes: string, additionalNotes: string) => {
  if (!structuredNotes && !additionalNotes) return '';

  if (!structuredNotes) return additionalNotes;
  if (!additionalNotes) return structuredNotes;

  return structuredNotes + '\n\n' + additionalNotes;
};

export const CallResultForm = ({ submissionId, customerName, onSuccess }: CallResultFormProps) => {
  const [applicationSubmitted, setApplicationSubmitted] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [notes, setNotes] = useState("");
  const [bufferAgent, setBufferAgent] = useState("");
  const [agentWhoTookCall, setAgentWhoTookCall] = useState("");
  const [leadVendor, setLeadVendor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [callSource, setCallSource] = useState("");
  const [newDraftDate, setNewDraftDate] = useState<Date>();
  const [isRetentionCall, setIsRetentionCall] = useState(false);
  const [carrierAttempted1, setCarrierAttempted1] = useState("");
  const [carrierAttempted2, setCarrierAttempted2] = useState("");
  const [carrierAttempted3, setCarrierAttempted3] = useState("");
  
  // Accident-related fields
  const [accidentDate, setAccidentDate] = useState<Date>();
  const [priorAttorneyInvolved, setPriorAttorneyInvolved] = useState<boolean | null>(null);
  const [priorAttorneyDetails, setPriorAttorneyDetails] = useState("");
  const [medicalAttention, setMedicalAttention] = useState("");
  const [policeAttended, setPoliceAttended] = useState<boolean | null>(null);
  const [accidentLocation, setAccidentLocation] = useState("");
  const [accidentScenario, setAccidentScenario] = useState("");
  const [insured, setInsured] = useState<boolean | null>(null);
  const [injuries, setInjuries] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [thirdPartyVehicleRegistration, setThirdPartyVehicleRegistration] = useState("");
  const [otherPartyAdmitFault, setOtherPartyAdmitFault] = useState<boolean | null>(null);
  const [passengersCount, setPassengersCount] = useState("");
  
  const { toast } = useToast();
  const { leadVendors, loading: centersLoading } = useCenters();

  // Load existing call result data
  useEffect(() => {
    const loadExistingCallResult = async () => {
      if (!submissionId) return;

      try {
        const { data: existingResult, error } = await supabase
          .from('call_results')
          .select('*')
          .eq('submission_id', submissionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (existingResult && !error) {
          console.log('Loading existing call result:', existingResult);
          // Populate form with existing data
          setApplicationSubmitted(Boolean(existingResult.application_submitted));
          setStatus(existingResult.status || '');
          setNotes(existingResult.notes || '');
          setBufferAgent(existingResult.buffer_agent || '');
          setAgentWhoTookCall(existingResult.agent_who_took_call || '');
          setCallSource(existingResult.call_source || '');
          setIsRetentionCall(Boolean(existingResult.is_retention_call));
          
          // Load accident-related fields
          setAccidentDate(existingResult.accident_date ? new Date(existingResult.accident_date) : undefined);
          setPriorAttorneyInvolved(existingResult.prior_attorney_involved !== null ? Boolean(existingResult.prior_attorney_involved) : null);
          setPriorAttorneyDetails(existingResult.prior_attorney_details || '');
          setMedicalAttention(existingResult.medical_attention || '');
          setPoliceAttended(existingResult.police_attended !== null ? Boolean(existingResult.police_attended) : null);
          setAccidentLocation(existingResult.accident_location || '');
          setAccidentScenario(existingResult.accident_scenario || '');
          setInsured(existingResult.insured !== null ? Boolean(existingResult.insured) : null);
          setInjuries(existingResult.injuries || '');
          setVehicleRegistration(existingResult.vehicle_registration || '');
          setInsuranceCompany(existingResult.insurance_company || '');
          setThirdPartyVehicleRegistration(existingResult.third_party_vehicle_registration || '');
          setOtherPartyAdmitFault(existingResult.other_party_admit_fault !== null ? Boolean(existingResult.other_party_admit_fault) : null);
          setPassengersCount(existingResult.passengers_count ? existingResult.passengers_count.toString() : '');
          
          // Set status reason if it exists
          if (existingResult.dq_reason) {
            setStatusReason(existingResult.dq_reason);
          }
          
          // Set new draft date if it exists
          if (existingResult['new_draft_date']) {
            setNewDraftDate(new Date(existingResult['new_draft_date']));
          }
        } else {
          console.log('No existing call result found for submission:', submissionId);
          
          // If no call result exists, try to autofill from verification items
          try {
            const { data: verificationSession } = await supabase
              .from('verification_sessions')
              .select('id, buffer_agent_id, is_retention_call')
              .eq('submission_id', submissionId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (verificationSession) {
              console.log('Auto-populating retention flag from verification session:', verificationSession.is_retention_call);
              setIsRetentionCall(Boolean(verificationSession.is_retention_call));

              // Fetch verified accident fields from verification items
              const { data: verificationItems } = await supabase
                .from('verification_items')
                .select('field_name, verified_value, original_value')
                .eq('session_id', verificationSession.id)
                .in('field_category', ['accident', 'witness']);

              if (verificationItems && verificationItems.length > 0) {
                console.log('Auto-populating accident fields from verification items:', verificationItems.length);
                
                verificationItems.forEach(item => {
                  const value = item.verified_value || item.original_value;
                  if (!value || value === 'null' || value === 'undefined') return;

                  switch (item.field_name) {
                    case 'accident_date':
                      setAccidentDate(new Date(value));
                      break;
                    case 'accident_location':
                      setAccidentLocation(value);
                      break;
                    case 'accident_scenario':
                      setAccidentScenario(value);
                      break;
                    case 'injuries':
                      setInjuries(value);
                      break;
                    case 'medical_attention':
                      setMedicalAttention(value);
                      break;
                    case 'police_attended':
                      setPoliceAttended(value.toLowerCase() === 'true');
                      break;
                    case 'insured':
                      setInsured(value.toLowerCase() === 'true');
                      break;
                    case 'vehicle_registration':
                      setVehicleRegistration(value);
                      break;
                    case 'insurance_company':
                      setInsuranceCompany(value);
                      break;
                    case 'third_party_vehicle_registration':
                      setThirdPartyVehicleRegistration(value);
                      break;
                    case 'other_party_admit_fault':
                      setOtherPartyAdmitFault(value.toLowerCase() === 'true');
                      break;
                    case 'passengers_count':
                      setPassengersCount(value);
                      break;
                    case 'prior_attorney_involved':
                      setPriorAttorneyInvolved(value.toLowerCase() === 'true');
                      break;
                    case 'prior_attorney_details':
                      setPriorAttorneyDetails(value);
                      break;
                  }
                });
              }

              // Also fetch the buffer agent's display name
              if (verificationSession.buffer_agent_id) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('display_name')
                  .eq('user_id', verificationSession.buffer_agent_id)
                  .single();

                if (profile?.display_name) {
                  console.log('Auto-populating buffer agent from verification session:', profile.display_name);
                  setBufferAgent(profile.display_name);
                }
              }
            }
          } catch (vsError) {
            console.log('Could not fetch verification session:', vsError);
          }
        }

        // Always try to fetch lead_vendor from leads table
        try {
          const { data: leadData, error: leadError } = await supabase
            .from('leads')
            .select('lead_vendor')
            .eq('submission_id', submissionId)
            .single();

          if (leadData && !leadError && leadData.lead_vendor) {
            console.log('Loading lead_vendor from leads table:', leadData.lead_vendor);
            setLeadVendor(leadData.lead_vendor);
          }
        } catch (leadError) {
          console.log('Could not fetch lead_vendor from leads table:', leadError);
        }
      } catch (error) {
        console.log('No existing call result found (expected for new entries)');
        
        // Try to fetch retention flag from verification_sessions and lead_vendor from leads table for new entries
        try {
          const { data: verificationSession } = await supabase
            .from('verification_sessions')
            .select('id, is_retention_call, buffer_agent_id')
            .eq('submission_id', submissionId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (verificationSession) {
            console.log('Auto-populating retention flag from verification session for new entry:', verificationSession.is_retention_call);
            setIsRetentionCall(Boolean(verificationSession.is_retention_call));

            // Fetch verified accident fields from verification items
            const { data: verificationItems } = await supabase
              .from('verification_items')
              .select('field_name, verified_value, original_value')
              .eq('session_id', verificationSession.id)
              .in('field_category', ['accident', 'witness']);

            if (verificationItems && verificationItems.length > 0) {
              console.log('Auto-populating accident fields from verification items (new entry):', verificationItems.length);
              
              verificationItems.forEach(item => {
                const value = item.verified_value || item.original_value;
                if (!value || value === 'null' || value === 'undefined') return;

                switch (item.field_name) {
                  case 'accident_date':
                    setAccidentDate(new Date(value));
                    break;
                  case 'accident_location':
                    setAccidentLocation(value);
                    break;
                  case 'accident_scenario':
                    setAccidentScenario(value);
                    break;
                  case 'injuries':
                    setInjuries(value);
                    break;
                  case 'medical_attention':
                    setMedicalAttention(value);
                    break;
                  case 'police_attended':
                    setPoliceAttended(value.toLowerCase() === 'true');
                    break;
                  case 'insured':
                    setInsured(value.toLowerCase() === 'true');
                    break;
                  case 'vehicle_registration':
                    setVehicleRegistration(value);
                    break;
                  case 'insurance_company':
                    setInsuranceCompany(value);
                    break;
                  case 'third_party_vehicle_registration':
                    setThirdPartyVehicleRegistration(value);
                    break;
                  case 'other_party_admit_fault':
                    setOtherPartyAdmitFault(value.toLowerCase() === 'true');
                    break;
                  case 'passengers_count':
                    setPassengersCount(value);
                    break;
                  case 'prior_attorney_involved':
                    setPriorAttorneyInvolved(value.toLowerCase() === 'true');
                    break;
                  case 'prior_attorney_details':
                    setPriorAttorneyDetails(value);
                    break;
                }
              });
            }

            // Also fetch the buffer agent's display name
            if (verificationSession.buffer_agent_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('user_id', verificationSession.buffer_agent_id)
                .single();

              if (profile?.display_name) {
                console.log('Auto-populating buffer agent from verification session:', profile.display_name);
                setBufferAgent(profile.display_name);
              }
            }
          }
        } catch (vsError) {
          console.log('Could not fetch verification session for new entry:', vsError);
        }
        
        try {
          const { data: leadData, error: leadError } = await supabase
            .from('leads')
            .select('lead_vendor')
            .eq('submission_id', submissionId)
            .single();

          if (leadData && !leadError && leadData.lead_vendor) {
            console.log('Loading lead_vendor from leads table for new entry:', leadData.lead_vendor);
            setLeadVendor(leadData.lead_vendor);
          }
        } catch (leadError) {
          console.log('Could not fetch lead_vendor from leads table for new entry:', leadError);
        }
      }
    };

    loadExistingCallResult();
  }, [submissionId]);

  // Reset related fields when status changes
  useEffect(() => {
    if (status !== "Updated Banking/draft date") {
      setNewDraftDate(undefined);
    }
    // Reset status reason when status changes, but auto-select for Chargeback DQ
    if (status === "Chargeback DQ") {
      setStatusReason("Chargeback DQ");
      // Auto-populate notes for Chargeback DQ
      const clientName = customerName || "[Client Name]";
      setNotes(getNoteText(status, "Chargeback DQ", clientName));
    } else if (status === "GI - Currently DQ") {
      // Reset carrier attempted fields when switching to this status
      setCarrierAttempted1("");
      setCarrierAttempted2("");
      setCarrierAttempted3("");
      setNotes("");
    } else {
      setStatusReason("");
      setNotes("");
    }
  }, [status, customerName]);

  // Auto-generate notes for GI - Currently DQ status
  useEffect(() => {
    if (status === "GI - Currently DQ" && carrierAttempted1) {
      const clientName = customerName || "[Client Name]";
      const carriers = [carrierAttempted1];
      if (carrierAttempted2) carriers.push(carrierAttempted2);
      if (carrierAttempted3) carriers.push(carrierAttempted3);
      
      const carrierText = carriers.join(', ');
      setNotes(`${clientName} has been declined through ${carrierText} and only qualifies for a GI policy. They are currently DQ'd`);
    }
  }, [status, carrierAttempted1, carrierAttempted2, carrierAttempted3, customerName]);

  const showSubmittedFields = applicationSubmitted === true;
  const showNotSubmittedFields = applicationSubmitted === false;
  const showStatusReasonDropdown = applicationSubmitted === false && [
    "Incomplete Transfer",
    "Returned To Center - DQ",
    "Previously Sold BPO",
    "Needs BPO Callback",
    "Application Withdrawn",
    "Pending Information",
    "⁠DQ",
    "Chargeback DQ",
    "Needs callback",
    "Not Interested",
    "Future Submission Date",
    "Updated Banking/draft date",
    "Fulfilled carrier requirements"
  ].includes(status);
  const showNewDraftDateField = applicationSubmitted === false && status === "Updated Banking/draft date" && statusReason;
  const showCarrierAttemptedFields = applicationSubmitted === false && status === "GI - Currently DQ";
  const currentReasonOptions = getReasonOptions(status);

  const handleStatusReasonChange = (reason: string) => {
    setStatusReason(reason);
    if (reason && reason !== "Other") {
      // Auto-populate notes with the mapped text using actual customer name
      const clientName = customerName || "[Client Name]";
      if (status === "Updated Banking/draft date") {
        // For this status, we need the draft date to generate the note
        setNotes(getNoteText(status, reason, clientName, newDraftDate));
      } else if (status === "Fulfilled carrier requirements") {
        // Don't auto-populate notes for this status
        setNotes("");
      } else {
        setNotes(getNoteText(status, reason, clientName));
      }
    } else if (reason === "Other") {
      // Clear notes for custom message
      setNotes("");
    }
  };

  const handleNewDraftDateChange = (date: Date | undefined) => {
    setNewDraftDate(date);
    // Update notes if reason is already selected
    if (statusReason && status === "Updated Banking/draft date") {
      const clientName = customerName || "[Client Name]";
      setNotes(getNoteText(status, statusReason, clientName, date));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    let finalSubmissionId = submissionId;

    try {
      // Determine status based on application submission
      let finalStatus = status;
      if (applicationSubmitted === true) {
        finalStatus = "Submitted";
      }

      // Map status for sheet value
      const mappedStatus = mapStatusToSheetValue(finalStatus);

      // Generate final notes
      let finalNotes = notes;
      if (applicationSubmitted === true) {
        const structuredNotes = generateSubmittedApplicationNotes(
          {
            accidentDate,
            accidentLocation,
            accidentScenario,
            injuries,
            medicalAttention,
            policeAttended,
            insured,
            vehicleRegistration,
            insuranceCompany,
            thirdPartyVehicleRegistration,
            otherPartyAdmitFault,
            passengersCount,
            priorAttorneyInvolved,
            priorAttorneyDetails
          }
        );
        finalNotes = combineNotes(structuredNotes, notes);
      }

      const callResultData = {
        submission_id: submissionId,
        application_submitted: applicationSubmitted,
        status: finalStatus,
        notes: finalNotes,
        dq_reason: showStatusReasonDropdown ? statusReason : null,
        buffer_agent: bufferAgent,
        agent_who_took_call: agentWhoTookCall,
        new_draft_date: status === "Updated Banking/draft date" && newDraftDate ? format(newDraftDate, "yyyy-MM-dd") : null,
        is_callback: submissionId.startsWith('CB') || submissionId.startsWith('CBB'), // Track if this is a callback based on submission ID
        is_retention_call: isRetentionCall,
        carrier_attempted_1: status === "GI - Currently DQ" ? carrierAttempted1 : null,
        carrier_attempted_2: status === "GI - Currently DQ" ? carrierAttempted2 : null,
        carrier_attempted_3: status === "GI - Currently DQ" ? carrierAttempted3 : null,
        // Accident-related fields
        accident_date: accidentDate ? format(accidentDate, "yyyy-MM-dd") : null,
        prior_attorney_involved: priorAttorneyInvolved,
        prior_attorney_details: priorAttorneyDetails || null,
        medical_attention: medicalAttention || null,
        police_attended: policeAttended,
        accident_location: accidentLocation || null,
        accident_scenario: accidentScenario || null,
        insured: insured,
        injuries: injuries || null,
        vehicle_registration: vehicleRegistration || null,
        insurance_company: insuranceCompany || null,
        third_party_vehicle_registration: thirdPartyVehicleRegistration || null,
        other_party_admit_fault: otherPartyAdmitFault,
        passengers_count: passengersCount ? parseInt(passengersCount) : null,
        call_source: callSource
      };

      const { data: { user } } = await supabase.auth.getUser();
      
      // Check if we already have a call result for this submission
      const { data: existingResult } = await supabase
        .from('call_results')
        .select('id')
        .eq('submission_id', submissionId)
        .maybeSingle();

      let result;
      if (existingResult) {
        // Update existing record
        result = await supabase
          .from("call_results")
          .update({
            ...callResultData,
            updated_at: getCurrentTimestampEST()
          })
          .eq('submission_id', submissionId);
      } else {
        // Insert new record
        result = await supabase
          .from("call_results")
          .insert({
            ...callResultData,
            user_id: user?.id
          });
      }

      if (result.error) {
        console.error("Error saving call result:", result.error);
        console.error("Call result data:", callResultData);
        toast({
          title: "Error",
          description: `Failed to save call result: ${result.error.message || 'Unknown error'}`,
          variant: "destructive",
        });
        return;
      }

      // Log the call result event
      try {
        const { customerName: leadCustomerName, leadVendor: leadVendorName } = await getLeadInfo(submissionId);
        
        // Determine which agent to log for
        let loggedAgentId = user?.id; // Default to current logged-in user
        let loggedAgentType: 'buffer' | 'licensed' = 'licensed';
        let loggedAgentName = agentWhoTookCall;
        
        // If it's a buffer agent workflow, log for buffer agent
        if (bufferAgent && bufferAgent !== 'N/A') {
          // Get buffer agent user_id from profiles table by display name
          const { data: bufferAgentProfile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('display_name', bufferAgent)
            .single();
          
          if (bufferAgentProfile?.user_id) {
            loggedAgentId = bufferAgentProfile.user_id;
            loggedAgentType = 'buffer';
            loggedAgentName = bufferAgent;
          }
        } else if (agentWhoTookCall && agentWhoTookCall !== 'N/A') {
          // Get licensed agent user_id from profiles table by display name
          const { data: licensedAgentProfile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('display_name', agentWhoTookCall)
            .single();
          
          if (licensedAgentProfile?.user_id) {
            loggedAgentId = licensedAgentProfile.user_id;
            loggedAgentName = agentWhoTookCall;
          }
        }

        // Determine the event type based on status and submission
        let eventType: 'application_submitted' | 'application_not_submitted' | 'call_disconnected';
        
        if (applicationSubmitted === false && status === "Disconnected") {
          // Special case for disconnected calls by buffer agents
          eventType = 'call_disconnected';
        } else if (applicationSubmitted) {
          eventType = 'application_submitted';
        } else {
          eventType = 'application_not_submitted';
        }
        
        if (loggedAgentId) {
          await logCallUpdate({
            submissionId,
            agentId: loggedAgentId,
            agentType: loggedAgentType,
            agentName: loggedAgentName,
            eventType,
            eventDetails: {
              status: finalStatus,
              call_source: callSource,
              dq_reason: showStatusReasonDropdown ? statusReason : null,
              notes: notes
            },
            isRetentionCall: isRetentionCall,
            customerName: leadCustomerName,
            leadVendor: leadVendorName
          });
        }
      } catch (loggingError) {
        console.error('Failed to log call result:', loggingError);
        // Don't fail the entire process if logging fails
      }

          // Sync daily_deal_flow using the Edge Function
          try {
            console.log('DEBUG: Calling update-daily-deal-flow-entry for daily_deal_flow update');

            const { data: updateResult, error: updateError } = await supabase.functions.invoke('update-daily-deal-flow-entry', {
              body: {
                submission_id: submissionId,
                call_source: callSource,
                buffer_agent: bufferAgent,
                agent: agentWhoTookCall,
                status: finalStatus,
                call_result: applicationSubmitted === true ? "Submitted" : "Not Submitted",
                notes: finalNotes,
                from_callback: callSource === "Agent Callback",
                is_callback: submissionId.startsWith('CB') || submissionId.startsWith('CBB'),
                is_retention_call: isRetentionCall,
                application_submitted: applicationSubmitted,
                carrier_attempted_1: status === "GI - Currently DQ" ? carrierAttempted1 : null,
                carrier_attempted_2: status === "GI - Currently DQ" ? carrierAttempted2 : null,
                carrier_attempted_3: status === "GI - Currently DQ" ? carrierAttempted3 : null,
                // Accident-related fields
                accident_date: accidentDate ? format(accidentDate, "yyyy-MM-dd") : null,
                prior_attorney_involved: priorAttorneyInvolved,
                prior_attorney_details: priorAttorneyDetails || null,
                medical_attention: medicalAttention || null,
                police_attended: policeAttended,
                accident_location: accidentLocation || null,
                accident_scenario: accidentScenario || null,
                insured: insured,
                injuries: injuries || null,
                vehicle_registration: vehicleRegistration || null,
                insurance_company: insuranceCompany || null,
                third_party_vehicle_registration: thirdPartyVehicleRegistration || null,
                other_party_admit_fault: otherPartyAdmitFault,
                passengers_count: passengersCount ? parseInt(passengersCount) : null
              }
            });

            if (updateError) {
              console.error('Error updating daily deal flow:', updateError);
            } else {
              console.log('Daily deal flow updated successfully:', updateResult);
              // Use the submission_id returned by the function for Google Sheets
              finalSubmissionId = updateResult.submission_id || submissionId;
            }
          } catch (syncError) {
            console.error('Sync to daily_deal_flow failed:', syncError);
          }      // Update verification session status to completed if one exists
      try {
        const { error: sessionUpdateError } = await supabase
          .from('verification_sessions')
          .update({ status: 'completed' })
          .eq('submission_id', submissionId)
          .in('status', ['pending', 'in_progress', 'ready_for_transfer', 'transferred']);

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

      // Google Sheets updates have been removed - data is tracked in daily_deal_flow table only

      // Send Slack notification for submitted applications
      if (applicationSubmitted === true) {
        try {
          
          
          // First, fetch the lead data for the Slack notification
          const { data: leadData, error: leadError } = await supabase
            .from("leads")
            .select("*")
            .eq("submission_id", submissionId)
            .single();

          if (!leadError && leadData) {
            const callResultForSlack = {
              application_submitted: applicationSubmitted,
              buffer_agent: bufferAgent,
              agent_who_took_call: agentWhoTookCall,
              lead_vendor: leadData.lead_vendor || leadVendor || 'N/A',
              notes: finalNotes,
              dq_reason: showStatusReasonDropdown ? statusReason : null,
              ...(accidentDate && { accident_date: accidentDate }),
              ...(accidentLocation && { accident_location: accidentLocation }),
              ...(injuries && { injuries }),
              ...(medicalAttention !== null && { medical_attention: medicalAttention }),
              ...(policeAttended !== null && { police_attended: policeAttended }),
              ...(insured !== null && { insured }),
            };
            
            
            const { error: slackError } = await supabase.functions.invoke('slack-notification', {
              body: {
                submissionId: submissionId,
                leadData: {
                  customer_full_name: leadData.customer_full_name,
                  phone_number: leadData.phone_number,
                  email: leadData.email
                },
                callResult: callResultForSlack
              }
            });

            if (slackError) {
              console.error("Error sending Slack notification:", slackError);
              // Don't fail the entire process if Slack fails
            } else {
              console.log("Slack notification sent successfully");
            }
          }
        } catch (slackError) {
          console.error("Slack notification failed:", slackError);
          // Don't fail the entire process if Slack fails
        }
      }

      // Send center notification for NOT submitted applications
      if (applicationSubmitted === false) {
        try {
          // First, fetch the lead data for the center notification
          const { data: leadData, error: leadError } = await supabase
            .from("leads")
            .select("*")
            .eq("submission_id", submissionId)
            .single();

          if (!leadError && leadData) {
            const callResultForCenter = {
              application_submitted: applicationSubmitted,
              status: finalStatus,
              dq_reason: showStatusReasonDropdown ? statusReason : null,
              notes: notes,
              buffer_agent: bufferAgent,
              agent_who_took_call: agentWhoTookCall,
              lead_vendor: leadData.lead_vendor || leadVendor || 'N/A',
              // Accident information
              accident_date: accidentDate ? format(accidentDate, "yyyy-MM-dd") : null,
              accident_location: accidentLocation || null,
              accident_scenario: accidentScenario || null,
              injuries: injuries || null,
              medical_attention: medicalAttention || null,
              police_attended: policeAttended,
              insured: insured,
              vehicle_registration: vehicleRegistration || null,
              insurance_company: insuranceCompany || null,
              prior_attorney_involved: priorAttorneyInvolved,
              prior_attorney_details: priorAttorneyDetails || null
            };
            
            console.log("Sending center notification for not submitted application");
            
            const { error: centerError } = await supabase.functions.invoke('center-notification', {
              body: {
                submissionId: submissionId,
                leadData: {
                  customer_full_name: leadData.customer_full_name,
                  phone_number: leadData.phone_number,
                  email: leadData.email,
                  lead_vendor: leadData.lead_vendor
                },
                callResult: callResultForCenter
              }
            });

            if (centerError) {
              console.error("Error sending center notification:", centerError);
              // Don't fail the entire process if center notification fails
            } else {
              console.log("Center notification sent successfully");
            }
          }
        } catch (centerError) {
          console.error("Center notification failed:", centerError);
          // Don't fail the entire process if center notification fails
        }
      }

      // Send disconnected call notification for disconnected statuses
      if (applicationSubmitted === false && (finalStatus === 'Disconnected' || finalStatus === 'Disconnected - Never Retransferred')) {
        try {
          // First, fetch the lead data for the disconnected call notification
          const { data: leadData, error: leadError } = await supabase
            .from("leads")
            .select("*")
            .eq("submission_id", submissionId)
            .single();

          if (!leadError && leadData) {
            const callResultForDisconnected = {
              application_submitted: applicationSubmitted,
              status: finalStatus,
              dq_reason: showStatusReasonDropdown ? statusReason : null,
              status_reason: showStatusReasonDropdown ? statusReason : null,
              notes: notes,
              buffer_agent: bufferAgent,
              agent_who_took_call: agentWhoTookCall,
              lead_vendor: leadData.lead_vendor || leadVendor || 'N/A',
              call_source: callSource
            };

            console.log("Sending disconnected call notification");

            const { error: disconnectedError } = await supabase.functions.invoke('disconnected-call-notification', {
              body: {
                submissionId: submissionId,
                leadData: {
                  customer_full_name: leadData.customer_full_name,
                  phone_number: leadData.phone_number,
                  email: leadData.email,
                  lead_vendor: leadData.lead_vendor
                },
                callResult: callResultForDisconnected
              }
            });

            if (disconnectedError) {
              console.error("Error sending disconnected call notification:", disconnectedError);
              // Don't fail the entire process if disconnected notification fails
            } else {
              console.log("Disconnected call notification sent successfully");
            }
          }
        } catch (disconnectedError) {
          console.error("Disconnected call notification failed:", disconnectedError);
          // Don't fail the entire process if disconnected notification fails
        }
      }

      // Personal sales portal notification has been removed
      // Previously checked for licensedAgentAccount but this field is no longer used

      toast({
        title: "Success",
        description: existingResult ? "Call result updated successfully" : "Call result saved successfully",
      });

      // Call onSuccess callback to navigate to journey page
      if (onSuccess) {
        onSuccess();
      } else {
        // Reset form if no callback provided (only for new entries)
        if (!existingResult) {
          setApplicationSubmitted(null);
          setStatus("");
          setStatusReason("");
          setNotes("");
          setBufferAgent("");
          setAgentWhoTookCall("");
          setLeadVendor("");
          setCallSource("");
          setNewDraftDate(undefined);
          setIsRetentionCall(false);
          setCarrierAttempted1("");
          setCarrierAttempted2("");
          setCarrierAttempted3("");
        }
      }

    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Full Screen Loading Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-lg font-medium">Saving call result...</span>
          </div>
        </div>
      )}
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Update Call Result</CardTitle>
            <div className="flex items-center gap-2">
              {isRetentionCall && (
                <Badge className="bg-purple-600 hover:bg-purple-700 flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Retention Call
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Primary Question */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Was the application submitted?
            </Label>
            <div className="flex gap-4">
              <Button
                type="button"
                variant={applicationSubmitted === true ? "default" : "outline"}
                onClick={() => {
                  setApplicationSubmitted(true);
                }}
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Yes
              </Button>
              <Button
                type="button"
                variant={applicationSubmitted === false ? "default" : "outline"}
                onClick={() => {
                  setApplicationSubmitted(false);
                }}
                className="flex items-center gap-2"
              >
                <XCircle className="h-4 w-4" />
                No
              </Button>
            </div>
          </div>

          {/* Call Source Dropdown - REQUIRED */}
          <div>
              <Label htmlFor="callSource" className="text-base font-semibold">
                Call Source <span className="text-red-500">*</span>
              </Label>
              <Select value={callSource || undefined} onValueChange={setCallSource} required>
                <SelectTrigger className={`${!callSource ? 'border-red-300 focus:border-red-500' : ''}`}>
                  <SelectValue placeholder="Select call source (required)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BPO Transfer">BPO Transfer</SelectItem>
                  <SelectItem value="Agent Callback">Agent Callback</SelectItem>
                </SelectContent>
              </Select>
              {!callSource && (
                <p className="text-sm text-red-500 mt-1">Call source is required</p>
              )}
            </div>
          
          {/* Fields for submitted applications */}
          {showSubmittedFields && (
            <>
              {/* Call Information - Only shown when application is submitted */}
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h3 className="font-semibold text-gray-800">Call Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="bufferAgent">Buffer Agent</Label>
                    <Select value={bufferAgent} onValueChange={setBufferAgent}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select buffer agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {bufferAgentOptions.map((agent) => (
                          <SelectItem key={agent} value={agent}>
                            {agent}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="agentWhoTookCall">Agent who took the call</Label>
                    <Select value={agentWhoTookCall} onValueChange={setAgentWhoTookCall}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agentOptions.map((agent) => (
                          <SelectItem key={agent} value={agent}>
                            {agent}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            <div className="space-y-4 p-4 border rounded-lg bg-green-50">
              <h3 className="font-semibold text-green-800">Application Submitted Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="leadVendor">Lead Vendor</Label>
                  <Select value={leadVendor} onValueChange={setLeadVendor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select lead vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {leadVendors.map((vendor) => (
                        <SelectItem key={vendor} value={vendor}>
                          {vendor}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Accident/Incident Information Section */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-semibold text-green-800 mb-3">Accident/Incident Information (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Accident Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !accidentDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {accidentDate ? format(accidentDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={accidentDate}
                          onSelect={setAccidentDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label htmlFor="accidentLocation">Accident Location</Label>
                    <Input
                      id="accidentLocation"
                      value={accidentLocation}
                      onChange={(e) => setAccidentLocation(e.target.value)}
                      placeholder="City, State or Address"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="accidentScenario">Accident Scenario</Label>
                    <Textarea
                      id="accidentScenario"
                      value={accidentScenario}
                      onChange={(e) => setAccidentScenario(e.target.value)}
                      placeholder="Describe what happened..."
                      rows={3}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="injuries">Injuries</Label>
                    <Textarea
                      id="injuries"
                      value={injuries}
                      onChange={(e) => setInjuries(e.target.value)}
                      placeholder="Describe any injuries sustained..."
                      rows={2}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="medicalAttention">Medical Attention</Label>
                    <Textarea
                      id="medicalAttention"
                      value={medicalAttention}
                      onChange={(e) => setMedicalAttention(e.target.value)}
                      placeholder="Details about medical treatment received..."
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label>Police Attended</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={policeAttended === true ? "default" : "outline"}
                        onClick={() => setPoliceAttended(true)}
                        className="flex-1"
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        variant={policeAttended === false ? "default" : "outline"}
                        onClick={() => setPoliceAttended(false)}
                        className="flex-1"
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Was Insured</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={insured === true ? "default" : "outline"}
                        onClick={() => setInsured(true)}
                        className="flex-1"
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        variant={insured === false ? "default" : "outline"}
                        onClick={() => setInsured(false)}
                        className="flex-1"
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="vehicleRegistration">Vehicle Registration</Label>
                    <Input
                      id="vehicleRegistration"
                      value={vehicleRegistration}
                      onChange={(e) => setVehicleRegistration(e.target.value)}
                      placeholder="License plate number"
                    />
                  </div>

                  <div>
                    <Label htmlFor="insuranceCompany">Insurance Company</Label>
                    <Input
                      id="insuranceCompany"
                      value={insuranceCompany}
                      onChange={(e) => setInsuranceCompany(e.target.value)}
                      placeholder="Name of insurance company"
                    />
                  </div>

                  <div>
                    <Label htmlFor="thirdPartyVehicleRegistration">Third Party Vehicle Registration</Label>
                    <Input
                      id="thirdPartyVehicleRegistration"
                      value={thirdPartyVehicleRegistration}
                      onChange={(e) => setThirdPartyVehicleRegistration(e.target.value)}
                      placeholder="Other vehicle's license plate"
                    />
                  </div>

                  <div>
                    <Label>Other Party Admitted Fault</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={otherPartyAdmitFault === true ? "default" : "outline"}
                        onClick={() => setOtherPartyAdmitFault(true)}
                        className="flex-1"
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        variant={otherPartyAdmitFault === false ? "default" : "outline"}
                        onClick={() => setOtherPartyAdmitFault(false)}
                        className="flex-1"
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="passengersCount">Number of Passengers</Label>
                    <Input
                      id="passengersCount"
                      type="number"
                      min="0"
                      value={passengersCount}
                      onChange={(e) => setPassengersCount(e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <Label>Prior Attorney Involved</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={priorAttorneyInvolved === true ? "default" : "outline"}
                        onClick={() => setPriorAttorneyInvolved(true)}
                        className="flex-1"
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        variant={priorAttorneyInvolved === false ? "default" : "outline"}
                        onClick={() => setPriorAttorneyInvolved(false)}
                        className="flex-1"
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  {priorAttorneyInvolved === true && (
                    <div className="md:col-span-2">
                      <Label htmlFor="priorAttorneyDetails">Attorney Details</Label>
                      <Textarea
                        id="priorAttorneyDetails"
                        value={priorAttorneyDetails}
                        onChange={(e) => setPriorAttorneyDetails(e.target.value)}
                        placeholder="Name, firm, contact information..."
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Notes for Submitted Applications */}
              <div>
                <Label htmlFor="notesSubmitted">Agent Notes</Label>
                <Textarea
                  id="notesSubmitted"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter any additional notes about this application..."
                  rows={4}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Application details will be auto-generated and combined with your notes when saved.
                </p>
              </div>
            </div>
            </>
          )}

          {/* Fields for not submitted applications */}
          {showNotSubmittedFields && (
            <div className="space-y-4 p-4 border rounded-lg bg-orange-50">
              <h3 className="font-semibold text-orange-800">Application Not Submitted</h3>
              
              {/* Call Information for Not Submitted */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bufferAgentNotSubmitted">Buffer Agent</Label>
                  <Select value={bufferAgent} onValueChange={setBufferAgent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select buffer agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {bufferAgentOptions.map((agent) => (
                        <SelectItem key={agent} value={agent}>
                          {agent}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="agentWhoTookCallNotSubmitted">
                    Agent who took the call <span className="text-red-500">*</span>
                  </Label>
                  <Select value={agentWhoTookCall} onValueChange={setAgentWhoTookCall} required>
                    <SelectTrigger className={`${!agentWhoTookCall ? 'border-red-300 focus:border-red-500' : ''}`}>
                      <SelectValue placeholder="Select agent (required)" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentOptions.map((agent) => (
                        <SelectItem key={agent} value={agent}>
                          {agent}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!agentWhoTookCall && (
                    <p className="text-sm text-red-500 mt-1">Agent who took the call is required</p>
                  )}
                </div>
              </div>
              
              <div>
                <Label htmlFor="status">
                  Status/Stage <span className="text-red-500">*</span>
                </Label>
                <Select value={status} onValueChange={setStatus} required>
                  <SelectTrigger className={`${!status ? 'border-red-300 focus:border-red-500' : ''}`}>
                    <SelectValue placeholder="Select status (required)" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!status && (
                  <p className="text-sm text-red-500 mt-1">Status/Stage is required</p>
                )}
              </div>

              {/* Status Reason dropdown - shows for DQ, Needs Callback, Not Interested, Future Submission Date, Updated Banking/draft date, Fulfilled carrier requirements */}
              {showStatusReasonDropdown && (
                <div>
                  <Label htmlFor="statusReason">
                    {status === "⁠DQ" ? "Reason for DQ" : 
                     status === "Needs callback" ? "Callback Reason" :
                     status === "Not Interested" ? "Reason Not Interested" :
                     status === "Future Submission Date" ? "Future Submission Reason" :
                     status === "Updated Banking/draft date" ? "Update Reason" :
                     status === "Fulfilled carrier requirements" ? "Fulfillment Confirmation" :
                     "Reason"}
                  </Label>
                  <Select value={statusReason} onValueChange={handleStatusReasonChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select reason for ${status.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {currentReasonOptions.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* New Draft Date field - shows only for Updated Banking/draft date status */}
              {showNewDraftDateField && (
                <div>
                  <Label htmlFor="newDraftDate">New Draft Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !newDraftDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newDraftDate ? format(newDraftDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newDraftDate}
                        onSelect={handleNewDraftDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Carrier Attempted fields - shows only for GI - Currently DQ status */}
              {showCarrierAttemptedFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-red-50">
                  <h4 className="font-semibold text-red-800">GI - Currently DQ Details</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="carrierAttempted1">
                        Attempted Carrier #1 <span className="text-red-500">*</span>
                      </Label>
                      <Select value={carrierAttempted1} onValueChange={setCarrierAttempted1} required>
                        <SelectTrigger className={`${!carrierAttempted1 ? 'border-red-300 focus:border-red-500' : ''}`}>
                          <SelectValue placeholder="Select carrier (required)" />
                        </SelectTrigger>
                        <SelectContent>
                          {carrierOptions.map((carrier) => (
                            <SelectItem key={carrier} value={carrier}>
                              {carrier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!carrierAttempted1 && (
                        <p className="text-sm text-red-500 mt-1">Carrier #1 is required</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="carrierAttempted2">Attempted Carrier #2</Label>
                      <Select value={carrierAttempted2} onValueChange={setCarrierAttempted2}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select carrier (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {carrierOptions.map((carrier) => (
                            <SelectItem key={carrier} value={carrier}>
                              {carrier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="carrierAttempted3">Attempted Carrier #3</Label>
                      <Select value={carrierAttempted3} onValueChange={setCarrierAttempted3}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select carrier (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {carrierOptions.map((carrier) => (
                            <SelectItem key={carrier} value={carrier}>
                              {carrier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="notes">
                  Notes <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={showStatusReasonDropdown && statusReason && statusReason !== "Other" 
                    ? "Note has been auto-populated. You can edit if needed." 
                    : showStatusReasonDropdown && statusReason === "Other"
                    ? "Please enter a custom message."
                    : "Why the call got dropped or application not get submitted? Please provide the reason (required)"
                  }
                  className={`${!notes.trim() ? 'border-red-300 focus:border-red-500' : ''}`}
                  rows={3}
                  required
                />
                {showStatusReasonDropdown && statusReason && statusReason !== "Other" && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Note has been auto-populated based on selected reason. You can edit if needed.
                  </p>
                )}
                {showStatusReasonDropdown && statusReason === "Other" && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Please enter a custom message for this reason.
                  </p>
                )}
                {!notes.trim() && (
                  <p className="text-sm text-red-500 mt-1">Notes are required</p>
                )}
              </div>
            </div>
          )}

          {/* Validation message for not submitted applications */}
          {applicationSubmitted === false && (
            (!agentWhoTookCall || !status || !notes.trim() || (status === "GI - Currently DQ" && !carrierAttempted1))
          ) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">
                Please complete all required fields:
                {!agentWhoTookCall && " Agent who took the call"}
                {!status && " Status/Stage"}
                {status === "GI - Currently DQ" && !carrierAttempted1 && " Carrier Attempted #1"}
                {!notes.trim() && " Notes"}
              </p>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={
                  applicationSubmitted === null || 
                  !callSource || 
                  isSubmitting || 
                  (applicationSubmitted === false && (
                    !agentWhoTookCall || 
                    !status || 
                    !notes.trim() || 
                    (status === "GI - Currently DQ" && !carrierAttempted1)
                  ))
                }
                className="min-w-32"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Call Result"
                )}
              </Button>
            </div>
          </form>
      </CardContent>
    </Card>
    </>
  );
};
