import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, X, ChevronDown, ChevronUp, ArrowUpRight, PhoneOff, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { logCallUpdate, getLeadInfo } from "@/lib/callLogging";
// Custom field order for display - matches actual leads table fields
const customFieldOrder = [
  // Lead Source
  "lead_vendor",
  
  // Personal Information
  "customer_full_name",
  "date_of_birth",
  "age",
  "birth_state",
  "social_security",
  "driver_license",
  
  // Contact Information
  "street_address",
  "city",
  "state",
  "zip_code",
  "phone_number",
  "email",
  
  // Accident/Incident Information
  "accident_date",
  "accident_location",
  "accident_scenario",
  "injuries",
  "medical_attention",
  "police_attended",
  "insured",
  "vehicle_registration",
  "insurance_company",
  "third_party_vehicle_registration",
  "other_party_admit_fault",
  "passengers_count",
  "prior_attorney_involved",
  "prior_attorney_details",
  
  // Witness/Contact Information
  "contact_name",
  "contact_number",
  "contact_address",
  
  // Additional Notes
  "additional_notes",
  "medical_treatment_proof",
  "insurance_documents",
  "police_report"
];
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColoredProgress } from "@/components/ui/colored-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Clock, User, CheckCircle, ShieldCheck, XCircle } from "lucide-react";
import { useRealtimeVerification, VerificationItem } from "@/hooks/useRealtimeVerification";

type VerificationStepDefinition = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  fieldNames: string[];
  prompts?: string[];
};

type StepQuestionBinding = {
  key: string;
  prompt: string;
  fieldName?: string;
  customFieldKey?: "medical_treatment_proof" | "insurance_documents" | "police_report";
  anchorFieldName?: string;
  supplementalKey?: string;
  inputType?: "text" | "textarea" | "select";
  options?: Array<{ value: string; label: string }>;
  fullWidth?: boolean;
};

const verificationStepDefinitions: VerificationStepDefinition[] = [
  {
    key: "basic_information",
    eyebrow: "2. Basic Information",
    title: "Collect identity and contact details",
    description: "Fill the same core identity details in the order the script asks them.",
    fieldNames: [
      "customer_full_name",
      "phone_number",
      "email",
      "street_address",
      "city",
      "state",
      "zip_code",
      "date_of_birth",
      "driver_license",
      "age",
      "birth_state",
    ],
    prompts: [
      "Full name: first, middle, last",
      "Phone number: cell and alternate if available",
      "Email address",
      "Current address: street, city, state, zip",
      "Date of birth",
    ],
  },
  {
    key: "accident_date",
    eyebrow: "3. Accident Date Verification",
    title: "Critical fraud checkpoint",
    description: "Confirm the date multiple ways before moving deeper into the accident story.",
    fieldNames: ["accident_date"],
    prompts: [
      "Ask when the accident happened, then reconfirm the same date more than once.",
      "Use day of week, season, weather, and time of day as consistency checks.",
    ],
  },
  {
    key: "accident_location",
    eyebrow: "4. Accident Location & Details",
    title: "Lock in the factual scene details",
    description: "Capture the scene details and any witness or support contact information.",
    fieldNames: ["accident_location", "contact_name", "contact_number", "contact_address"],
  },
  {
    key: "fault_liability",
    eyebrow: "5. Fault & Liability",
    title: "Capture the story before conclusions",
    description: "Confirm fault signals cleanly before you move into verification-heavy follow-ups.",
    fieldNames: ["accident_scenario", "other_party_admit_fault", "police_attended"],
  },
  {
    key: "police_report",
    eyebrow: "6. Police Report",
    title: "Primary verification tool",
    description: "If police attended, collect the follow-up details immediately while the caller remembers them.",
    fieldNames: ["police_report"],
    prompts: [
      "Was a police report filed at the scene?",
      "Do you have the police report number or case number?",
      "Which police department or agency responded?",
      "Do you remember the name of any officers who came to the scene?",
    ],
  },
  {
    key: "injury_verification",
    eyebrow: "7. Injury Verification",
    title: "Second major fraud checkpoint",
    description: "Capture injuries, treatment timing, and whether records can back the story up.",
    fieldNames: ["injuries", "medical_attention", "medical_treatment_proof"],
  },
  {
    key: "prior_attorney",
    eyebrow: "8. Prior Attorney Representation",
    title: "Critical hidden-representation checkpoint",
    description: "Confirm whether prior counsel exists before sending the case further.",
    fieldNames: ["prior_attorney_involved", "prior_attorney_details"],
  },
  {
    key: "compensation_settlement",
    eyebrow: "9. Compensation & Settlement History",
    title: "Make sure the case is still viable",
    description: "Capture prior payments, settlement activity, and release status before sending the case further.",
    fieldNames: [],
  },
  {
    key: "driver_vehicle",
    eyebrow: "10. Driver & Vehicle Information",
    title: "Collect both sides of the vehicle file",
    description: "If the caller was insured, open the vehicle and insurance follow-up right away.",
    fieldNames: ["insured", "driver_license", "insurance_company", "vehicle_registration", "third_party_vehicle_registration", "passengers_count"],
  },
  {
    key: "documents_notes",
    eyebrow: "11. Document Collection Requirements",
    title: "Confirm document readiness",
    description: "Track what can already be provided before handoff.",
    fieldNames: ["police_report", "insurance_documents", "additional_notes"],
  },
];

const fieldPromptLabels: Record<string, string> = {
  customer_full_name: "1. Full name",
  phone_number: "2. Phone number",
  email: "3. Email address",
  street_address: "4a. Street address",
  city: "4b. City",
  state: "4c. State",
  zip_code: "4d. ZIP code",
  date_of_birth: "5. Date of birth",
  driver_license: "Supporting: Driver license",
  age: "Supporting: Age",
  birth_state: "Supporting: Birth state",
  social_security: "Supporting: Social security",
  accident_date: "Accident date",
  accident_location: "Accident location",
  accident_scenario: "Accident scenario",
  contact_name: "Witness / contact name",
  contact_number: "Witness / contact phone",
  contact_address: "Witness / contact address",
  other_party_admit_fault: "Did the other party admit fault?",
  police_attended: "Did police attend the scene?",
  police_report: "Police report available",
  injuries: "Injuries reported",
  medical_attention: "Medical attention details",
  medical_treatment_proof: "Medical treatment proof available",
  prior_attorney_involved: "Any prior attorney involved?",
  prior_attorney_details: "Prior attorney details",
  insured: "Was the caller insured?",
  insurance_company: "Insurance company",
  vehicle_registration: "Vehicle registration",
  third_party_vehicle_registration: "Third-party vehicle registration",
  passengers_count: "Passengers count",
  insurance_documents: "Insurance documents available",
  additional_notes: "Additional notes",
};

const policeAgencyOptions = [
  { value: "city_police", label: "City Police" },
  { value: "state_police", label: "State Police" },
  { value: "sheriff", label: "Sheriff" },
  { value: "highway_patrol", label: "Highway Patrol" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
];

const yesNoOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const driverPassengerOptions = [
  { value: "driver", label: "Driver" },
  { value: "passenger", label: "Passenger" },
  { value: "unknown", label: "Unknown" },
];

const familiarityOptions = [
  { value: "familiar", label: "Familiar Area" },
  { value: "new_area", label: "Traveling Somewhere New" },
  { value: "unknown", label: "Unknown" },
];

const treatmentTimingOptions = [
  { value: "same_day", label: "Same Day" },
  { value: "next_day", label: "Next Day" },
  { value: "later", label: "Later" },
  { value: "unknown", label: "Unknown" },
];

const workImpactOptions = [
  { value: "able_to_work", label: "Able To Work" },
  { value: "limited_work", label: "Limited Work" },
  { value: "unable_to_work", label: "Unable To Work" },
  { value: "unknown", label: "Unknown" },
];

const stepQuestionBindings: Record<string, StepQuestionBinding[]> = {
  basic_information: [
    { key: "customer_full_name", prompt: "Full name: first, middle, last", fieldName: "customer_full_name" },
    { key: "phone_number", prompt: "Phone number: cell", fieldName: "phone_number" },
    { key: "alternate_phone", prompt: "Alternate phone if available", anchorFieldName: "phone_number", supplementalKey: "alternate_phone" },
    { key: "email", prompt: "Email address", fieldName: "email" },
    { key: "street_address", prompt: "Current address: street", fieldName: "street_address" },
    { key: "city", prompt: "Current address: city", fieldName: "city" },
    { key: "state", prompt: "Current address: state", fieldName: "state" },
    { key: "zip_code", prompt: "Current address: zip", fieldName: "zip_code" },
    { key: "date_of_birth", prompt: "Date of birth", fieldName: "date_of_birth" },
  ],
  accident_date: [
    { key: "accident_date", prompt: "Initial question: Can you tell me when your accident happened?", fieldName: "accident_date" },
    { key: "day_of_week", prompt: "What day of the week was it?", anchorFieldName: "accident_date", supplementalKey: "day_of_week" },
    { key: "holiday_event", prompt: "Was it around any holiday or special event?", anchorFieldName: "accident_date", supplementalKey: "holiday_event" },
    { key: "weather", prompt: "What was the weather like that day?", anchorFieldName: "accident_date", supplementalKey: "weather" },
    { key: "time_of_day", prompt: "About what time of day did it happen?", anchorFieldName: "accident_date", supplementalKey: "time_of_day" },
    {
      key: "date_confirmation",
      prompt: "So just to confirm, that was [REPEAT DATE]? And that was about [X] months ago, correct?",
      anchorFieldName: "accident_date",
      supplementalKey: "date_confirmation",
      inputType: "textarea",
      fullWidth: true,
    },
  ],
  accident_location: [
    { key: "accident_city_state", prompt: "What city and state did the accident occur in?", anchorFieldName: "accident_location", supplementalKey: "city_state" },
    { key: "accident_street", prompt: "Can you tell me the street or intersection where it happened?", anchorFieldName: "accident_location", supplementalKey: "street_or_intersection" },
    {
      key: "area_familiarity",
      prompt: "Were you familiar with that area, or were you traveling somewhere new?",
      anchorFieldName: "accident_location",
      supplementalKey: "area_familiarity",
      inputType: "select",
      options: familiarityOptions,
    },
    {
      key: "driver_or_passenger",
      prompt: "Were you the driver or a passenger?",
      anchorFieldName: "accident_location",
      supplementalKey: "driver_or_passenger",
      inputType: "select",
      options: driverPassengerOptions,
    },
    {
      key: "passenger_relationship",
      prompt: "If passenger: who was driving, and what is their relationship to you?",
      anchorFieldName: "accident_location",
      supplementalKey: "passenger_driver_relationship",
      fullWidth: true,
    },
  ],
  fault_liability: [
    {
      key: "accident_walkthrough",
      prompt: "Can you walk me through exactly how the accident happened?",
      fieldName: "accident_scenario",
      fullWidth: true,
    },
    { key: "fault_opinion", prompt: "In your opinion, who was at fault for the accident?", anchorFieldName: "other_party_admit_fault", supplementalKey: "fault_opinion" },
    { key: "other_party_admit_fault", prompt: "Did the other driver admit fault at the scene?", fieldName: "other_party_admit_fault" },
    { key: "police_attended", prompt: "Did the police come to the scene?", fieldName: "police_attended" },
    { key: "traffic_citation", prompt: "Did anyone receive a traffic citation or ticket?", anchorFieldName: "other_party_admit_fault", supplementalKey: "traffic_citation", inputType: "select", options: yesNoOptions },
    { key: "ticket_recipient", prompt: "If yes: who received the ticket - you or the other driver?", anchorFieldName: "other_party_admit_fault", supplementalKey: "ticket_recipient" },
  ],
  police_report: [
    { key: "report_filed", prompt: "Was a police report filed at the scene?", anchorFieldName: "police_attended", supplementalKey: "report_filed", inputType: "select", options: yesNoOptions },
    { key: "report_case_number", prompt: "If yes: do you have the police report number or case number?", anchorFieldName: "police_attended", supplementalKey: "report_case_number" },
    {
      key: "responding_agency",
      prompt: "Which police department or agency responded - city police, state police, or sheriff?",
      anchorFieldName: "police_attended",
      supplementalKey: "responding_agency",
      inputType: "select",
      options: policeAgencyOptions,
    },
    { key: "officer_name", prompt: "Do you remember the name of any officers who came to the scene?", anchorFieldName: "police_attended", supplementalKey: "officer_name" },
    { key: "police_report", prompt: "Police report available to upload", customFieldKey: "police_report" },
  ],
  injury_verification: [
    { key: "injured_yes_no", prompt: "Were you injured in the accident?", anchorFieldName: "injuries", supplementalKey: "injured_in_accident", inputType: "select", options: yesNoOptions },
    { key: "injuries", prompt: "Can you tell me what parts of your body were hurt?", fieldName: "injuries", fullWidth: true },
    { key: "pain_timing", prompt: "Did you feel the pain immediately, or did it come later?", anchorFieldName: "injuries", supplementalKey: "pain_timing" },
    { key: "hospital_direct", prompt: "Did you go to the hospital directly from the accident scene?", anchorFieldName: "medical_attention", supplementalKey: "hospital_direct", inputType: "select", options: yesNoOptions },
    { key: "first_treatment_timing", prompt: "If not, when did you first seek medical attention - same day, next day, or later?", anchorFieldName: "medical_attention", supplementalKey: "first_treatment_timing", inputType: "select", options: treatmentTimingOptions },
    { key: "first_treatment_facility", prompt: "What was the name of the hospital or medical facility where you were first treated?", anchorFieldName: "medical_attention", supplementalKey: "first_treatment_facility" },
    { key: "doctor_name", prompt: "Do you remember the doctor's name who treated you?", anchorFieldName: "medical_attention", supplementalKey: "doctor_name" },
    { key: "tests_completed", prompt: "What kind of tests did they do - X-rays, MRI, or CT scan?", anchorFieldName: "medical_attention", supplementalKey: "tests_completed" },
    { key: "currently_receiving_treatment", prompt: "Are you currently receiving treatment for your injuries?", anchorFieldName: "medical_attention", supplementalKey: "currently_receiving_treatment", inputType: "select", options: yesNoOptions },
    { key: "treatment_type", prompt: "What type of treatment - physical therapy, chiropractic, pain management, or surgery?", fieldName: "medical_attention", fullWidth: true },
    { key: "appointment_frequency", prompt: "How often do you have appointments - weekly or twice a week?", anchorFieldName: "medical_attention", supplementalKey: "appointment_frequency" },
    { key: "work_impact", prompt: "Are you able to work, or have your injuries prevented you from working?", anchorFieldName: "medical_attention", supplementalKey: "work_impact", inputType: "select", options: workImpactOptions },
    { key: "medical_treatment_proof", prompt: "Medical treatment proof available", customFieldKey: "medical_treatment_proof" },
  ],
  prior_attorney: [
    { key: "prior_attorney_involved", prompt: "Have you hired or spoken with any attorney about this accident?", fieldName: "prior_attorney_involved" },
    { key: "consulted_law_firms", prompt: "After the accident, did you call or consult with any law firms to get advice?", anchorFieldName: "prior_attorney_involved", supplementalKey: "consulted_law_firms", inputType: "select", options: yesNoOptions },
    { key: "signed_paperwork", prompt: "Did you sign any paperwork or agreements with anyone related to the accident?", anchorFieldName: "prior_attorney_involved", supplementalKey: "signed_paperwork", inputType: "select", options: yesNoOptions },
    { key: "received_letters", prompt: "Have you received any letters or calls from law firms about your case?", anchorFieldName: "prior_attorney_involved", supplementalKey: "received_letters", inputType: "select", options: yesNoOptions },
    { key: "helped_contact_us", prompt: "Did anyone help you with contacting us today - like a referral service or legal referral?", anchorFieldName: "prior_attorney_involved", supplementalKey: "helped_contact_us", inputType: "select", options: yesNoOptions },
    { key: "claims_filed", prompt: "Has anyone filed any claims or demands with the insurance company on your behalf?", anchorFieldName: "prior_attorney_involved", supplementalKey: "claims_filed", inputType: "select", options: yesNoOptions },
    { key: "prior_attorney_details", prompt: "Previous law firm details, sign date, end date, and release status", fieldName: "prior_attorney_details", fullWidth: true },
  ],
  compensation_settlement: [
    { key: "received_money_compensation", prompt: "Have you received any money or compensation related to this accident?", anchorFieldName: "additional_notes", supplementalKey: "received_money_compensation", inputType: "select", options: yesNoOptions },
    { key: "settlement_offer", prompt: "Has the insurance company offered you any settlement?", anchorFieldName: "additional_notes", supplementalKey: "settlement_offer", inputType: "select", options: yesNoOptions },
    { key: "signed_release_forms", prompt: "Have you signed any release forms or settlement agreements?", anchorFieldName: "additional_notes", supplementalKey: "signed_release_forms", inputType: "select", options: yesNoOptions },
    { key: "insurance_claims_filed", prompt: "Have you filed a claim with your own insurance or the other driver's insurance?", anchorFieldName: "additional_notes", supplementalKey: "insurance_claims_filed", inputType: "select", options: yesNoOptions },
  ],
  driver_vehicle: [
    { key: "insured", prompt: "Was the caller insured?", fieldName: "insured" },
    { key: "driver_license_reconfirm", prompt: "Your vehicle: driver's license number and state", fieldName: "driver_license" },
    { key: "vehicle_registration", prompt: "Your vehicle: plate number", fieldName: "vehicle_registration" },
    { key: "vehicle_make_model_year", prompt: "Your vehicle: make / model / year", anchorFieldName: "insured", supplementalKey: "vehicle_make_model_year" },
    { key: "vehicle_vin", prompt: "Your vehicle: VIN if available", anchorFieldName: "insured", supplementalKey: "vehicle_vin" },
    { key: "insurance_company", prompt: "Your vehicle: insurance company", fieldName: "insurance_company" },
    { key: "policy_number", prompt: "Your vehicle: policy number", anchorFieldName: "insured", supplementalKey: "policy_number" },
    { key: "other_driver_name", prompt: "Other vehicle: other driver's name if known", anchorFieldName: "insured", supplementalKey: "other_driver_name" },
    { key: "other_driver_insurance", prompt: "Other vehicle: other driver's insurance company", anchorFieldName: "insured", supplementalKey: "other_driver_insurance" },
    { key: "other_policy_number", prompt: "Other vehicle: other policy number if available", anchorFieldName: "insured", supplementalKey: "other_policy_number" },
    { key: "third_party_vehicle_registration", prompt: "Other vehicle: plate number / registration", fieldName: "third_party_vehicle_registration" },
    { key: "other_vehicle_make_model_color", prompt: "Other vehicle: make / model / color", anchorFieldName: "insured", supplementalKey: "other_vehicle_make_model_color" },
    { key: "passengers_count", prompt: "Passengers count", fieldName: "passengers_count" },
  ],
  documents_notes: [
    { key: "document_id", prompt: "Driver's license or government ID, front and back", anchorFieldName: "additional_notes", supplementalKey: "document_id", inputType: "select", options: yesNoOptions },
    { key: "document_police_report", prompt: "Police report if available", customFieldKey: "police_report" },
    { key: "document_insurance", prompt: "Insurance information and policy documents", customFieldKey: "insurance_documents" },
    { key: "document_medical_records", prompt: "Medical records from ER, doctor visits, and treatment notes", anchorFieldName: "additional_notes", supplementalKey: "document_medical_records", inputType: "select", options: yesNoOptions },
    { key: "document_medical_bills", prompt: "Medical bills related to treatment", anchorFieldName: "additional_notes", supplementalKey: "document_medical_bills", inputType: "select", options: yesNoOptions },
    { key: "document_accident_photos", prompt: "Accident photos, including vehicle damage, scene, and injuries if available", anchorFieldName: "additional_notes", supplementalKey: "document_accident_photos", inputType: "select", options: yesNoOptions },
    { key: "document_repair_estimates", prompt: "Repair estimates or receipts", anchorFieldName: "additional_notes", supplementalKey: "document_repair_estimates", inputType: "select", options: yesNoOptions },
    { key: "document_lost_wages", prompt: "Proof of lost wages, such as pay stubs or an employer letter", anchorFieldName: "additional_notes", supplementalKey: "document_lost_wages", inputType: "select", options: yesNoOptions },
    { key: "additional_notes", prompt: "Anything else the attorney should know before handoff?", fieldName: "additional_notes", inputType: "textarea", fullWidth: true },
  ],
};

interface VerificationPanelProps {
  sessionId: string;
  onTransferReady?: () => void;
  onFieldVerified?: (fieldName: string, value: string, checked: boolean) => void;
  linkedSectionEyebrow?: string;
}

export const VerificationPanel = ({ sessionId, onTransferReady, onFieldVerified, linkedSectionEyebrow }: VerificationPanelProps) => {
  // Helper to get lead data from verificationItems
  const getLeadData = () => {
    const leadData: Record<string, string> = {};
    if (verificationItems) {
      verificationItems.forEach(item => {
        if (['lead_vendor', 'customer_full_name', 'phone_number', 'email'].includes(item.field_name)) {
          leadData[item.field_name] = inputValues[item.id] || item.original_value || '';
        }
      });
    }
    return leadData;
  };
  const { toast } = useToast();

  // Copy notes logic - matches DetailedLeadInfoCard format
  const copyNotesToClipboard = () => {
    if (!verificationItems) return;

    // Create a map of field values for easy lookup
    const fieldValues: Record<string, string> = {};
    verificationItems.forEach(item => {
      fieldValues[item.field_name] = inputValues[item.id] || item.original_value || 'N/A';
    });

    // Format notes in the exact sequence from leads table
    const notesText = [
      `Lead Vendor: ${fieldValues.lead_vendor || 'N/A'}`,
      `Customer Name: ${fieldValues.customer_full_name || 'N/A'}`,
      ``,
      `PERSONAL INFORMATION:`,
      `Date of Birth: ${fieldValues.date_of_birth || 'N/A'}`,
      `Age: ${fieldValues.age || 'N/A'}`,
      `Birth State: ${fieldValues.birth_state || 'N/A'}`,
      `Social Security: ${fieldValues.social_security || 'N/A'}`,
      `Driver License: ${fieldValues.driver_license || 'N/A'}`,
      ``,
      `CONTACT INFORMATION:`,
      `Address: ${fieldValues.street_address || ''} ${fieldValues.city || ''}, ${fieldValues.state || ''} ${fieldValues.zip_code || ''}`,
      `Phone: ${fieldValues.phone_number || 'N/A'}`,
      `Email: ${fieldValues.email || 'N/A'}`,
      ``,
      `ACCIDENT/INCIDENT INFORMATION:`,
      `Accident Date: ${fieldValues.accident_date || 'N/A'}`,
      `Accident Location: ${fieldValues.accident_location || 'N/A'}`,
      `Accident Scenario: ${fieldValues.accident_scenario || 'N/A'}`,
      `Injuries: ${fieldValues.injuries || 'N/A'}`,
      `Medical Attention: ${fieldValues.medical_attention || 'N/A'}`,
      `Police Attended: ${fieldValues.police_attended === 'true' ? 'Yes' : 'No'}`,
      `Insured: ${fieldValues.insured === 'true' ? 'Yes' : 'No'}`,
      `Vehicle Registration: ${fieldValues.vehicle_registration || 'N/A'}`,
      `Insurance Company: ${fieldValues.insurance_company || 'N/A'}`,
      `Third Party Vehicle Registration: ${fieldValues.third_party_vehicle_registration || 'N/A'}`,
      `Other Party Admit Fault: ${fieldValues.other_party_admit_fault === 'true' ? 'Yes' : 'No'}`,
      `Passengers Count: ${fieldValues.passengers_count || '0'}`,
      `Prior Attorney Involved: ${fieldValues.prior_attorney_involved === 'true' ? 'Yes' : 'No'}`,
      `Prior Attorney Details: ${fieldValues.prior_attorney_details || 'N/A'}`,
      ``,
      `WITNESS/CONTACT INFORMATION:`,
      `Contact Name: ${fieldValues.contact_name || 'N/A'}`,
      `Contact Number: ${fieldValues.contact_number || 'N/A'}`,
      `Contact Address: ${fieldValues.contact_address || 'N/A'}`,
      ``,
      `ADDITIONAL NOTES:`,
      `${fieldValues.additional_notes || 'N/A'}`
    ].join('\n');

    navigator.clipboard.writeText(notesText);
    toast({
      title: "Copied!",
      description: "Lead information copied to clipboard in standard format",
    });
  };
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const [notes, setNotes] = useState("");
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [openStepSections, setOpenStepSections] = useState<Record<string, boolean>>({
    basic_information: true,
  });
  const [supplementalAnswers, setSupplementalAnswers] = useState<Record<string, Record<string, string>>>({});
  const [customItems, setCustomItems] = useState<Record<string, VerificationItem | null>>({
    medical_treatment_proof: null,
    insurance_documents: null,
    police_report: null,
  });
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  const {
    session,
    verificationItems,
    loading,
    error,
    toggleVerification,
    updateVerifiedValue,
    updateVerificationNotes,
    updateSessionStatus,
    refetch,
  } = useRealtimeVerification(sessionId);

  useEffect(() => {
    // Update elapsed time every second
    const interval = setInterval(() => {
      if (session?.started_at) {
        const start = new Date(session.started_at);
        const now = new Date();
        const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        setElapsedTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.started_at]);

  // Initialize input values when verification items change
  useEffect(() => {
    if (verificationItems) {
      setInputValues((prev) => {
        const next = { ...prev };
        verificationItems.forEach((item) => {
          if (!(item.id in next)) {
            next[item.id] = item.verified_value || item.original_value || '';
          }
        });
        return next;
      });

      const nextCustomItems: Record<string, VerificationItem | null> = {
        medical_treatment_proof: null,
        insurance_documents: null,
        police_report: null,
      };

      verificationItems.forEach((item) => {
        if (item.field_name === 'medical_treatment_proof') nextCustomItems.medical_treatment_proof = item;
        if (item.field_name === 'insurance_documents') nextCustomItems.insurance_documents = item;
        if (item.field_name === 'police_report') nextCustomItems.police_report = item;
      });

      setCustomItems(nextCustomItems);
    }
  }, [verificationItems]);

  useEffect(() => {
    if (!verificationItems) return;

    setSupplementalAnswers((prev) => {
      const next = { ...prev };

      verificationItems.forEach((item) => {
        if (!item.notes || next[item.field_name]) return;

        try {
          const parsed = JSON.parse(item.notes);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            next[item.field_name] = Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])
            );
          }
        } catch {
          // Ignore legacy plain-text notes and only hydrate structured prompt data.
        }
      });

      return next;
    });
  }, [verificationItems]);

  useEffect(() => {
    if (!linkedSectionEyebrow) return;
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) return;

    const linkedStep = verificationStepDefinitions.find((step) => step.eyebrow === linkedSectionEyebrow);
    if (!linkedStep) return;

    setOpenStepSections((prev) => ({
      ...prev,
      [linkedStep.key]: true,
    }));

    requestAnimationFrame(() => {
      const container = panelScrollRef.current;
      const target = stepRefs.current[linkedStep.key];
      if (!container || !target) return;

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - 12;

      container.scrollTo({
        top: Math.max(0, nextTop),
        behavior: "smooth",
      });
    });
  }, [linkedSectionEyebrow]);

  const upsertCustomVerificationItem = async (fieldName: 'medical_treatment_proof' | 'insurance_documents' | 'police_report', updates: { verified_value?: string; is_verified?: boolean }) => {
    const existing = customItems[fieldName];

    if (existing?.id) {
      const nextUpdates: Partial<VerificationItem> = {};
      if (typeof updates.verified_value !== 'undefined') {
        nextUpdates.verified_value = updates.verified_value;
        nextUpdates.is_modified = existing.original_value !== updates.verified_value;
      }
      if (typeof updates.is_verified !== 'undefined') {
        nextUpdates.is_verified = updates.is_verified;
        nextUpdates.verified_at = updates.is_verified ? new Date().toISOString() : null;
      }

      const { data } = await supabase
        .from('verification_items')
        .update({
          ...nextUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (data) {
        setCustomItems((prev) => ({ ...prev, [fieldName]: data as VerificationItem }));
        setInputValues((prev) => ({
          ...prev,
          [String((data as VerificationItem).id)]: (data as VerificationItem).verified_value || '',
        }));
      }

      return;
    }

    const insertPayload: Database['public']['Tables']['verification_items']['Insert'] = {
      session_id: sessionId,
      field_name: fieldName,
      field_category: 'additional',
      original_value: '',
      verified_value: typeof updates.verified_value !== 'undefined' ? updates.verified_value : '',
      is_verified: Boolean(updates.is_verified),
      is_modified: true,
      verified_at: updates.is_verified ? new Date().toISOString() : null,
    };

    const { data } = await supabase
      .from('verification_items')
      .upsert(insertPayload, { onConflict: 'session_id,field_name' })
      .select()
      .single();

    if (data) {
      setCustomItems((prev) => ({ ...prev, [fieldName]: data as VerificationItem }));
      setInputValues((prev) => ({
        ...prev,
        [String((data as VerificationItem).id)]: (data as VerificationItem).verified_value || '',
      }));
    }
  };

  // Add early returns for loading and error states AFTER all hooks
  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-gray-500">Loading verification data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-red-500">
            Error: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-gray-500">
            No verification session found
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleFieldValueChange = (itemId: string, newValue: string) => {
    // Update local state immediately for smooth UI
    setInputValues(prev => ({
      ...prev,
      [itemId]: newValue
    }));

    if (onFieldVerified && verificationItems) {
      const item = verificationItems.find((v) => v.id === itemId);
      if (item) {
        onFieldVerified(item.field_name, newValue, Boolean(item.is_verified));
      }
    }
    
    // Debounce the database update
    setTimeout(() => {
      updateVerifiedValue(itemId, newValue);
    }, 500);
  };

  const handleCheckboxChange = (itemId: string, checked: boolean) => {
    toggleVerification(itemId, checked);

    if (!onFieldVerified || !verificationItems) return;

    const item = verificationItems.find(v => v.id === itemId);
    if (!item) return;

    const value = inputValues[itemId] || item.verified_value || item.original_value || '';
    onFieldVerified(item.field_name, value, checked);
  };

  const handleTransferToLA = async () => {
    await updateSessionStatus('transferred');
    
    // Log the transfer event for buffer agents
    if (session?.buffer_agent_id) {
      const { customerName, leadVendor } = await getLeadInfo(session.submission_id);
      const { data: bufferAgentProfile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', session.buffer_agent_id)
        .single();

      await logCallUpdate({
        submissionId: session.submission_id,
        agentId: session.buffer_agent_id,
        agentType: 'buffer',
        agentName: bufferAgentProfile?.display_name || 'Buffer Agent',
        eventType: 'transferred_to_la',
        eventDetails: {
          verification_session_id: session.id,
          transferred_at: new Date().toISOString()
        },
        verificationSessionId: session.id,
        customerName,
        leadVendor
      });
    }
    
    onTransferReady?.();
  };

  // Calculate real-time progress percentage
  const calculateProgress = () => {
    if (!verificationItems || verificationItems.length === 0) return 0;
    const verifiedCount = verificationItems.filter(item => item.is_verified).length;
    return Math.round((verifiedCount / verificationItems.length) * 100);
  };

  const currentProgress = calculateProgress();

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-500';
      case 'in_progress': return 'bg-black';
      case 'claimed': return 'bg-purple-500';
      case 'ready_for_transfer': return 'bg-green-500';
      case 'transferred': return 'bg-orange-500';
      case 'completed': return 'bg-emerald-500';
      default: return 'bg-gray-500';
    }
  };

  const getFieldIcon = (item: VerificationItem) => {
    if (!item.is_verified) return <XCircle className="h-4 w-4 text-gray-400" />;
    if (item.is_modified) return <CheckCircle className="h-4 w-4 text-blue-500" />;
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  // Sort items by custom order, then group by category for display
  const sortedItems = (verificationItems || []).slice().sort((a, b) => {
    const aIdx = customFieldOrder.indexOf(a.field_name);
    const bIdx = customFieldOrder.indexOf(b.field_name);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  const formatFieldName = (fieldName: string) => {
    return fieldName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getFieldDisplayLabel = (fieldName: string) => {
    return fieldPromptLabels[fieldName] || formatFieldName(fieldName);
  };

  // Determine field type
  const getFieldType = (fieldName: string): 'boolean' | 'longText' | 'text' => {
    // Boolean fields
    const booleanFields = [
      'police_attended',
      'insured',
      'other_party_admit_fault',
      'prior_attorney_involved',
      'medical_treatment_proof',
      'insurance_documents',
      'police_report'
    ];
    
    // Long text fields
    const longTextFields = [
      'accident_scenario',
      'injuries',
      'medical_attention',
      'prior_attorney_details',
      'additional_notes'
    ];
    
    if (booleanFields.includes(fieldName)) return 'boolean';
    if (longTextFields.includes(fieldName)) return 'longText';
    return 'text';
  };

  // Render field input based on type
  const renderFieldInput = (item: VerificationItem) => {
    const fieldType = getFieldType(item.field_name);
    const value = inputValues[item.id] || '';

    if (fieldType === 'boolean') {
      return (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleFieldValueChange(item.id, 'true')}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
              value === 'true'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 hover:border-green-300 bg-white'
            }`}
          >
            <Check className={`h-5 w-5 ${value === 'true' ? 'text-green-600' : 'text-gray-400'}`} />
            <span className="font-medium">Yes</span>
          </button>
          <button
            onClick={() => handleFieldValueChange(item.id, 'false')}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
              value === 'false'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-200 hover:border-red-300 bg-white'
            }`}
          >
            <X className={`h-5 w-5 ${value === 'false' ? 'text-red-600' : 'text-gray-400'}`} />
            <span className="font-medium">No</span>
          </button>
        </div>
      );
    }

    if (fieldType === 'longText') {
      return (
        <Textarea
          value={value}
          onChange={(e) => handleFieldValueChange(item.id, e.target.value)}
          placeholder={`Enter ${formatFieldName(item.field_name).toLowerCase()}`}
          className="text-sm min-h-[100px] resize-y"
          rows={4}
        />
      );
    }

    return (
      <Input
        value={value}
        onChange={(e) => handleFieldValueChange(item.id, e.target.value)}
        placeholder={`Enter ${formatFieldName(item.field_name).toLowerCase()}`}
        className="text-xs"
      />
    );
  };

  const itemByFieldName = (() => {
    const map = new Map<string, VerificationItem>();
    sortedItems.forEach((item) => map.set(item.field_name, item));
    return map;
  })();

  const getItemValue = (item: VerificationItem | null | undefined) =>
    item ? (inputValues[item.id] || item.verified_value || item.original_value || "") : "";

  const getFieldValue = (fieldName: string) => getItemValue(itemByFieldName.get(fieldName));
  const leadVendor = getFieldValue("lead_vendor");

  const getCustomItemValue = (fieldName: "medical_treatment_proof" | "insurance_documents" | "police_report") => {
    const item = customItems[fieldName];
    return item ? (inputValues[item.id] || item.verified_value || item.original_value || "") : "";
  };

  const isAffirmative = (value: string) => value === "true" || value === "yes";
  const hasAnswer = (value: string) => value.trim().length > 0;

  const updateSupplementalAnswer = async (fieldName: string, answerKey: string, nextValue: string) => {
    const item = itemByFieldName.get(fieldName);
    if (!item?.id) return;

    const nextAnswers = {
      ...(supplementalAnswers[fieldName] || {}),
      [answerKey]: nextValue,
    };

    setSupplementalAnswers((prev) => ({
      ...prev,
      [fieldName]: nextAnswers,
    }));

    await updateVerificationNotes(item.id, JSON.stringify(nextAnswers));
  };

  const getVisibleBindings = (stepKey: string) => {
    const bindings = stepQuestionBindings[stepKey] || [];

    return bindings.filter((binding) => {
      if (stepKey === "accident_location" && binding.key === "passenger_relationship") {
        return supplementalAnswers.accident_location?.driver_or_passenger === "passenger";
      }

      if (stepKey === "fault_liability" && binding.key === "ticket_recipient") {
        return supplementalAnswers.other_party_admit_fault?.traffic_citation === "yes";
      }

      if (stepKey === "police_report") {
        if (!isAffirmative(getFieldValue("police_attended"))) return false;
        if (binding.key === "report_case_number") {
          return supplementalAnswers.police_attended?.report_filed === "yes";
        }
      }

      if (stepKey === "injury_verification" && binding.key === "first_treatment_timing") {
        return supplementalAnswers.medical_attention?.hospital_direct === "no";
      }

      if (stepKey === "prior_attorney" && binding.key === "prior_attorney_details") {
        const priorAttorneyInvolved = getFieldValue("prior_attorney_involved");
        const supplemental = supplementalAnswers.prior_attorney_involved || {};
        return isAffirmative(priorAttorneyInvolved) || Object.values(supplemental).some((value) => value === "yes");
      }

      if (stepKey === "driver_vehicle" && binding.key !== "insured") {
        return isAffirmative(getFieldValue("insured"));
      }

      return true;
    });
  };

  const getBindingValue = (binding: StepQuestionBinding) => {
    if (binding.fieldName) return getFieldValue(binding.fieldName);
    if (binding.customFieldKey) return getCustomItemValue(binding.customFieldKey);
    if (binding.anchorFieldName && binding.supplementalKey) {
      return supplementalAnswers[binding.anchorFieldName]?.[binding.supplementalKey] || "";
    }
    return "";
  };

  const getStepQuestionProgress = (stepKey: string) => {
    const visibleBindings = getVisibleBindings(stepKey);
    const answered = visibleBindings.filter((binding) => hasAnswer(getBindingValue(binding))).length;
    return { total: visibleBindings.length, answered };
  };

  const renderVerificationRow = (item: VerificationItem) => (
    <div key={item.id} className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2">
        {getFieldIcon(item)}
        <Label className="text-xs font-medium">
          {getFieldDisplayLabel(item.field_name)}
        </Label>
        <Checkbox
          checked={item.is_verified}
          onCheckedChange={(checked) =>
            handleCheckboxChange(item.id, checked as boolean)
          }
          className="ml-auto"
        />
      </div>
      {renderFieldInput(item)}
    </div>
  );

  const renderCustomBooleanField = (
    key: "medical_treatment_proof" | "insurance_documents" | "police_report",
    label: string,
    fullWidth = false
  ) => {
    const item = customItems[key];
    const value = item?.id ? (inputValues[item.id] || "") : (item?.verified_value || item?.original_value || "");
    const checked = Boolean(item?.is_verified);

    return (
      <div key={key} className={`space-y-2 rounded-lg border bg-background p-3 ${fullWidth ? "md:col-span-2" : ""}`}>
        <div className="flex items-center gap-2">
          {item ? getFieldIcon(item) : <XCircle className="h-4 w-4 text-gray-400" />}
          <Label className="text-xs font-medium">{label}</Label>
          <Checkbox
            checked={checked}
            onCheckedChange={async (nextChecked) => {
              const boolChecked = Boolean(nextChecked);
              if (item?.id) {
                handleCheckboxChange(item.id, boolChecked);
              } else {
                await upsertCustomVerificationItem(key, { is_verified: boolChecked, verified_value: value || "" });
                if (onFieldVerified) onFieldVerified(key, value || "", boolChecked);
              }
            }}
            className="ml-auto"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={async () => {
              if (item?.id) {
                handleFieldValueChange(item.id, "true");
              } else {
                await upsertCustomVerificationItem(key, { verified_value: "true" });
              }
            }}
            className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
              value === "true"
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-gray-200 bg-white hover:border-green-300"
            }`}
          >
            <Check className={`h-5 w-5 ${value === "true" ? "text-green-600" : "text-gray-400"}`} />
            <span className="font-medium">Yes</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              if (item?.id) {
                handleFieldValueChange(item.id, "false");
              } else {
                await upsertCustomVerificationItem(key, { verified_value: "false" });
              }
            }}
            className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-all ${
              value === "false"
                ? "border-red-500 bg-red-50 text-red-700"
                : "border-gray-200 bg-white hover:border-red-300"
            }`}
          >
            <X className={`h-5 w-5 ${value === "false" ? "text-red-600" : "text-gray-400"}`} />
            <span className="font-medium">No</span>
          </button>
        </div>
      </div>
    );
  };

  const renderSupplementalInput = (binding: StepQuestionBinding) => {
    if (!binding.anchorFieldName || !binding.supplementalKey) return null;

    const value = supplementalAnswers[binding.anchorFieldName]?.[binding.supplementalKey] || "";

    if (binding.inputType === "select" && binding.options) {
      return (
        <Select
          value={value}
          onValueChange={(nextValue) => void updateSupplementalAnswer(binding.anchorFieldName!, binding.supplementalKey!, nextValue)}
        >
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="Select an answer" />
          </SelectTrigger>
          <SelectContent>
            {binding.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (binding.inputType === "textarea") {
      return (
        <Textarea
          value={value}
          onChange={(event) => void updateSupplementalAnswer(binding.anchorFieldName!, binding.supplementalKey!, event.target.value)}
          placeholder="Capture the caller's answer"
          className="text-sm min-h-[100px] resize-y"
          rows={4}
        />
      );
    }

    return (
      <Input
        value={value}
        onChange={(event) => void updateSupplementalAnswer(binding.anchorFieldName!, binding.supplementalKey!, event.target.value)}
        placeholder="Capture the caller's answer"
        className="text-xs"
      />
    );
  };

  const renderQuestionBinding = (binding: StepQuestionBinding) => {
    if (binding.fieldName) {
      const item = itemByFieldName.get(binding.fieldName);
      if (!item) return null;

      return (
        <div key={binding.key} className={`space-y-2 rounded-lg border bg-background p-3 ${binding.fullWidth ? "md:col-span-2" : ""}`}>
          <div className="flex items-start gap-2">
            {getFieldIcon(item)}
            <Label className="text-xs font-medium leading-5">{binding.prompt}</Label>
            <Checkbox
              checked={item.is_verified}
              onCheckedChange={(checked) => handleCheckboxChange(item.id, checked as boolean)}
              className="ml-auto mt-0.5"
            />
          </div>
          {renderFieldInput(item)}
        </div>
      );
    }

    if (binding.customFieldKey) {
      return renderCustomBooleanField(binding.customFieldKey, binding.prompt, Boolean(binding.fullWidth));
    }

    return (
      <div key={binding.key} className={`space-y-2 rounded-lg border bg-background p-3 ${binding.fullWidth ? "md:col-span-2" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <Label className="text-xs font-medium leading-5">{binding.prompt}</Label>
          <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px] font-medium">
            Script
          </Badge>
        </div>
        {renderSupplementalInput(binding)}
      </div>
    );
  };

  const renderStepSection = (step: VerificationStepDefinition) => {
    const stepBindings = getVisibleBindings(step.key);
    const visibleFields = step.fieldNames.filter((fieldName) => {
      if (step.key === "police_report" && fieldName === "police_report" && !isAffirmative(getFieldValue("police_attended"))) {
        return false;
      }

      if (
        step.key === "driver_vehicle" &&
        ["driver_license", "insurance_company", "vehicle_registration", "third_party_vehicle_registration", "passengers_count"].includes(fieldName) &&
        !isAffirmative(getFieldValue("insured"))
      ) {
        return false;
      }

      if (step.key === "prior_attorney" && fieldName === "prior_attorney_details" && !isAffirmative(getFieldValue("prior_attorney_involved"))) {
        return false;
      }

      if (fieldName in customItems) return true;
      return itemByFieldName.has(fieldName);
    });

    const boundFieldNames = new Set(stepBindings.flatMap((binding) => (binding.fieldName ? [binding.fieldName] : [])));
    const boundCustomFields = new Set(
      stepBindings.flatMap((binding) => (binding.customFieldKey ? [binding.customFieldKey] : []))
    );
    const remainingFields = visibleFields.filter(
      (fieldName) => !boundFieldNames.has(fieldName) && !boundCustomFields.has(fieldName as "medical_treatment_proof" | "insurance_documents" | "police_report")
    );
    const shouldShowConditionalHelper =
      (step.key === "police_report" && !isAffirmative(getFieldValue("police_attended"))) ||
      (step.key === "driver_vehicle" && !isAffirmative(getFieldValue("insured")));

    if (stepBindings.length === 0 && remainingFields.length === 0 && !shouldShowConditionalHelper) return null;

    const { total, answered } = getStepQuestionProgress(step.key);
    const isOpen = openStepSections[step.key] ?? step.key === "basic_information";
    const isLinkedStep = linkedSectionEyebrow === step.eyebrow;

    return (
      <div
        key={step.key}
        ref={(element) => {
          stepRefs.current[step.key] = element;
        }}
      >
        <Collapsible
          open={isOpen}
          onOpenChange={(open) => setOpenStepSections((prev) => ({ ...prev, [step.key]: open }))}
        >
          <div
            className={`rounded-lg border transition-all ${
              isLinkedStep
                ? "border-[#cb6a2a]/45 bg-[linear-gradient(180deg,rgba(253,224,196,0.8)_0%,rgba(255,247,240,0.92)_100%)] shadow-[0_14px_30px_-22px_rgba(203,106,42,0.5)]"
                : "border-border/60 bg-card"
            }`}
          >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                isLinkedStep ? "hover:bg-orange-100/60" : "hover:bg-muted/20"
              }`}
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {step.eyebrow}
                  </span>
                  {total > 0 ? (
                    <span className={`text-[10px] font-semibold tabular-nums ${answered === total && total > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {answered}/{total}
                    </span>
                  ) : null}
                  {isLinkedStep ? (
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  ) : null}
                </div>
                <h3 className="text-[13px] font-semibold text-foreground leading-snug">{step.title}</h3>
              </div>
              <div className="mt-0.5 shrink-0 text-muted-foreground">
                {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div
              className={`space-y-3 border-t px-4 pb-3.5 pt-3 ${
                isLinkedStep ? "border-[#cb6a2a]/18 bg-white/40" : "border-border/40"
              }`}
            >
              {stepBindings.length ? (
                <div className="space-y-3">
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {stepBindings.map((binding) => renderQuestionBinding(binding))}
                  </div>
                </div>
              ) : null}

              {step.key === "police_report" && !isAffirmative(getFieldValue("police_attended")) ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">
                    Waiting On Step 5
                  </div>
                  <p className="mt-1 text-xs leading-5 text-sky-950">
                    Set "Did the police come to the scene?" to Yes in the fault section and the full police-report questionnaire opens here automatically.
                  </p>
                </div>
              ) : null}

              {step.key === "driver_vehicle" && !isAffirmative(getFieldValue("insured")) ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                    Waiting On Insured Status
                  </div>
                  <p className="mt-1 text-xs leading-5 text-emerald-950">
                    Once "Was the caller insured?" is answered Yes, the vehicle and insurance follow-up questions expand in the same order as the script.
                  </p>
                </div>
              ) : null}

              {remainingFields.length ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Supporting Verified Fields
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      These stay available so no existing verification data or workflow logic is lost.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {remainingFields.map((fieldName) => {
                      if (fieldName in customItems) {
                        const customLabel = getFieldDisplayLabel(fieldName);
                        return renderCustomBooleanField(
                          fieldName as "medical_treatment_proof" | "insurance_documents" | "police_report",
                          customLabel
                        );
                      }

                      const item = itemByFieldName.get(fieldName);
                      return item ? renderVerificationRow(item) : null;
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
          </div>
        </Collapsible>
      </div>
    );
  };

  const progressStatusText = currentProgress >= 76 ? "Ready for Transfer" :
    currentProgress >= 51 ? "Nearly Complete" :
    currentProgress >= 26 ? "In Progress" : "Just Started";

  const progressColor = currentProgress >= 76 ? "text-emerald-100" :
    currentProgress >= 51 ? "text-amber-100" :
    currentProgress >= 26 ? "text-orange-100" : "text-rose-100";

  const footerButtonBaseClass =
    "h-9 rounded-md border px-4 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-all";

  const footerNeutralButtonClass = `${footerButtonBaseClass} border-emerald-950/20 bg-emerald-900/90 text-emerald-50 hover:bg-emerald-950 hover:text-white`;
  const footerDestructiveButtonClass = `${footerButtonBaseClass} border-rose-200/20 bg-rose-950/45 text-rose-50 hover:bg-rose-950/60 hover:text-white`;
  const footerPrimaryButtonClass = `${footerButtonBaseClass} border-[#ffd7bf]/50 bg-[#fff1e6] text-[#6e391c] hover:bg-[#ffe6d4] hover:text-[#562816]`;
  const footerCloserTransferButtonClass = `${footerButtonBaseClass} border-[#ffd7bf]/55 bg-[#fff1e6] text-[#6e391c] hover:border-[#f29a61]/70 hover:bg-[#f7b07a] hover:text-[#4b1f07]`;

  return (
    <Card
      className="flex min-h-[30rem] flex-col overflow-hidden border-border/60 shadow-sm lg:h-[calc(100dvh-8rem)]"
    >
      <div className="flex-shrink-0 space-y-0 border-b border-orange-950/30 bg-[linear-gradient(90deg,#cb6a2a_0%,#a85221_52%,#724020_100%)] text-orange-50">
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="h-4 w-4 text-orange-100" />
            <span className="text-sm font-bold tracking-tight text-white">Verification</span>
            <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] font-semibold ${getStatusBadgeColor(session.status)} text-white border-0`}>
              {session.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="hidden items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] text-orange-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm sm:flex">
              <Clock className="h-3 w-3" />
              {elapsedTime}
            </div>
            <Button onClick={copyNotesToClipboard} variant="ghost" size="sm" className="h-7 gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 text-xs text-orange-50/90 hover:bg-white/12 hover:text-white">
              <Copy className="h-3 w-3" />
              Copy
            </Button>
          </div>
        </div>

        <div className="px-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <ColoredProgress value={currentProgress} className="h-2 transition-all duration-500" />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium tabular-nums shrink-0">
              <span className={progressColor}>{currentProgress}%</span>
              <span className="text-orange-50/75">
                {verificationItems.filter(item => item.is_verified).length}/{verificationItems.length}
              </span>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${progressColor}`}>
              {progressStatusText}
            </span>
            {linkedSectionEyebrow ? (
              <span className="truncate max-w-[60%] text-right text-[10px] font-medium text-orange-50/90">
                Following: {linkedSectionEyebrow}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <CardContent ref={panelScrollRef} className="space-y-3 flex-1 min-h-0 overflow-y-auto overscroll-y-none pt-4">
        <div className="rounded-lg border border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,244,236,0.95)_0%,rgba(255,250,246,0.92)_100%)] px-4 py-3 shadow-[0_10px_24px_-20px_rgba(203,106,42,0.55)]">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-orange-300/80 bg-white/70 px-2 py-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a85221]"
            >
              Lead Vendor
            </Badge>
            <span className="text-sm font-semibold text-foreground">
              {leadVendor || "Not available"}
            </span>
          </div>
        </div>

        {verificationStepDefinitions.map((step) => renderStepSection(step))}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional notes about the verification..."
            className="text-xs"
            rows={3}
          />
        </div>
      </CardContent>

        <div className="flex-shrink-0 border-t border-orange-950/30 bg-[linear-gradient(90deg,#cb6a2a_0%,#a85221_52%,#724020_100%)] px-5 py-3 text-orange-50">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Buffer Agent Buttons - Show if no licensed agent is assigned */}
            {!session.licensed_agent_id && (
              <>
                <Button
                  variant="ghost"
                  className={footerDestructiveButtonClass}
                  onClick={async () => {
                    await updateSessionStatus('call_dropped');
                    const leadData = getLeadData();
                    
                    // Get agent profile information
                    let agentProfile = null;
                    let agentType = 'buffer';
                    
                    if (session?.buffer_agent_id) {
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('display_name')
                        .eq('user_id', session.buffer_agent_id)
                        .single();
                      agentProfile = profile;
                      agentType = 'buffer';
                    } else if (session?.licensed_agent_id) {
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('display_name')
                        .eq('user_id', session.licensed_agent_id)
                        .single();
                      agentProfile = profile;
                      agentType = 'licensed';
                    }
                    
                    // Log the call dropped event
                    if (session?.buffer_agent_id) {
                      const { customerName, leadVendor } = await getLeadInfo(session.submission_id);

                      await logCallUpdate({
                        submissionId: session.submission_id,
                        agentId: session.buffer_agent_id,
                        agentType: 'buffer',
                        agentName: agentProfile?.display_name || 'Buffer Agent',
                        eventType: 'call_dropped',
                        eventDetails: {
                          verification_session_id: session.id,
                          dropped_at: new Date().toISOString()
                        },
                        verificationSessionId: session.id,
                        customerName,
                        leadVendor
                      });
                    } else if (session?.licensed_agent_id) {
                      const { customerName, leadVendor } = await getLeadInfo(session.submission_id);

                      await logCallUpdate({
                        submissionId: session.submission_id,
                        agentId: session.licensed_agent_id,
                        agentType: 'licensed',
                        agentName: agentProfile?.display_name || 'Licensed Agent',
                        eventType: 'call_dropped',
                        eventDetails: {
                          verification_session_id: session.id,
                          dropped_at: new Date().toISOString()
                        },
                        verificationSessionId: session.id,
                        customerName,
                        leadVendor
                      });
                    }
                    
                    // Send notification to center
                    await supabase.functions.invoke('center-transfer-notification', {
                      body: {
                        type: 'call_dropped',
                        submissionId: session.submission_id,
                        leadData
                      }
                    });

                    // Send disconnected call notification
                    const agentInfo = agentType === 'buffer' ? 
                      { buffer_agent: agentProfile?.display_name || 'Buffer Agent' } : 
                      { agent_who_took_call: agentProfile?.display_name || 'Licensed Agent' };

                    await supabase.functions.invoke('disconnected-call-notification', {
                      body: {
                        submissionId: session.submission_id,
                        leadData: {
                          customer_full_name: leadData.customer_full_name,
                          phone_number: leadData.phone_number,
                          email: leadData.email,
                          lead_vendor: leadData.lead_vendor
                        },
                        callResult: {
                          status: "Call Dropped",
                          notes: `Call dropped during verification session. Agent: ${agentProfile?.display_name || (agentType === 'buffer' ? 'Buffer Agent' : 'Licensed Agent')}`,
                          call_source: "Verification Session",
                          ...agentInfo
                        }
                      }
                    });

                    alert(`Call with ${leadData.customer_full_name || 'client'} dropped. Need to reconnect.`);
                    toast({
                      title: 'Call Dropped',
                      description: `Call with ${leadData.customer_full_name || 'client'} dropped. Need to reconnect.`
                    });
                    refetch();
                  }}
                >
                  <PhoneOff className="mr-1.5 h-3.5 w-3.5" />
                  Call Dropped
                </Button>
                <Button
                  variant="ghost"
                  className={footerNeutralButtonClass}
                  onClick={async () => {
                    await updateSessionStatus('buffer_done');
                    toast({
                      title: 'Call Done',
                      description: 'Buffer agent is now free from the call.'
                    });
                    refetch();
                  }}
                >
                  <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                  Call Done
                </Button>
                <Button
                  variant="ghost"
                  className={footerPrimaryButtonClass}
                  onClick={async () => {
                    await updateSessionStatus('transferred');
                    // Send notification to center when LA claims the call
                    const leadData = getLeadData();
                    // You may need to pass bufferAgentName and licensedAgentName from props/context
                    await supabase.functions.invoke('center-transfer-notification', {
                      body: {
                        type: 'transfer_to_la',
                        submissionId: session.submission_id,
                        leadData,
                        bufferAgentName: 'Buffer Agent',
                        licensedAgentName: 'Licensed Agent'
                      }
                    });
                    onTransferReady?.();
                    refetch();
                  }}
                >
                  <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                  Transfer to LA
                </Button>
              </>
            )}
            {/* Licensed Agent Buttons - Show if licensed agent is assigned */}
            {session.licensed_agent_id && (
              <>
                <Button
                  variant="ghost"
                  className={footerDestructiveButtonClass}
                  onClick={async () => {
                    await updateSessionStatus('call_dropped');
                    const leadData = getLeadData();
                    await supabase.functions.invoke('center-transfer-notification', {
                      body: {
                        type: 'call_dropped',
                        submissionId: session.submission_id,
                        leadData
                      }
                    });

                    // Send disconnected call notification
                    const { data: licensedAgentProfile } = await supabase
                      .from('profiles')
                      .select('display_name')
                      .eq('user_id', session.licensed_agent_id)
                      .single();

                    await supabase.functions.invoke('disconnected-call-notification', {
                      body: {
                        submissionId: session.submission_id,
                        leadData: {
                          customer_full_name: leadData.customer_full_name,
                          phone_number: leadData.phone_number,
                          email: leadData.email,
                          lead_vendor: leadData.lead_vendor
                        },
                        callResult: {
                          status: "Call Dropped",
                          notes: `Call dropped during verification session. Agent: ${licensedAgentProfile?.display_name || 'Licensed Agent'}`,
                          call_source: "Verification Session",
                          agent_who_took_call: licensedAgentProfile?.display_name || 'Licensed Agent'
                        }
                      }
                    });

                    alert(`Call with ${leadData.customer_full_name || 'client'} dropped. Need to reconnect.`);
                    toast({
                      title: 'Call Dropped',
                      description: `Call with ${leadData.customer_full_name || 'client'} dropped. Need to reconnect.`
                    });
                    refetch();
                  }}
                >
                  <PhoneOff className="mr-1.5 h-3.5 w-3.5" />
                  Call Dropped
                </Button>
                <Button
                  variant="ghost"
                  className={footerNeutralButtonClass}
                  onClick={async () => {
                    await updateSessionStatus('la_done');
                    toast({
                      title: 'Call Done',
                      description: 'Licensed agent is now free from the call.'
                    });
                    refetch();
                  }}
                >
                  <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                  Call Done
                </Button>
                <Button
                  variant="ghost"
                  className={footerCloserTransferButtonClass}
                  onClick={async () => {
                    await updateSessionStatus('ready_for_transfer');
                    toast({
                      title: 'Transfer',
                      description: 'Session is now available for other licensed agents to claim.'
                    });
                    refetch();
                  }}
                >
                  <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                  Transfer to Other Closer
                </Button>
              </>
            )}
          </div>
        </div>
    </Card>
  );
};
