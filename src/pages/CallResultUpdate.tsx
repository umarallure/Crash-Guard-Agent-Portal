import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LeadInfoCard } from "@/components/LeadInfoCard";
import { CallResultForm } from "@/components/CallResultForm";
import { StartVerificationModal } from "@/components/StartVerificationModal";
import { VerificationPanel } from "@/components/VerificationPanel";
import { OrderRecommendationsCard } from "@/components/OrderRecommendationsCard";
import { DocumentUploadCard } from "@/components/DocumentUploadCard";
import { Loader2, ArrowLeft, AlertTriangle, CheckCircle2, ShieldAlert, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { TopVerificationProgress } from "@/components/TopVerificationProgress";

interface Lead {
  id: string;
  submission_id: string;
  customer_full_name: string;
  phone_number: string;
  email: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  date_of_birth: string;
  age: number;
  birth_state?: string;
  social_security: string;
  driver_license?: string;
  additional_notes: string;
  lead_vendor?: string;
  // Accident/Incident fields
  accident_date?: string;
  accident_location?: string;
  accident_scenario?: string;
  injuries?: string;
  medical_attention?: string;
  police_attended?: boolean;
  insured?: boolean;
  vehicle_registration?: string;
  insurance_company?: string;
  third_party_vehicle_registration?: string;
  other_party_admit_fault?: boolean;
  passengers_count?: number;
  prior_attorney_involved?: boolean;
  prior_attorney_details?: string;
  contact_name?: string;
  contact_number?: string;
  contact_address?: string;
}

interface DncLookupSummary {
  phone: string;
  cleanedPhone: string | null;
  isOnDnc: boolean | null;
  isTcpaLitigator: boolean | null;
  isInvalid: boolean | null;
  isClean: boolean | null;
  raw: unknown;
}

interface ScriptSection {
  eyebrow: string;
  title: string;
  summary?: string;
  script?: string[];
  questions?: string[];
  checklist?: string[];
  tips?: string[];
  redFlags?: string[];
  notes?: string[];
}

interface ScriptTabDefinition {
  value: string;
  label: string;
  description: string;
  icon: "flow" | "verify" | "docs" | "review";
  sections: ScriptSection[];
}

const normalizePhoneForLookup = (value: string | null | undefined) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return "";
};

const toBooleanFlag = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "listed", "active", "found", "on"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "not_listed", "not listed", "clear", "clean", "off"].includes(normalized)) return false;
  if (normalized === "valid") return false;
  if (normalized === "invalid") return true;
  return null;
};

const flattenLookupPayload = (input: unknown, prefix = "", result: Array<{ key: string; value: unknown }> = []) => {
  if (Array.isArray(input)) {
    input.forEach((item, index) => flattenLookupPayload(item, `${prefix}[${index}]`, result));
    return result;
  }

  if (input && typeof input === "object") {
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") {
        flattenLookupPayload(value, nextKey, result);
      } else {
        result.push({ key: nextKey.toLowerCase(), value });
      }
    });
  }

  return result;
};

const findFlag = (entries: Array<{ key: string; value: unknown }>, keyParts: string[]) => {
  const match = entries.find((entry) => keyParts.every((part) => entry.key.includes(part)));
  return match ? toBooleanFlag(match.value) : null;
};

const findStringValue = (entries: Array<{ key: string; value: unknown }>, keyParts: string[]) => {
  const match = entries.find((entry) => keyParts.every((part) => entry.key.includes(part)));
  return typeof match?.value === "string" ? match.value : null;
};

const summarizeDncLookup = (raw: unknown, phone: string): DncLookupSummary => {
  const entries = flattenLookupPayload(raw);

  const isTcpaLitigator =
    findFlag(entries, ["tcpa"]) ??
    findFlag(entries, ["litigator"]);

  const isOnDnc =
    findFlag(entries, ["federal", "dnc"]) ??
    findFlag(entries, ["national", "dnc"]) ??
    findFlag(entries, ["state", "dnc"]) ??
    findFlag(entries, ["dnc"]);

  const invalidExplicit =
    findFlag(entries, ["invalid"]) ??
    findFlag(entries, ["phone", "invalid"]);

  const validExplicit =
    findFlag(entries, ["valid"]) ??
    findFlag(entries, ["clean"]) ??
    findFlag(entries, ["phone", "valid"]);

  const cleanedPhone =
    findStringValue(entries, ["clean"]) ??
    findStringValue(entries, ["formatted"]) ??
    findStringValue(entries, ["number"]);

  return {
    phone,
    cleanedPhone: cleanedPhone ? normalizePhoneForLookup(cleanedPhone) || cleanedPhone : null,
    isOnDnc,
    isTcpaLitigator,
    isInvalid: invalidExplicit ?? (validExplicit === false ? true : null),
    isClean: validExplicit ?? (invalidExplicit === true ? false : null),
    raw,
  };
};

const scriptHighlights = [
  "10-15 minute intake target",
  "Verify accident date multiple ways",
  "Police report is the primary verification tool",
  "Medical records are the second verification checkpoint",
  "Do not proceed if fraud red flags appear",
];

const callScriptTabs: ScriptTabDefinition[] = [
  {
    value: "flow",
    label: "Call Flow",
    description: "Opening, intake basics, accident story, and liability.",
    icon: "flow",
    sections: [
      {
        eyebrow: "Purpose",
        title: "Structured Intake With Verification",
        summary:
          "Collect all necessary accident information, detect coached or fraudulent claims through strategic verification questions, and ensure partner attorneys receive a complete, validated case file before consultation.",
        notes: [
          "Critical fraud indicators include accident date inconsistencies, hidden prior attorney representation, exaggerated injuries, and coached responses that do not match documentation.",
          "Use cross-verification questions and document all responses for later validation against police reports and medical records.",
        ],
      },
      {
        eyebrow: "1. Call Opening",
        title: "Set the tone and confirm availability",
        script: [
          'Hello, thank you for calling Accident Payments. My name is [YOUR NAME]. I am part of the accident intake team.',
          "I will ask you a few quick questions about your accident to see how we can assist you with your claim.",
          "This will take about 10-15 minutes. Is now a good time to talk?",
        ],
        tips: [
          "Notice if they sound rushed or are reading from a script.",
          "Coached callers may sound rehearsed or give overly perfect answers.",
        ],
      },
      {
        eyebrow: "2. Basic Information",
        title: "Collect identity and contact details",
        checklist: [
          "Full name: first, middle, last",
          "Phone number: cell and alternate if available",
          "Email address",
          "Current address: street, city, state, zip",
          "Date of birth",
        ],
        tips: [
          "Ask for DOB naturally so it can be cross-checked against the driver's license later.",
          "If they hesitate on basic information, note it.",
        ],
      },
      {
        eyebrow: "4. Accident Location & Details",
        title: "Lock in the factual scene details",
        questions: [
          "What city and state did the accident occur in?",
          "Can you tell me the street or intersection where it happened?",
          "Were you familiar with that area, or were you traveling somewhere new?",
          "Were you the driver or a passenger?",
          "If passenger: who was driving, and what is their relationship to you?",
        ],
        tips: [
          "Specific location details should come naturally.",
          'If they are vague about the location of "their" accident, it may be fabricated.',
          "Cross-check location details with the police report.",
        ],
      },
      {
        eyebrow: "5. Fault & Liability",
        title: "Capture the full story before conclusions",
        questions: [
          "Can you walk me through exactly how the accident happened?",
          "In your opinion, who was at fault for the accident?",
          "Did the other driver admit fault at the scene?",
          "Did the police come to the scene?",
          "Did anyone receive a traffic citation or ticket?",
          "If yes: who received the ticket - you or the other driver?",
        ],
        redFlags: [
          "Story sounds rehearsed or too perfect.",
          "They claim 100% other party fault but the story suggests shared fault.",
          "Details change when you ask follow-up questions.",
        ],
      },
    ],
  },
  {
    value: "verify",
    label: "Verify",
    description: "Fraud checkpoints for date, police report, injuries, and prior counsel.",
    icon: "verify",
    sections: [
      {
        eyebrow: "3. Accident Date Verification",
        title: "Critical fraud checkpoint",
        script: [
          "Initial question: Can you tell me when your accident happened?",
          "Record their answer exactly, then make them confirm the same date more than once.",
        ],
        questions: [
          "What day of the week was it?",
          "Was it around any holiday or special event?",
          "What was the weather like that day?",
          "About what time of day did it happen?",
          "So just to confirm, that was [REPEAT DATE]? And that was about [X] months ago, correct?",
        ],
        redFlags: [
          "They claim the accident was 11 months ago but cannot remember the day of week or season.",
          'They quickly say "within 12 months" but stay vague on the exact date.',
          "The date changes when asked different ways.",
          "They hesitate or sound coached when giving the date.",
        ],
        tips: [
          "If the date seems coached, note: Caller claims accident was [DATE] - VERIFY WITH POLICE REPORT.",
          "If their date is off by more than a few days once the police report is pulled, treat it as likely fraud.",
        ],
      },
      {
        eyebrow: "6. Police Report",
        title: "Primary verification tool",
        questions: [
          "Was a police report filed at the scene?",
          "If yes: do you have the police report number or case number?",
          "Which police department or agency responded - city police, state police, or sheriff?",
          "Do you remember the name of any officers who came to the scene?",
        ],
        notes: [
          "The police report should confirm the actual accident date, exact location and time, fault determination, injuries reported at the scene, and whether an ambulance was called.",
        ],
        tips: [
          "Always pull the police report before proceeding with the case.",
          "If their story contradicts the police report, stop and flag the matter for review.",
        ],
      },
      {
        eyebrow: "7. Injury Verification",
        title: "Second major fraud checkpoint",
        questions: [
          "Were you injured in the accident?",
          "Can you tell me what parts of your body were hurt?",
          "Did you feel the pain immediately, or did it come later?",
          "Did you go to the hospital directly from the accident scene?",
          "If not, when did you first seek medical attention - same day, next day, or later?",
          "What was the name of the hospital or medical facility where you were first treated?",
          "Do you remember the doctor's name who treated you?",
          "What kind of tests did they do - X-rays, MRI, or CT scan?",
          "Are you currently receiving treatment for your injuries?",
          "What type of treatment - physical therapy, chiropractic, pain management, or surgery?",
          "How often do you have appointments - weekly or twice a week?",
          "Are you able to work, or have your injuries prevented you from working?",
        ],
        redFlags: [
          "Claims serious injuries but never went to the ER or saw a doctor immediately.",
          "Cannot name the hospital, doctor, or facility where they were treated.",
          "Says they are in treatment but cannot describe what kind or how often.",
          "Injuries described do not match the mechanism of accident.",
          "Claims severe injuries but is working full-time with no restrictions.",
          "Vague about pain or symptoms and cannot describe them clearly.",
        ],
        tips: [
          "Medical records should verify date of first treatment, diagnosed injuries, treatment frequency, and whether injuries match the accident description.",
          'If the police report shows "no apparent injury" but they claim major injuries, flag the case.',
        ],
      },
      {
        eyebrow: "8. Prior Attorney Representation",
        title: "Critical hidden-representation checkpoint",
        questions: [
          "Have you hired or spoken with any attorney about this accident?",
          "After the accident, did you call or consult with any law firms to get advice?",
          "Did you sign any paperwork or agreements with anyone related to the accident?",
          "Have you received any letters or calls from law firms about your case?",
          "Did anyone help you with contacting us today - like a referral service or legal referral?",
          "Has anyone filed any claims or demands with the insurance company on your behalf?",
        ],
        checklist: [
          "If they admit previous attorney involvement, get the law firm name, sign date, end date, and why the relationship ended.",
          "Ask whether they have a written release letter or termination agreement from the previous attorney.",
        ],
        redFlags: [
          "Initially says no attorney, then admits to consultations when pressed.",
          'Says "no attorney" but mentions signing paperwork.',
          "Cannot produce a release letter from previous counsel.",
          "Story about previous representation sounds vague or made up.",
          "They have spoken to multiple firms and appear to be shopping around.",
        ],
        tips: [
          "Verify prior representation through court records, the previous law office, and insurance records if needed.",
          "Never proceed without a release letter if they had prior counsel.",
        ],
      },
    ],
  },
  {
    value: "docs",
    label: "Docs & Handoff",
    description: "Settlement history, vehicle data, documents, retainer, and attorney transfer.",
    icon: "docs",
    sections: [
      {
        eyebrow: "9. Compensation & Settlement History",
        title: "Make sure the case is still viable",
        questions: [
          "Have you received any money or compensation related to this accident?",
          "Has the insurance company offered you any settlement?",
          "Have you signed any release forms or settlement agreements?",
          "Have you filed a claim with your own insurance or the other driver's insurance?",
        ],
        redFlags: [
          "If they already settled or signed a release, the case is likely closed and cannot be reopened.",
        ],
      },
      {
        eyebrow: "10. Driver & Vehicle Information",
        title: "Collect both sides of the vehicle file",
        checklist: [
          "Your vehicle: driver's license number and state, vehicle make/model/year, plate number, VIN if available, insurance company, policy number.",
          "Other vehicle: other driver's name if known, other driver's insurance company, other policy number if available, other vehicle make/model/color.",
        ],
      },
      {
        eyebrow: "11. Document Collection Requirements",
        title: "Send the upload link and explain exactly what is needed",
        script: [
          "Thank you for providing all that information. To move forward with your case, we'll need to collect several documents from you.",
          "I'm going to send you a secure link via text message and email where you can upload these documents directly from your phone or computer.",
          "You'll receive a link within the next few minutes. You can upload documents right from your phone by taking pictures, or you can upload files from your computer.",
          "The portal will show you what we still need, and you can upload documents at any time. We'll also send you automatic reminders if we're still waiting on anything important.",
        ],
        checklist: [
          "Driver's license or government ID, front and back",
          "Police report if available",
          "Insurance information and policy documents",
          "Medical records from ER, doctor visits, and treatment notes",
          "Medical bills related to treatment",
          "Accident photos, including vehicle damage, scene, and injuries if available",
          "Repair estimates or receipts",
          "Proof of lost wages, such as pay stubs or an employer letter",
        ],
      },
      {
        eyebrow: "12. Retainer Agreement",
        title: "Get signed before attorney transfer",
        script: [
          "Before we connect you with one of our partner attorneys, I need to send you a short agreement called a retainer.",
          "This is a standard document that allows our legal team to officially review your case and represent you.",
          "It will also come through that same secure link.",
          "You can review and sign it electronically - it only takes a minute.",
          "Once you've signed it, let me know and I'll confirm it in our system. Then I can transfer you to speak with the attorney.",
        ],
        notes: [
          "Pause here. Wait for them to receive and sign the retainer, then confirm receipt in CRM before proceeding.",
        ],
      },
      {
        eyebrow: "13. Attorney Transfer",
        title: "Warm handoff once the retainer is confirmed",
        script: [
          "Perfect! Thank you for completing the retainer agreement. I can see it's been signed in our system.",
          "I'm now going to transfer you to one of our partner attorneys who will review your case in detail and explain the next steps.",
          "They'll answer any questions you have about the legal process and timeline.",
          "Please stay on the line while I connect you now. It was great speaking with you, and good luck with your case!",
        ],
      },
    ],
  },
  {
    value: "review",
    label: "Internal Review",
    description: "Qualification checklist, fraud summary, and post-call process.",
    icon: "review",
    sections: [
      {
        eyebrow: "Internal Qualification Checklist",
        title: "Everything that must be true before attorney transfer",
        checklist: [
          "Accident occurred within 12 months and the date was verified multiple ways.",
          "Injury is confirmed with specific details and a treatment timeline.",
          "Liability is verified and the other party appears at fault.",
          "Police report is available or retrievable with a case number.",
          "No active attorney, or a release letter has been obtained from prior counsel.",
          "No settlement or release has been signed.",
          "Document portal link has been sent by SMS and email.",
          "Retainer agreement is signed and confirmed in CRM.",
          "No red flags detected and the story remains consistent.",
        ],
      },
      {
        eyebrow: "Fraud Red Flags Summary",
        title: "Do not proceed if these appear",
        redFlags: [
          "Accident date is within 12 months but the caller stays vague on the exact date, day of week, weather, or time of day.",
          "Date changes when asked multiple ways or sounds rehearsed.",
          "Serious injury is claimed but there was no ER visit, no immediate treatment, or no identifiable doctor or facility.",
          "Injuries do not match the accident description or treatment story.",
          "Caller says no attorney but later admits consultations, signed paperwork, or prior representation without a release letter.",
        ],
      },
      {
        eyebrow: "Post-Call Verification Process",
        title: "What to validate immediately after the call",
        checklist: [
          "Step 1: Pull the police report and verify date, injuries noted at the scene, ambulance usage, fault determination, and citations.",
          "Step 2: Review medical records to confirm the date of first treatment, the diagnosis, and whether treatment matches the claimed severity.",
          "Step 3: If they claimed no prior attorney, check court records and insurance records, and verify active representation if needed.",
        ],
      },
      {
        eyebrow: "Fraud Escalation",
        title: "If fraud is detected",
        checklist: [
          "Do not proceed with the case.",
          "Document every inconsistency.",
          'Flag the CRM record as "Suspected Fraud."',
          "Notify a supervisor immediately.",
          "Do not contact the client again.",
          "Preserve all recordings and documentation.",
        ],
        notes: [
          "Internal use only. This script protects Accident Payments and partner attorneys from fraudulent claims while helping legitimate clients receive excellent service.",
        ],
      },
    ],
  },
];

const CallResultUpdate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submissionId = searchParams.get("submissionId");
  const formId = searchParams.get("formId");
  const fromCallback = searchParams.get("fromCallback");
  const assignedAttorneyId = searchParams.get("assignedAttorneyId");
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [verifiedFieldValues, setVerifiedFieldValues] = useState<Record<string, string>>({});
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [contractRecipientEmail, setContractRecipientEmail] = useState("");
  const [sendingContract, setSendingContract] = useState(false);
  const [lastEnvelopeId, setLastEnvelopeId] = useState<string | null>(null);
  const [dncLookupLoading, setDncLookupLoading] = useState(false);
  const [dncLookupError, setDncLookupError] = useState<string | null>(null);
  const [dncLookupSummary, setDncLookupSummary] = useState<DncLookupSummary | null>(null);
  const [isDncLookupCollapsed, setIsDncLookupCollapsed] = useState(false);
  const [isDisclaimerCollapsed, setIsDisclaimerCollapsed] = useState(false);
  const [isScriptCollapsed, setIsScriptCollapsed] = useState(false);
  const [isContractCollapsed, setIsContractCollapsed] = useState(false);
  const [isDocumentUploadCollapsed, setIsDocumentUploadCollapsed] = useState(false);
  const [openScriptSections, setOpenScriptSections] = useState<Record<string, boolean>>({});

  const docusignTemplateId = import.meta.env.VITE_DOCUSIGN_TEMPLATE_ID as string | undefined;

  const { toast } = useToast();

  const checkExistingVerificationSession = useCallback(async () => {
    try {
      const { data: sessions, error } = await supabase
        .from('verification_sessions')
        .select('id, status, buffer_agent_id, licensed_agent_id')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });

      console.log('Verification sessions found:', sessions);

      if (error) {
        console.error('Error fetching verification sessions:', error);
        return;
      }

      // Get the most recent session (first in the ordered list)
      if (sessions && sessions.length > 0) {
        const latestSession = sessions[0];
        console.log('Using latest verification session:', latestSession);
        setVerificationSessionId(latestSession.id);
        setShowVerificationPanel(true);
      } else {
        console.log('No verification sessions found for this submission');
      }
    } catch (error) {
      console.error('Error in checkExistingVerificationSession:', error);
    }
  }, [submissionId]);

  const fetchLead = useCallback(async () => {
    try {
      // Trim the submission ID
      const trimmedSubmissionId = submissionId ? submissionId.trim() : "";
      
      if (!trimmedSubmissionId) {
        toast({
          title: "Error",
          description: "Invalid submission ID",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Direct query - fetch lead by submission ID only
      const { data: directLead, error: directError } = await supabase
        .from("leads")
        .select("*")
        .eq("submission_id", trimmedSubmissionId)
        .single();

      if (directError) {
        console.error("Error fetching lead:", directError);
        toast({
          title: "Lead Not Found",
          description: `Could not find lead with submission ID: ${trimmedSubmissionId}`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (directLead) {
        const typedLead = directLead as Lead;
        setLead(typedLead);
        setContractRecipientEmail(typedLead.email || "");
        setLoading(false);
        return;
      }

      // If no lead found
      toast({
        title: "Lead Not Found",
        description: `No lead found with submission ID: ${trimmedSubmissionId}`,
        variant: "destructive",
      });
      setLoading(false);

    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      setLoading(false);
    }
  }, [submissionId, toast]);

  const screeningPhone = normalizePhoneForLookup(verifiedFieldValues.phone_number || lead?.phone_number);
  const callFlowSections = callScriptTabs.flatMap((tab) => tab.sections);

  const toggleScriptSection = (sectionKey: string, fallbackOpen: boolean) => {
    setOpenScriptSections((prev) => ({
      ...prev,
      [sectionKey]: !(prev[sectionKey] ?? fallbackOpen),
    }));
  };

  const dncLookupCardContent = (() => {
    if (!screeningPhone && !lead?.phone_number) {
      return (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No phone number available for screening</AlertTitle>
          <AlertDescription>Add or verify a phone number to run TCPA / DNC screening.</AlertDescription>
        </Alert>
      );
    }

    if (dncLookupLoading) {
      return (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>TCPA / DNC screening in progress</AlertTitle>
          <AlertDescription>
            We are screening {screeningPhone || lead?.phone_number || "this number"} before call-result handling continues.
          </AlertDescription>
        </Alert>
      );
    }

    if (dncLookupError) {
      return (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>DNC screening could not be completed</AlertTitle>
          <AlertDescription>{dncLookupError}</AlertDescription>
        </Alert>
      );
    }

    if (!dncLookupSummary) {
      return (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Awaiting DNC result</AlertTitle>
          <AlertDescription>The screening result will appear here as soon as the lookup completes.</AlertDescription>
        </Alert>
      );
    }

    if (dncLookupSummary.isTcpaLitigator) {
      return (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>TCPA litigator flagged</AlertTitle>
          <AlertDescription>
            This phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} appears to be flagged as a TCPA litigator. Review carefully before proceeding.
          </AlertDescription>
        </Alert>
      );
    }

    if (dncLookupSummary.isInvalid) {
      return (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Invalid phone number</AlertTitle>
          <AlertDescription>
            The screened phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} appears invalid.
          </AlertDescription>
        </Alert>
      );
    }

    if (dncLookupSummary.isOnDnc === true) {
      return (
        <Alert variant="destructive" className="border-amber-500/50 text-amber-700 [&>svg]:text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Phone number is on a DNC list</AlertTitle>
          <AlertDescription>
            The screened phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} appears on a DNC list. Verbal consent must be captured clearly before proceeding.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="border-emerald-500/40 text-emerald-700 [&>svg]:text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Phone number is not on a DNC list</AlertTitle>
        <AlertDescription>
          The screened phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} does not appear on the DNC list.
        </AlertDescription>
      </Alert>
    );
  })();

  const callSupportCards = (
    <div className="space-y-4">
      <Card>
        <Collapsible open={!isDncLookupCollapsed} onOpenChange={(open) => setIsDncLookupCollapsed(!open)}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">DNC Lookup</CardTitle>
                  <p className="text-xs text-muted-foreground">TCPA / DNC screening status for the current lead phone number.</p>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  {isDncLookupCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Expand
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Collapse
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">{dncLookupCardContent}</CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="border-amber-200 bg-amber-50/40">
        <Collapsible open={!isDisclaimerCollapsed} onOpenChange={(open) => setIsDisclaimerCollapsed(!open)}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base text-amber-900">Disclaimer</CardTitle>
                  <p className="text-xs text-amber-700/70">DNC verbal consent — read to the customer before proceeding.</p>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2 border-amber-200 bg-white/70 text-amber-900 hover:bg-white">
                  {isDisclaimerCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Expand
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Collapse
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3 pt-0">
          {/* Question 1 */}
          <div className="rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm leading-6 text-foreground">
            Is your phone number{" "}
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
              {lead?.phone_number || "on file"}
            </span>{" "}
            on the Federal, National or State Do Not Call List?
          </div>

          {/* Internal note */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200/60 bg-amber-100/50 px-4 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-xs leading-5 text-amber-800">
              If a customer says <strong>no</strong> and we see it's on the DNC list, we still have to take the verbal consent.
            </p>
          </div>

          {/* Question 2 */}
          <div className="rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm leading-6 text-foreground">
            Sir/Ma'am, even if your phone number is on the Federal National or State Do Not Call List, do we still
            have your permission to call you and submit your application to Accident Payments via your
            phone number{" "}
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
              {lead?.phone_number || "on file"}
            </span>
            ? And do we have your permission to call you on the same phone number in the future if needed?
          </div>

          {/* Action required */}
          <div className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-400/15 px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-sm font-semibold text-amber-900">Make sure you get a clear YES on it.</p>
          </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card>
        <Collapsible open={!isScriptCollapsed} onOpenChange={(open) => setIsScriptCollapsed(!open)}>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-1 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Script</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Motor Vehicle Accident Intake Call Script with verification and fraud detection checkpoints.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {scriptHighlights.map((highlight) => (
                      <Badge key={highlight} variant="secondary" className="rounded-full px-3 py-1 text-[11px] font-medium">
                        {highlight}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-4 xl:min-w-[20rem]">
                  <div className="rounded-lg bg-background px-3 py-2">
                    <div className="font-semibold text-foreground">Date</div>
                    <div>Verify twice</div>
                  </div>
                  <div className="rounded-lg bg-background px-3 py-2">
                    <div className="font-semibold text-foreground">Police</div>
                    <div>Primary proof</div>
                  </div>
                  <div className="rounded-lg bg-background px-3 py-2">
                    <div className="font-semibold text-foreground">Medical</div>
                    <div>Second checkpoint</div>
                  </div>
                  <div className="rounded-lg bg-background px-3 py-2">
                    <div className="font-semibold text-foreground">Attorney</div>
                    <div>Check releases</div>
                  </div>
                </div>
              </div>

              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  {isScriptCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Expand
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Collapse
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="mb-3 rounded-xl border bg-muted/20 px-4 py-3">
                <div className="text-sm font-semibold text-foreground">Call Flow</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Full intake flow, verification checkpoints, documents, handoff, and internal review in one place.
                </p>
              </div>

              <ScrollArea className="h-[36rem] rounded-xl border bg-background">
                <div className="space-y-4 p-4">
                  {callFlowSections.map((section, sectionIndex) => (
                    (() => {
                      const sectionKey = `${section.eyebrow}-${section.title}-${sectionIndex}`;
                      const defaultOpen = sectionIndex === 0;
                      const isSectionOpen = openScriptSections[sectionKey] ?? defaultOpen;

                      return (
                        <Collapsible key={sectionKey} open={isSectionOpen} onOpenChange={() => toggleScriptSection(sectionKey, defaultOpen)}>
                          <div className="rounded-xl border bg-card shadow-sm">
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/20"
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                      {section.eyebrow}
                                    </div>
                                    <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px] font-medium">
                                      Step {sectionIndex + 1} of {callFlowSections.length}
                                    </Badge>
                                  </div>
                                  <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                                  {section.summary ? (
                                    <p className="text-sm leading-6 text-muted-foreground">{section.summary}</p>
                                  ) : null}
                                </div>
                                <div className="mt-0.5 shrink-0 rounded-full border bg-background p-1.5">
                                  {isSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              </button>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="space-y-3 border-t px-4 pb-4 pt-3">
                                {section.script?.length ? (
                                  <div className="rounded-lg border border-primary/10 bg-primary/5 px-4 py-3">
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                                      Agent Script
                                    </div>
                                    <div className="space-y-2 text-sm leading-6 text-foreground">
                                      {section.script.map((line) => (
                                        <p key={line}>{line}</p>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {section.questions?.length ? (
                                  <div>
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                      Questions To Ask
                                    </div>
                                    <ul className="space-y-2 text-sm leading-6 text-foreground">
                                      {section.questions.map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {section.checklist?.length ? (
                                  <div>
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                      Checklist
                                    </div>
                                    <ul className="space-y-2 text-sm leading-6 text-foreground">
                                      {section.checklist.map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {section.tips?.length ? (
                                  <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3">
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">
                                      Verification Tips
                                    </div>
                                    <ul className="space-y-2 text-sm leading-6 text-sky-950">
                                      {section.tips.map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {section.redFlags?.length ? (
                                  <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3">
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-800">
                                      Red Flags
                                    </div>
                                    <ul className="space-y-2 text-sm leading-6 text-rose-950">
                                      {section.redFlags.map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {section.notes?.length ? (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3">
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                                      Internal Notes
                                    </div>
                                    <ul className="space-y-2 text-sm leading-6 text-amber-950">
                                      {section.notes.map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })()
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="mb-2">
        <Collapsible open={!isContractCollapsed} onOpenChange={(open) => setIsContractCollapsed(!open)}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Send Contract</CardTitle>
                <p className="text-xs text-muted-foreground">Send the retainer/contract packet to the recipient email on file.</p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  {isContractCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Expand
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Collapse
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="contractRecipientEmail">Recipient Email</Label>
                  <Input
                    id="contractRecipientEmail"
                    type="email"
                    value={contractRecipientEmail}
                    onChange={(e) => setContractRecipientEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                  {lastEnvelopeId ? (
                    <div className="text-sm text-muted-foreground">Last envelope: {lastEnvelopeId}</div>
                  ) : null}
                </div>

                <Button onClick={handleSendContract} disabled={sendingContract}>
                  {sendingContract ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    "Send Contract"
                  )}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="mt-2 mb-2">
        <Collapsible open={!isDocumentUploadCollapsed} onOpenChange={(open) => setIsDocumentUploadCollapsed(!open)}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Document Upload</CardTitle>
                <p className="text-xs text-muted-foreground">Generate and review document uploads for this lead.</p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  {isDocumentUploadCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Expand
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Collapse
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <DocumentUploadCard
                submissionId={submissionId!}
                customerPhoneNumber={lead?.phone_number}
                embedded
              />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );

  useEffect(() => {
    if (!submissionId) {
      toast({
        title: "Error",
        description: "No submission ID provided",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    fetchLead();
    checkExistingVerificationSession();
  }, [submissionId, fetchLead, checkExistingVerificationSession, toast]);

  useEffect(() => {
    if (!screeningPhone) {
      setDncLookupSummary(null);
      setDncLookupError(null);
      return;
    }

    let cancelled = false;

    const runDncLookup = async () => {
      setDncLookupLoading(true);
      setDncLookupError(null);

      try {
        const { data, error } = await supabase.functions.invoke("dnc-lookup", {
          body: { mobileNumber: screeningPhone },
        });

        if (error) throw error;
        if (cancelled) return;

        setDncLookupSummary(summarizeDncLookup(data, screeningPhone));
      } catch (error) {
        if (cancelled) return;
        console.error("DNC lookup failed:", error);
        setDncLookupSummary(null);
        setDncLookupError(error instanceof Error ? error.message : "Failed to run DNC screening");
      } finally {
        if (!cancelled) {
          setDncLookupLoading(false);
        }
      }
    };

    void runDncLookup();

    return () => {
      cancelled = true;
    };
  }, [screeningPhone]);

  useEffect(() => {
    const seedVerifiedFields = async () => {
      if (!verificationSessionId) return;

      try {
        const { data: items, error } = await supabase
          .from('verification_items')
          .select('field_name, verified_value, original_value')
          .eq('session_id', verificationSessionId)
          .eq('is_verified', true);

        if (error) throw error;

        const seeded: Record<string, string> = {};
        (items || []).forEach((item: { field_name: string; verified_value: unknown; original_value: unknown }) => {
          const value = item.verified_value ?? item.original_value ?? '';
          if (!value || value === 'null' || value === 'undefined') return;
          seeded[item.field_name] = String(value);
        });

        if (Object.keys(seeded).length > 0) {
          setVerifiedFieldValues(prev => ({ ...prev, ...seeded }));
        }
      } catch (e) {
        console.error('Error seeding verified fields:', e);
      }
    };

    seedVerifiedFields();
  }, [verificationSessionId]);

  async function handleSendContract() {
    type SendContractResponse = { envelopeId?: string };

    const email = (contractRecipientEmail || "").trim();
    if (!submissionId) {
      toast({
        title: "Error",
        description: "No submission ID provided",
        variant: "destructive",
      });
      return;
    }

    if (!email) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    if (!docusignTemplateId) {
      toast({
        title: "Error",
        description: "Missing DocuSign template ID (VITE_DOCUSIGN_TEMPLATE_ID)",
        variant: "destructive",
      });
      return;
    }

    setSendingContract(true);
    try {
      const response = await supabase.functions.invoke<SendContractResponse>("docusign-send-contract", {
        body: {
          submissionId,
          recipientEmail: email,
          recipientName: lead?.customer_full_name || email,
          accidentDate: lead?.accident_date || "",
          templateId: docusignTemplateId,
        },
      });

      if (response.error) throw response.error;

      const envelopeId = response.data?.envelopeId ?? null;
      setLastEnvelopeId(envelopeId);

      toast({
        title: "Contract sent",
        description: envelopeId ? `Envelope ID: ${envelopeId}` : "Contract email was sent successfully",
      });
    } catch (e: unknown) {
      console.error("Error sending contract:", e);
      const message = e instanceof Error ? e.message : "Failed to send contract";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSendingContract(false);
    }
  }

  useEffect(() => {
    if (!verificationSessionId) return;

    let intervalId: NodeJS.Timeout | null = null;
    const fetchProgress = async () => {
      const { data: items } = await supabase
        .from("verification_items")
        .select("is_verified")
        .eq("session_id", verificationSessionId);
      if (items && Array.isArray(items)) {
        const total = items.length;
        const verified = (items as Array<{ is_verified: boolean | null }>).filter((item) => Boolean(item.is_verified)).length;
        setVerificationProgress(total > 0 ? Math.round((verified / total) * 100) : 0);
      }
    };

    fetchProgress();
    intervalId = setInterval(fetchProgress, 2000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [verificationSessionId]);

  const handleVerificationStarted = (sessionId: string) => {
    setVerificationSessionId(sessionId);
    setShowVerificationPanel(true);
  };

  const handleTransferReady = () => {
    toast({
      title: "Verification Complete",
      description: "Lead is now ready for Licensed Agent review",
    });
  };

  const handleFieldVerified = (fieldName: string, value: string, checked: boolean) => {
    setVerifiedFieldValues(prev => {
      if (checked) {
        return {
          ...prev,
          [fieldName]: value,
        };
      }

      if (!(fieldName in prev)) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  };

  const processLeadFromJotForm = async () => {
    setProcessing(true);
    try {
      // Get center from the URL search params
      const center = searchParams.get("center");
      const response = await supabase.functions.invoke('process-lead', {
        body: { submissionId, formId, center }
      });

      if (response.error) {
        throw response.error;
      }

      toast({
        title: "Success",
        description: "Lead data fetched from JotForm and saved to database",
      });

      return response.data;
    } catch (error) {
      console.error("Error processing lead from JotForm:", error);
      toast({
        title: "Error",
        description: "Failed to fetch lead data from JotForm",
        variant: "destructive",
      });
      return null;
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading lead information...</span>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Lead Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">
              The submission ID "{submissionId}" was not found in our records.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4 w-full">
          <Button 
            variant="outline" 
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-4xl font-extrabold tracking-tight whitespace-nowrap">
              {fromCallback ? "Update Callback Result" : "Update Call Result"}
            </h1>
            <p className="text-lg text-muted-foreground mt-1 truncate">
              {fromCallback 
                ? "Update the status and details for this callback" 
                : "Update the status and details for this lead"
              }
            </p>
          </div>
          {/* Top right: show StartVerificationModal if no session, else show progress bar */}
          {!showVerificationPanel || !verificationSessionId ? (
            <div className="flex-shrink-0">
              <StartVerificationModal 
                submissionId={submissionId!}
                onVerificationStarted={handleVerificationStarted}
              />
            </div>
          ) : (
            <div className="w-[420px] max-w-[50vw]">
              <TopVerificationProgress submissionId={submissionId!} verificationSessionId={verificationSessionId} />
            </div>
          )}
        </div>

        {showVerificationPanel && verificationSessionId ? (
          <>
            {/* Main Content - 50/50 Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Verification Panel - Left Half */}
              <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
                <VerificationPanel 
                  sessionId={verificationSessionId}
                  onTransferReady={handleTransferReady}
                  onFieldVerified={handleFieldVerified}
                />
              </div>
              
              {/* Call Result Form - Right Half */}
              <div>
                {callSupportCards}
                <CallResultForm 
                  submissionId={submissionId!} 
                  customerName={lead.customer_full_name}
                  initialAssignedAttorneyId={assignedAttorneyId || undefined}
                  verificationSessionId={verificationSessionId || undefined}
                  verifiedFieldValues={verifiedFieldValues}
                  verificationProgress={verificationProgress}
                  onSuccess={() => navigate(`/call-result-journey?submissionId=${submissionId}`)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 items-start lg:grid-cols-2 gap-6">
              <div className="self-start">
                <OrderRecommendationsCard
                  submissionId={submissionId!}
                  leadId={lead.id}
                  leadOverrides={{
                    state: lead.state,
                    insured: lead.insured ?? null,
                    prior_attorney_involved: lead.prior_attorney_involved ?? null,
                  }}
                  currentAssignedAttorneyId={assignedAttorneyId || null}
                />
              </div>
            </div>
          </>
        ) : (
          /* Original layout when no verification panel */
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Lead Details */}
            <div className="grid grid-cols-1 gap-6">
              <div className="grid grid-cols-1 items-start xl:grid-cols-2 gap-6">
                <div className="self-start">
                  <OrderRecommendationsCard
                    submissionId={submissionId!}
                    leadId={lead.id}
                    leadOverrides={{
                      state: lead.state,
                      insured: lead.insured ?? null,
                      prior_attorney_involved: lead.prior_attorney_involved ?? null,
                    }}
                    currentAssignedAttorneyId={assignedAttorneyId || null}
                  />
                </div>
              </div>
              <OrderRecommendationsCard
                submissionId={submissionId!}
                leadId={lead.id}
                leadOverrides={{
                  state: lead.state,
                  insured: lead.insured ?? null,
                  prior_attorney_involved: lead.prior_attorney_involved ?? null,
                }}
              currentAssignedAttorneyId={assignedAttorneyId || null}
            />
            </div>
            
            {/* Call Result Form */}
            <div>
              {callSupportCards}
              <CallResultForm 
                submissionId={submissionId!} 
                customerName={lead.customer_full_name}
                initialAssignedAttorneyId={assignedAttorneyId || undefined}
                verificationSessionId={verificationSessionId || undefined}
                verificationProgress={verificationProgress}
                onSuccess={() => navigate(`/call-result-journey?submissionId=${submissionId}`)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallResultUpdate;
