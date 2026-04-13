import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAttorneys } from "@/hooks/useAttorneys";
import { supabase } from "@/integrations/supabase/client";
import { CallResultForm } from "@/components/CallResultForm";
import { StartVerificationModal } from "@/components/StartVerificationModal";
import { VerificationPanel } from "@/components/VerificationPanel";
import { OrderRecommendationsCard } from "@/components/OrderRecommendationsCard";
import { DocumentUploadCard } from "@/components/DocumentUploadCard";
import { QualifiedLawyersCard, type SelectedLawyer } from "@/components/QualifiedLawyersCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ArrowLeft, AlertTriangle, CheckCircle2, FileText, ShieldAlert, ChevronDown, ChevronUp, Info, RefreshCw, Scale, Copy, Check, Search } from "lucide-react";
import { DOCUSIGN_TEMPLATE_IDS } from "@/lib/docusignTemplates";
import { US_STATES } from "@/lib/us-states";
import { LEAD_TAG_OPTIONS, getLeadTagToneClass } from "@/lib/leadTags";

interface Lead {
  id: string;
  submission_id: string;
  tag?: string | null;
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

interface DncProviderDetail {
  provider: string;
  isTcpa: boolean;
  isDnc: boolean;
  isInvalid: boolean;
  isClean: boolean;
  matchedLists: string[];
  error: string | null;
}

interface DncLookupSummary {
  phone: string;
  cleanedPhone: string | null;
  isOnDnc: boolean | null;
  isTcpaLitigator: boolean | null;
  isInvalid: boolean | null;
  isClean: boolean | null;
  providers: DncProviderDetail[];
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

type ContractTemplateOption = {
  id: string;
  name: string;
  states: string[];
};

const extractTemplateStates = (templateName: string) => {
  const upperTemplateName = templateName.toUpperCase();

  return US_STATES.filter(({ code, name }) => {
    const codePattern = new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`);
    return codePattern.test(upperTemplateName) || upperTemplateName.includes(name.toUpperCase());
  }).map((state) => state.code);
};

const getPreferredFirstName = (value: string | null | undefined) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.split(/\s+/)[0] || normalized;
};

interface ScriptTabDefinition {
  value: string;
  label: string;
  description: string;
  icon: "flow" | "verify" | "docs" | "review";
  sections: ScriptSection[];
}

const scriptHeaderCheckpoints = [
  { label: "Date", hint: "Verify twice" },
  { label: "Police", hint: "Primary proof" },
  { label: "Medical", hint: "Second checkpoint" },
  { label: "Attorney", hint: "Check releases" },
] as const;

const normalizePhoneForLookup = (value: string | null | undefined) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return "";
};

const isLookupRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const findPhoneMatchInLookupArray = (value: unknown, phone: string) => {
  if (!Array.isArray(value)) return null;

  const normalizedPhone = normalizePhoneForLookup(phone);
  if (!normalizedPhone) return null;

  const normalizedEntries = value
    .map((item) => normalizePhoneForLookup(String(item)))
    .filter(Boolean);

  return normalizedEntries.includes(normalizedPhone);
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
  const root = isLookupRecord(raw) ? raw : null;
  const flags = isLookupRecord(root?.flags) ? root.flags : null;

  // ---- Primary path: trust the edge function's cross-validated flags ----
  // The edge function already runs multi-provider cross-validation to eliminate
  // false positives. We read its pre-computed flags directly rather than
  // re-deriving from nested provider data (which would bypass the cross-check).
  const edgeTcpaFlag =
    toBooleanFlag(flags?.isTcpa) ??
    toBooleanFlag(root?.isTcpa) ??
    toBooleanFlag(root?.isTcpaLitigator);

  const edgeDncFlag =
    toBooleanFlag(flags?.isDnc) ??
    toBooleanFlag(root?.isDnc) ??
    toBooleanFlag(root?.isOnDnc);

  const edgeInvalidFlag =
    toBooleanFlag(flags?.isInvalid) ??
    toBooleanFlag(root?.isInvalid);

  const edgeCleanFlag =
    toBooleanFlag(flags?.isClean) ??
    toBooleanFlag(root?.isClean);

  // ---- Fallback path: legacy single-provider response without flags ----
  // Only used when the edge function response doesn't include a flags object
  // (e.g. old deployment that hasn't been updated yet).
  const hasCrossValidatedFlags = flags !== null || root?.callStatus !== undefined;

  let fallbackTcpa: boolean | null = null;
  let fallbackDnc: boolean | null = null;
  let fallbackInvalid: boolean | null = null;
  let fallbackClean: boolean | null = null;

  if (!hasCrossValidatedFlags) {
    const entries = flattenLookupPayload(raw);
    const providerData = isLookupRecord(root?.data) ? root.data : null;

    fallbackTcpa =
      findPhoneMatchInLookupArray(providerData?.tcpa_litigator, phone) ??
      findPhoneMatchInLookupArray(root?.tcpa_litigator, phone) ??
      findFlag(entries, ["tcpa"]) ??
      findFlag(entries, ["litigator"]);

    fallbackDnc =
      findPhoneMatchInLookupArray(providerData?.federal_dnc, phone) ??
      findPhoneMatchInLookupArray(providerData?.state_dnc, phone) ??
      findPhoneMatchInLookupArray(providerData?.national_dnc, phone) ??
      findPhoneMatchInLookupArray(providerData?.dnc, phone) ??
      findPhoneMatchInLookupArray(providerData?.dnc_number, phone) ??
      findPhoneMatchInLookupArray(root?.federal_dnc, phone) ??
      findPhoneMatchInLookupArray(root?.state_dnc, phone) ??
      findPhoneMatchInLookupArray(root?.national_dnc, phone) ??
      findPhoneMatchInLookupArray(root?.dnc, phone) ??
      findPhoneMatchInLookupArray(root?.dnc_number, phone) ??
      findFlag(entries, ["federal", "dnc"]) ??
      findFlag(entries, ["national", "dnc"]) ??
      findFlag(entries, ["state", "dnc"]) ??
      findFlag(entries, ["dnc"]);

    fallbackInvalid =
      findPhoneMatchInLookupArray(providerData?.invalid, phone) ??
      findPhoneMatchInLookupArray(root?.invalid, phone) ??
      findFlag(entries, ["invalid"]) ??
      findFlag(entries, ["phone", "invalid"]);

    const fallbackCleanArray =
      findPhoneMatchInLookupArray(providerData?.cleaned_number, phone) ??
      findPhoneMatchInLookupArray(root?.cleaned_number, phone);

    fallbackClean =
      fallbackCleanArray ??
      findFlag(entries, ["valid"]) ??
      findFlag(entries, ["clean"]) ??
      findFlag(entries, ["phone", "valid"]);
  }

  const isTcpaLitigator = edgeTcpaFlag ?? fallbackTcpa;
  const isOnDnc = edgeDncFlag ?? fallbackDnc;
  const invalidExplicit = edgeInvalidFlag ?? fallbackInvalid;
  const validExplicit = edgeCleanFlag ?? fallbackClean;

  const flatEntries = flattenLookupPayload(raw);
  const cleanedPhone =
    findStringValue(flatEntries, ["clean"]) ??
    findStringValue(flatEntries, ["formatted"]) ??
    findStringValue(flatEntries, ["number"]);

  // Extract provider-level details from the multi-provider response
  const providers: DncProviderDetail[] = Array.isArray(
    (root as Record<string, unknown> | null)?.providers,
  )
    ? ((root as Record<string, unknown>).providers as DncProviderDetail[])
    : [];

  return {
    phone,
    cleanedPhone: cleanedPhone ? normalizePhoneForLookup(cleanedPhone) || cleanedPhone : null,
    isOnDnc,
    isTcpaLitigator,
    isInvalid: invalidExplicit ?? (validExplicit === false ? true : null),
    isClean: validExplicit ?? (invalidExplicit === true ? false : null),
    providers,
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

const docusignDesktopGuideSteps = [
  {
    step: "Step 1",
    title: "Open the DocuSign email",
    body: "Ask the lead to check their email. They should have received a DocuSign email from us. If it is not there, have them check their spam folder.",
    images: [
      {
        src: "/assets/docusign-guide/step2.webp",
        alt: "DocuSign email with Review Document button highlighted",
      },
    ],
  },
  {
    step: "Step 2",
    title: "Review and continue",
    body: "Have them check the electronic records consent box, then click Continue to enter the agreement.",
    images: [
      {
        src: "/assets/docusign-guide/step3.webp",
        alt: "DocuSign review and continue screen with checkbox and Continue button highlighted",
      },
    ],
  },
  {
    step: "Step 3",
    title: "Start the signing flow",
    body: "Tell them to click Start at the top so DocuSign jumps directly to each required field.",
    images: [
      {
        src: "/assets/docusign-guide/step4.webp",
        alt: "DocuSign page with Start button highlighted",
      },
    ],
  },
  {
    step: "Step 4",
    title: "Complete the initials",
    body: "When the Initial tag appears, have them click it. If DocuSign opens a confirmation box, review the initials preview and choose Adopt and Initial.",
    images: [
      {
        src: "/assets/docusign-guide/step6.webp",
        alt: "DocuSign Initial tag highlighted",
      },
      {
        src: "/assets/docusign-guide/step7.webp",
        alt: "DocuSign adopt your initials screen with Adopt and Initial button highlighted",
      },
    ],
  },
  {
    step: "Step 5",
    title: "Sign and move to the next field",
    body: "When the Sign tag appears, have them click it to place the signature. If another required field remains, use Next to move forward.",
    images: [
      {
        src: "/assets/docusign-guide/step5.webp",
        alt: "DocuSign Sign tag highlighted",
      },
      {
        src: "/assets/docusign-guide/step8.webp",
        alt: "DocuSign Next button highlighted",
      },
    ],
  },
  {
    step: "Step 6",
    title: "Finish the agreement",
    body: "Once every required field is complete, have them click Finish. If Finish does not work yet, there is still a required field left. On some screens Finish appears at the top right.",
    images: [
      {
        src: "/assets/docusign-guide/step9.webp",
        alt: "DocuSign Finish button at the bottom of the page highlighted",
      },
      {
        src: "/assets/docusign-guide/step10.webp",
        alt: "DocuSign Finish button in the top bar highlighted",
      },
    ],
  },
  {
    step: "Step 7",
    title: "Confirm completion and save a copy",
    body: "Once the Completed screen appears, let them know the agreement has been submitted successfully and they can save a copy for their records.",
    images: [
      {
        src: "/assets/docusign-guide/step11.webp",
        alt: "DocuSign completed screen with Save a Copy option highlighted",
      },
    ],
  },
] as const;

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
          'Hello, thank you for calling Accident Claims Helpline. My name is [YOUR NAME]. I am part of the accident intake team.',
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
    label: "Documentation",
    description: "Settlement history, vehicle data, documents, retainer, and transfer prep.",
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
          "Internal use only. This script protects Accident Claims Helpline and partner attorneys from fraudulent claims while helping legitimate clients receive excellent service.",
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
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [verifiedFieldValues, setVerifiedFieldValues] = useState<Record<string, string>>({});
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [currentAssignedAttorneyId, setCurrentAssignedAttorneyId] = useState<string | null>(assignedAttorneyId || null);
  const [contractRecipientEmail, setContractRecipientEmail] = useState("");
  const [sendingContract, setSendingContract] = useState(false);
  const [lastEnvelopeId, setLastEnvelopeId] = useState<string | null>(null);
  const [selectedRetainerState, setSelectedRetainerState] = useState("");
  const [refreshingRetainerStatus, setRefreshingRetainerStatus] = useState(false);
  const [retainerStatusLastCheckedAt, setRetainerStatusLastCheckedAt] = useState<string | null>(null);
  const [dncLookupLoading, setDncLookupLoading] = useState(false);
  const [dncLookupError, setDncLookupError] = useState<string | null>(null);
  const [dncLookupSummary, setDncLookupSummary] = useState<DncLookupSummary | null>(null);
  const [showTcpaBlockedModal, setShowTcpaBlockedModal] = useState(false);
  const [isDncLookupCollapsed, setIsDncLookupCollapsed] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [dncInputPhone, setDncInputPhone] = useState("");
  const [isDisclaimerCollapsed, setIsDisclaimerCollapsed] = useState(false);
  const [isScriptCollapsed, setIsScriptCollapsed] = useState(false);
  const [isAttorneyRecommendationCollapsed, setIsAttorneyRecommendationCollapsed] = useState(false);
  const [isAttorneyDisclosureCollapsed, setIsAttorneyDisclosureCollapsed] = useState(false);
  const [isContractCollapsed, setIsContractCollapsed] = useState(false);
  const [isDocusignGuideCollapsed, setIsDocusignGuideCollapsed] = useState(false);
  const [isDocumentUploadCollapsed, setIsDocumentUploadCollapsed] = useState(false);
  const [isMyCasesGuideCollapsed, setIsMyCasesGuideCollapsed] = useState(false);
  const [openScriptSections, setOpenScriptSections] = useState<Record<string, boolean>>({});
  const [linkedScriptSectionEyebrow, setLinkedScriptSectionEyebrow] = useState<string | null>(null);
  const [attorneyFulfillmentMode, setAttorneyFulfillmentMode] = useState<"internal" | "broker">("internal");
  const [selectedSubmittedLawyer, setSelectedSubmittedLawyer] = useState<SelectedLawyer | null>(null);

  const [contractTemplates, setContractTemplates] = useState<ContractTemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [contractRecipientName, setContractRecipientName] = useState("");

  const { toast } = useToast();
  const { attorneys } = useAttorneys();

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

  useEffect(() => {
    setSelectedTag((lead?.tag || "").trim());
  }, [lead?.id, lead?.tag]);

  const screeningPhone = normalizePhoneForLookup(verifiedFieldValues.phone_number || lead?.phone_number);
  const callFlowSections = useMemo(() => callScriptTabs.flatMap((tab) => tab.sections), []);
  const scriptSectionIndexByEyebrow = useMemo(
    () => new Map(callFlowSections.map((section, index) => [section.eyebrow, index])),
    [callFlowSections]
  );

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
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
            <span className="text-sm text-muted-foreground">Screening {screeningPhone || lead?.phone_number || "this number"}...</span>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      );
    }

    if (dncLookupError) {
      return (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>DNC screening could not be completed</AlertTitle>
            <AlertDescription>{dncLookupError}</AlertDescription>
          </Alert>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-amber-400/80 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
            onClick={() => {
              setDncLookupError(null);
              void runDncLookup(dncInputPhone || undefined);
            }}
            disabled={!normalizePhoneForLookup(dncInputPhone) && !screeningPhone}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      );
    }

    if (!dncLookupSummary) {
      const inputNormalized = normalizePhoneForLookup(dncInputPhone);
      return (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm text-muted-foreground">
            Paste the phone number below and click <strong>Verify</strong> to run DNC / TCPA screening.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="tel"
              placeholder="Paste phone number here"
              value={dncInputPhone}
              onChange={(e) => setDncInputPhone(e.target.value)}
              className="h-9 max-w-[14rem] font-mono text-sm tracking-wide border-amber-300/80 focus-visible:ring-amber-400/60"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-amber-400/80 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
              onClick={() => void runDncLookup(dncInputPhone)}
              disabled={!inputNormalized}
            >
              <Search className="h-3.5 w-3.5" />
              Verify
            </Button>
          </div>
          {dncInputPhone && !inputNormalized && (
            <p className="text-xs text-destructive">Enter a valid 10-digit US phone number.</p>
          )}
        </div>
      );
    }

    if (dncLookupSummary.isTcpaLitigator) {
      const flaggedBy = dncLookupSummary.providers
        .filter((p) => p.isTcpa)
        .map((p) => p.provider === "blacklist_alliance" ? "Blacklist Alliance" : "RealValidito");

      return (
        <Alert variant="destructive" className="animate-scale-in">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>TCPA litigator flagged</AlertTitle>
          <AlertDescription>
            This phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} appears to be flagged as a TCPA litigator. Review carefully before proceeding.
            {flaggedBy.length > 0 && (
              <span className="mt-1 block text-xs opacity-80">Confirmed by: {flaggedBy.join(", ")}</span>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    if (dncLookupSummary.isInvalid) {
      return (
        <Alert variant="destructive" className="animate-scale-in">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Invalid phone number</AlertTitle>
          <AlertDescription>
            The screened phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} appears invalid.
          </AlertDescription>
        </Alert>
      );
    }

    if (dncLookupSummary.isOnDnc === true) {
      const flaggedBy = dncLookupSummary.providers
        .filter((p) => p.isDnc)
        .map((p) => p.provider === "blacklist_alliance" ? "Blacklist Alliance" : "RealValidito");

      return (
        <Alert variant="destructive" className="animate-scale-in border-amber-500/50 text-amber-700 [&>svg]:text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Phone number is on a DNC list</AlertTitle>
          <AlertDescription>
            The screened phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} appears on a DNC list. Verbal consent must be captured clearly before proceeding.
            {flaggedBy.length > 0 && (
              <span className="mt-1 block text-xs opacity-80">Confirmed by: {flaggedBy.join(", ")}</span>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    if (dncLookupSummary.isOnDnc === null) {
      return (
        <Alert className="animate-scale-in border-slate-400/50 text-slate-700 [&>svg]:text-slate-700 dark:text-slate-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>DNC status could not be confirmed</AlertTitle>
          <AlertDescription>
            The screened phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} could not be confidently classified. Review the lookup payload before treating this number as clear.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="animate-scale-in border-emerald-500/40 text-emerald-700 [&>svg]:text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Phone number is not on a DNC list</AlertTitle>
        <AlertDescription>
          The screened phone number {dncLookupSummary.cleanedPhone || dncLookupSummary.phone} does not appear on the DNC list.
        </AlertDescription>
      </Alert>
    );
  })();

  // --- Mapping: verification field groups → script section indices ---
  // Used to auto-scroll the script panel when the agent focuses on verification fields.
  const fieldToScriptSection: Record<string, number> = {
    // 2. Basic Information → section index 1
    lead_vendor: 1, customer_full_name: 1, date_of_birth: 1, age: 1,
    birth_state: 1, social_security: 1, driver_license: 1,
    street_address: 1, city: 1, state: 1, zip_code: 1,
    phone_number: 1, email: 1,
    // 3. Accident Date Verification → section index 2
    accident_date: 2,
    // 4. Accident Location & Details → section index 3
    accident_location: 3, accident_scenario: 3,
    // 5. Fault & Liability → section index 4
    other_party_admit_fault: 4,
    // 6. Police Report → section index 5
    police_attended: 5,
    // 7. Injury Verification → section index 6
    injuries: 6, medical_attention: 6,
    // 8. Prior Attorney → section index 7
    prior_attorney_involved: 7, prior_attorney_details: 7,
    // 9-10. Vehicle / Insurance → section index 9
    insured: 9, vehicle_registration: 9, insurance_company: 9,
    third_party_vehicle_registration: 9, passengers_count: 9,
    // Witness info → section index 1 (basic)
    contact_name: 1, contact_number: 1, contact_address: 1,
    // 11. Documents → section index 10
    additional_notes: 10, medical_treatment_proof: 10,
    insurance_documents: 10, police_report: 10,
  };

  const fieldToScriptSectionEyebrow: Record<string, string> = {
    lead_vendor: "2. Basic Information",
    customer_full_name: "2. Basic Information",
    date_of_birth: "2. Basic Information",
    age: "2. Basic Information",
    birth_state: "2. Basic Information",
    social_security: "2. Basic Information",
    driver_license: "10. Driver & Vehicle Information",
    street_address: "2. Basic Information",
    city: "2. Basic Information",
    state: "2. Basic Information",
    zip_code: "2. Basic Information",
    phone_number: "2. Basic Information",
    email: "2. Basic Information",
    accident_date: "3. Accident Date Verification",
    accident_location: "4. Accident Location & Details",
    accident_scenario: "5. Fault & Liability",
    other_party_admit_fault: "5. Fault & Liability",
    police_attended: "5. Fault & Liability",
    injuries: "7. Injury Verification",
    medical_attention: "7. Injury Verification",
    prior_attorney_involved: "8. Prior Attorney Representation",
    prior_attorney_details: "8. Prior Attorney Representation",
    insured: "10. Driver & Vehicle Information",
    vehicle_registration: "10. Driver & Vehicle Information",
    insurance_company: "10. Driver & Vehicle Information",
    third_party_vehicle_registration: "10. Driver & Vehicle Information",
    passengers_count: "10. Driver & Vehicle Information",
    contact_name: "4. Accident Location & Details",
    contact_number: "4. Accident Location & Details",
    contact_address: "4. Accident Location & Details",
    additional_notes: "11. Document Collection Requirements",
    medical_treatment_proof: "7. Injury Verification",
    insurance_documents: "11. Document Collection Requirements",
    police_report: "6. Police Report",
  };

  const scriptCardRef = useRef<HTMLDivElement>(null);
  const scriptScrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Section refs for breadcrumb scroll-to navigation
  const sectionNavRefs = useRef<Record<string, HTMLElement | null>>({});

  const breadcrumbSections = useMemo(() => {
    if (showVerificationPanel && verificationSessionId) {
      return [
        { id: "safeguards", label: "Safeguards" },
        { id: "verification", label: "Verification" },
        { id: "attorney", label: "Attorney" },
        { id: "handoff", label: "Documentation" },
        { id: "result", label: "Handoff" },
      ];
    }
    return [
      { id: "workspace", label: "Workspace" },
    ];
  }, [showVerificationPanel, verificationSessionId]);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionNavRefs.current[sectionId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // ── Scroll-triggered reveal system ──
  const [revealedSections, setRevealedSections] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const getRevealObserver = useCallback(() => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const revealed: string[] = [];
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = (entry.target as HTMLElement).dataset.reveal;
              if (id) {
                revealed.push(id);
                observerRef.current?.unobserve(entry.target);
              }
            }
          });
          if (revealed.length) {
            setRevealedSections((prev) => {
              const next = new Set(prev);
              revealed.forEach((id) => next.add(id));
              return next;
            });
          }
        },
        { threshold: 0.06, rootMargin: "0px 0px -30px 0px" }
      );
    }
    return observerRef.current;
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  const revealRef = useCallback(
    (id: string, navId?: string) => (el: HTMLElement | null) => {
      if (el) {
        el.dataset.reveal = id;
        getRevealObserver().observe(el);
        if (navId) sectionNavRefs.current[navId] = el;
      }
    },
    [getRevealObserver]
  );

  const revealClass = (id: string, hiddenTransform = "translate-y-5") =>
    revealedSections.has(id)
      ? "opacity-100 translate-y-0 blur-0"
      : `opacity-0 ${hiddenTransform} blur-[6px]`;

  const revealTransition = (delay = 0, duration = 700) =>
    ({
      transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, filter ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    }) as const;

  const revealMotionClass =
    "will-change-[opacity,transform,filter] motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:blur-0 motion-reduce:transition-none";

  // When verification drives the script panel (open + scroll), we don't want the script panel's
  // intermediate scroll events (especially during smooth scroll) to bounce the verification panel back.
  const suppressLinkedScriptSyncRef = useRef(false);
  const suppressLinkedScriptSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (suppressLinkedScriptSyncTimeoutRef.current) {
        clearTimeout(suppressLinkedScriptSyncTimeoutRef.current);
      }
    };
  }, []);

  const updateLinkedScriptSection = useCallback(() => {
    if (suppressLinkedScriptSyncRef.current) return;

    const container = scriptScrollRef.current;
    if (!container || !callFlowSections.length) return;

    const containerRect = container.getBoundingClientRect();
    const anchor = container.scrollTop + container.clientHeight * 0.24;
    let nextEyebrow = callFlowSections[0]?.eyebrow ?? null;

    sectionRefs.current.forEach((sectionRef, sectionIndex) => {
      if (!sectionRef) return;

      const sectionTop =
        sectionRef.getBoundingClientRect().top - containerRect.top + container.scrollTop;

      if (sectionTop <= anchor) {
        nextEyebrow = callFlowSections[sectionIndex]?.eyebrow ?? nextEyebrow;
      }
    });

    setLinkedScriptSectionEyebrow((current) =>
      current === nextEyebrow ? current : nextEyebrow
    );
  }, [callFlowSections]);

  useEffect(() => {
    if (!showVerificationPanel) return;
    requestAnimationFrame(() => updateLinkedScriptSection());
  }, [showVerificationPanel, openScriptSections, updateLinkedScriptSection]);

  useEffect(() => {
    if (!showVerificationPanel) return;

    const card = scriptCardRef.current;
    const container = scriptScrollRef.current;
    if (!card || !container) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      if (maxScrollTop <= 0) {
        event.preventDefault();
        return;
      }

      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, container.scrollTop + event.deltaY));
      container.scrollTop = nextScrollTop;
      event.preventDefault();
    };

    card.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    return () => {
      card.removeEventListener("wheel", handleWheel, true);
    };
  }, [showVerificationPanel]);

  const focusScriptSection = (targetEyebrow: string | null | undefined) => {
    const targetIdx = targetEyebrow ? scriptSectionIndexByEyebrow.get(targetEyebrow) : undefined;
    if (targetIdx == null) return;

    suppressLinkedScriptSyncRef.current = true;
    if (suppressLinkedScriptSyncTimeoutRef.current) {
      clearTimeout(suppressLinkedScriptSyncTimeoutRef.current);
    }

    setLinkedScriptSectionEyebrow(targetEyebrow);

    // Open the matching script section
    const section = callFlowSections[targetIdx];
    if (section) {
      const sectionKey = `${section.eyebrow}-${section.title}-${targetIdx}`;
      setOpenScriptSections((prev) => ({ ...prev, [sectionKey]: true }));
    }

    // Scroll within the script panel only — never the page itself.
    // scrollIntoView would scroll ALL ancestor containers (including the window),
    // which causes a page jump when the script panel isn't in the viewport yet.
    requestAnimationFrame(() => {
      const el = sectionRefs.current[targetIdx];
      const container = scriptScrollRef.current;
      if (el && container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const nextTop = container.scrollTop + (elRect.top - containerRect.top);
        container.scrollTop = Math.max(0, nextTop);
      }
    });

    // Give the browser a moment to apply layout + scroll, then re-enable sync.
    suppressLinkedScriptSyncTimeoutRef.current = setTimeout(() => {
      suppressLinkedScriptSyncRef.current = false;
    }, 250);
  };

  // When a verification field is checked/edited, open + scroll the corresponding script section
  const handleFieldVerifiedWithSync = (fieldName: string, value: string, checked: boolean) => {
    handleFieldVerified(fieldName, value, checked);
    focusScriptSection(fieldToScriptSectionEyebrow[fieldName]);
  };

  const handleVerificationStepFocus = (stepEyebrow: string) => {
    focusScriptSection(stepEyebrow);
  };

  // ---- Pre-call cards (DNC + Disclaimer) ----
  // Always show disclaimer once DNC screening has completed
  const showDisclaimer = Boolean(dncLookupSummary);

  const preCallCards = (
    <div className={`grid grid-cols-1 items-start gap-4${showDisclaimer ? " xl:grid-cols-2" : ""}`}>
      <Card className="border-amber-200/80 bg-amber-50/30 shadow-sm">
        <Collapsible open={!isDncLookupCollapsed} onOpenChange={(open) => setIsDncLookupCollapsed(!open)}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-amber-50/60">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-900">DNC Lookup</span>
                <span className="hidden text-xs text-amber-700/70 sm:inline">TCPA / DNC screening</span>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-amber-700 transition-transform ${!isDncLookupCollapsed ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-amber-200/60 px-5 pb-4 pt-3">{dncLookupCardContent}</div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {showDisclaimer && (
        <Card className="border-amber-200/60 bg-amber-50/20 shadow-sm">
          <Collapsible open={!isDisclaimerCollapsed} onOpenChange={(open) => setIsDisclaimerCollapsed(!open)}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-amber-50/40">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-900">Disclaimer Required</span>
                  <span className="hidden text-xs text-amber-700/70 sm:inline">Verbal consent needed</span>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-amber-700 transition-transform ${!isDisclaimerCollapsed ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2.5 border-t border-amber-200/40 px-5 pb-4 pt-3">
                <div className="rounded-md border border-amber-200/80 bg-white px-3.5 py-2.5 text-[13px] leading-6 text-foreground">
                  Is your phone number{" "}
                  <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-800">
                    {lead?.phone_number || "on file"}
                  </span>{" "}
                  on the Federal, National or State Do Not Call List?
                </div>

                <div className="flex items-start gap-2 rounded-md bg-amber-100/40 px-3.5 py-2">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                  <p className="text-[11px] leading-4 text-amber-800">
                    If a customer says <strong>no</strong> and we see it's on the DNC list, we still have to take verbal consent.
                  </p>
                </div>

                <div className="rounded-md border border-amber-200/80 bg-white px-3.5 py-2.5 text-[13px] leading-6 text-foreground">
                  Sir/Ma'am, even if your phone number is on the Federal National or State Do Not Call List, do we still
                  have your permission to call you and submit your application to Accident Claims Helpline via your
                  phone number{" "}
                  <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-800">
                    {lead?.phone_number || "on file"}
                  </span>
                  ? And do we have your permission to call you on the same phone number in the future if needed?
                </div>

                <div className="flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-400/10 px-3.5 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <p className="text-[13px] font-semibold text-amber-900">Make sure you get a clear YES on it.</p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );

  // ---- Script card (standalone, used side-by-side with verification) ----
  const scriptCard = (
    <Card
      ref={scriptCardRef}
      className="flex min-h-[30rem] flex-col overflow-hidden border-[#2b333f]/80 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.8)] lg:h-[calc(100dvh-8rem)]"
    >
      <div className="flex-shrink-0 border-b border-[#384252]/95 bg-[linear-gradient(90deg,#161c24_0%,#1d2530_34%,#28313d_66%,#333d4a_100%)] text-slate-100">
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-slate-200" />
            <span className="text-sm font-bold tracking-tight text-white">Script</span>
            <span className="hidden text-xs text-slate-200/85 sm:inline">MVA Intake Call Flow</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-300/75">
            Live Reference
          </div>
        </div>
        <div className="min-h-[2.75rem] px-5 pb-3">
          <div className="flex h-full flex-col justify-center gap-1 pt-2">
            <div className="overflow-x-auto whitespace-nowrap text-[10px] leading-4 text-slate-200/80 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {scriptHeaderCheckpoints.map(({ label, hint }, index) => (
                <span key={label}>
                  {index > 0 ? <span className="px-2 text-slate-300/35">|</span> : null}
                  <span className="font-semibold text-white">{label}:</span>{" "}
                  <span>{hint}</span>
                </span>
              ))}
            </div>
            <div className="overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-1.5">
                {[scriptHighlights[0], scriptHighlights[1], scriptHighlights[4]].map((highlight) => (
                  <Badge
                    key={highlight}
                    variant="secondary"
                    className="rounded-full border border-white/12 bg-white/8 px-2.5 py-0 text-[9px] font-medium text-slate-100 shadow-none"
                  >
                    {highlight}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <CardContent
        className="pt-3 flex-1 min-h-0 overflow-y-auto overscroll-y-none"
        ref={scriptScrollRef}
        onScroll={updateLinkedScriptSection}
      >
        <div className="space-y-3">
          {callFlowSections.map((section, sectionIndex) => {
            const sectionKey = `${section.eyebrow}-${section.title}-${sectionIndex}`;
            const defaultOpen = sectionIndex === 0;
            const isSectionOpen = openScriptSections[sectionKey] ?? defaultOpen;
            const isLinkedSection = linkedScriptSectionEyebrow === section.eyebrow;

            return (
              <div key={sectionKey} ref={(el) => { sectionRefs.current[sectionIndex] = el; }}>
                <Collapsible open={isSectionOpen} onOpenChange={() => toggleScriptSection(sectionKey, defaultOpen)}>
                  <div
                    className={`rounded-lg border transition-all ${
                      isLinkedSection
                        ? "border-[#4b5666]/45 bg-[linear-gradient(180deg,rgba(96,111,131,0.14)_0%,rgba(240,244,248,0.96)_100%)] shadow-[0_16px_34px_-24px_rgba(30,41,59,0.5)]"
                        : "border-border/60 bg-card"
                    }`}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                          isLinkedSection ? "hover:bg-[#e6ebf2]/55" : "hover:bg-muted/20"
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {section.eyebrow}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                              {sectionIndex + 1}/{callFlowSections.length}
                            </span>
                            {isLinkedSection ? (
                              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#45505f] animate-pulse" />
                            ) : null}
                          </div>
                          <h3 className="text-[13px] font-semibold text-foreground leading-snug">{section.title}</h3>
                          {section.summary && !isSectionOpen ? (
                            <p className="text-xs leading-5 text-muted-foreground line-clamp-1">{section.summary}</p>
                          ) : null}
                        </div>
                        <div className="mt-0.5 shrink-0 text-muted-foreground">
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                              isSectionOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div
                        className={`space-y-2.5 border-t px-4 pb-3.5 pt-3 ${
                          isLinkedSection ? "border-[#4b5666]/16 bg-[#f6f8fb]/82" : "border-border/40"
                        }`}
                      >
                        {section.summary ? (
                          <p className="text-[13px] leading-6 text-muted-foreground">{section.summary}</p>
                        ) : null}

                        {section.script?.length ? (
                          <div className="rounded-md border border-primary/10 bg-primary/[0.03] px-3.5 py-2.5">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/70">
                              Read to Caller
                            </div>
                            <div className="space-y-1.5 text-[13px] leading-6 text-foreground">
                              {section.script.map((line) => (
                                <p key={line}>{line}</p>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {section.questions?.length ? (
                          <div>
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Ask
                            </div>
                            <ul className="space-y-1.5 text-[13px] leading-6 text-foreground">
                              {section.questions.map((item) => (
                                <li key={item} className="flex gap-2">
                                  <span className="mt-[0.5rem] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {section.checklist?.length ? (
                          <div>
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Checklist
                            </div>
                            <ul className="space-y-1 text-[13px] leading-6 text-foreground">
                              {section.checklist.map((item) => (
                                <li key={item} className="flex gap-2">
                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {section.tips?.length ? (
                          <div className="rounded-md bg-sky-50/70 px-3.5 py-2.5">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                              Tips
                            </div>
                            <ul className="space-y-1 text-[12px] leading-5 text-sky-900">
                              {section.tips.map((item) => (
                                <li key={item} className="flex gap-1.5">
                                  <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-sky-500" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {section.redFlags?.length ? (
                          <div className="rounded-md bg-rose-50/70 px-3.5 py-2.5">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700">
                              Red Flags
                            </div>
                            <ul className="space-y-1 text-[12px] leading-5 text-rose-900">
                              {section.redFlags.map((item) => (
                                <li key={item} className="flex gap-1.5">
                                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {section.notes?.length ? (
                          <div className="rounded-md bg-amber-50/70 px-3.5 py-2.5">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                              Notes
                            </div>
                            <ul className="space-y-1 text-[12px] leading-5 text-amber-900">
                              {section.notes.map((item) => (
                                <li key={item} className="flex gap-1.5">
                                  <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-amber-500" />
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
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  const assignedAttorneyProfile = currentAssignedAttorneyId
    ? attorneys.find((attorney) => attorney.user_id === currentAssignedAttorneyId)
    : null;
  const selectedAssignedAttorneyLabel =
    assignedAttorneyProfile?.full_name?.trim() ||
    assignedAttorneyProfile?.primary_email?.trim() ||
    currentAssignedAttorneyId ||
    "";
  const selectedHandoffAttorneyLabel =
    attorneyFulfillmentMode === "broker"
      ? selectedSubmittedLawyer?.attorney_name || ""
      : selectedAssignedAttorneyLabel;
  const handoffLawFirmLabel = selectedHandoffAttorneyLabel || "the receiving law firm";
  const handoffLawFirmCueLabel = selectedHandoffAttorneyLabel
    ? selectedHandoffAttorneyLabel
    : "(The receiving law firm)";
  const handoffCallerFullName =
    String(contractRecipientName || lead?.customer_full_name || "").trim() || "the client";
  const handoffCallerFirstName = getPreferredFirstName(contractRecipientName || lead?.customer_full_name);
  const attorneyDisclosureBullets = useMemo(() => {
    const lawFirmReference = selectedHandoffAttorneyLabel || "the selected law firm";

    return [
      selectedHandoffAttorneyLabel
        ? `Before we move forward, I want to confirm that the law firm we are partnering you with is ${selectedHandoffAttorneyLabel}.`
        : "Before we move forward, I want to confirm the law firm we are partnering you with for this matter.",
      "Accident Claims Helpline is not the law firm, does not own or control the law firm, and is acting only as an independent intake and referral partner.",
      `With your permission, we will share the information you provided with ${lawFirmReference} so they can review your matter, contact you directly, and discuss representation and next steps with you.`,
      `Do you agree to be connected with ${lawFirmReference}, and do you authorize Accident Claims Helpline and ${lawFirmReference} to communicate with each other as needed about your case, including follow-up and case-related correspondence?`,
    ];
  }, [selectedHandoffAttorneyLabel]);
  const myCasesHandoffSections = useMemo(
    () => [
      {
        audience: "Say to receiving attorney / firm",
        tone: "firm" as const,
        bullets: [
          `${handoffLawFirmCueLabel}, please open the My Cases section from the lawyer portal to review the case details and notes from today's call.`,
          `${handoffCallerFullName} is on the phone with me now.`,
          "The most recent case information, notes, and supporting details are already in My Cases.",
          "I’m handing the call over to you now.",
        ],
      },
      {
        audience: "Say to caller",
        tone: "caller" as const,
        bullets: [
          handoffCallerFirstName
            ? `Mr./Ms. ${handoffCallerFirstName}, thank you for your time today.`
            : "Thank you for your time today.",
          `I’m now connecting you with ${handoffLawFirmLabel}.`,
          "If you need anything else from our team, please feel free to reach out.",
          "Have a great rest of your day.",
        ],
      },
    ],
    [handoffCallerFirstName, handoffCallerFullName, handoffLawFirmCueLabel, handoffLawFirmLabel],
  );
  const defaultRetainerState = useMemo(
    () => String(verifiedFieldValues?.state || lead?.state || "").trim().toUpperCase(),
    [verifiedFieldValues?.state, lead?.state],
  );
  const selectedRetainerStateName =
    US_STATES.find((state) => state.code === selectedRetainerState)?.name || selectedRetainerState;
  const filteredContractTemplates = useMemo(() => {
    if (!selectedRetainerState) return contractTemplates;
    return contractTemplates.filter(
      (template) => template.states.length === 0 || template.states.includes(selectedRetainerState),
    );
  }, [contractTemplates, selectedRetainerState]);
  const retainerProgress = useMemo(() => {
    const hasBeenSent = Boolean(lastEnvelopeId);
    const hasBeenViewed = false;
    const hasBeenSigned = false;
    const currentStepIndex = hasBeenSigned ? 3 : hasBeenViewed ? 2 : hasBeenSent ? 1 : 0;
    const steps = [
      {
        label: "Not Sent",
        helper: "Waiting to send",
      },
      {
        label: "Sent",
        helper: "Envelope delivered",
      },
      {
        label: "Viewed",
        helper: "Client opened it",
      },
      {
        label: "Signed",
        helper: "Retainer complete",
      },
    ];

    return {
      currentStepIndex,
      currentStepLabel: steps[currentStepIndex]?.label ?? steps[0].label,
      steps: steps.map((step, index) => ({
        ...step,
        isComplete: index < currentStepIndex,
        isCurrent: index === currentStepIndex,
      })),
    };
  }, [lastEnvelopeId]);
  const handoffCardClass = "overflow-hidden border-[#f2d5c1] shadow-sm";
  const contractHeaderSurfaceClass = "bg-[linear-gradient(90deg,rgba(234,117,38,0.52)_0%,rgba(234,117,38,0.52)_100%)]";
  const contractHeaderClass = `border-b border-[#efbb93] ${contractHeaderSurfaceClass} px-5 py-3.5`;
  const uploadHeaderClass = "border-b border-[#e1893b] bg-[linear-gradient(90deg,rgba(225,137,59,0.84)_0%,rgba(225,137,59,0.84)_100%)] px-5 py-3.5";
  const handoffHeaderContentClass = "flex items-center justify-between gap-3";
  const handoffIconClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#efbb93]/70 bg-[#fff2e8] text-[#b85a20]";
  const uploadIconClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e1893b]/75 bg-[#ffead2] text-[#984617]";
  const handoffChevronClass = "shrink-0 rounded-md border border-[#efbb93]/70 bg-white/80 p-1";
  const uploadChevronClass =
    "shrink-0 rounded-md border border-white/85 bg-white/95 p-1 text-[#984617] shadow-sm transition-colors hover:bg-white";
  const handoffInfoButtonClass =
    "inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#efbb93]/70 bg-white/85 text-[#9a5a33] transition-colors hover:bg-[#fff3ea]";
  const uploadInfoButtonClass =
    "inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#efbb93]/70 bg-white/85 text-[#9a5a33] transition-colors hover:bg-[#fff3ea]";
  const scriptGuideCardClass = "overflow-hidden border-[#2b333f]/80 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.8)]";
  const scriptGuideHeaderClass =
    "border-b border-[#384252]/95 bg-[linear-gradient(90deg,#161c24_0%,#1d2530_34%,#28313d_66%,#333d4a_100%)] text-slate-100";
  const scriptGuideChevronClass =
    "shrink-0 rounded-md border border-white/12 bg-white/8 p-1 text-slate-100 transition-colors hover:bg-white/12";
  const scriptGuideStepBadgeClass =
    "rounded-full border-[#384252]/95 bg-[linear-gradient(90deg,#161c24_0%,#1d2530_34%,#28313d_66%,#333d4a_100%)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-none";

  // ---- Contract / DocuSign card ----
  const contractCard = (
    <Card className={handoffCardClass}>
      <Collapsible open={!isContractCollapsed} onOpenChange={(open) => setIsContractCollapsed(!open)}>
        <CardHeader className={contractHeaderClass}>
          <div className={handoffHeaderContentClass}>
            <div className="flex min-w-0 items-center gap-3">
              <div className={handoffIconClass}>
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="text-sm font-semibold text-foreground">DocuSign Retainer Agreement</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={handoffInfoButtonClass} aria-label="DocuSign retainer agreement info">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-sm">
                    <div className="space-y-2">
                      <div className="font-semibold text-foreground">DocuSign Retainer Agreement</div>
                      <p className="text-muted-foreground">
                        Choose the lead state to narrow retainer templates, confirm client details, send the agreement,
                        and use the status panel as the current frontend preview for send, viewed, and signed states.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={handoffChevronClass}
                aria-label={isContractCollapsed ? "Expand retainer agreement" : "Collapse retainer agreement"}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                    !isContractCollapsed ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-5 pb-5 pt-4">
            <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
              <div className="flex h-full flex-col">
                <div className="space-y-4">
                {selectedHandoffAttorneyLabel ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="font-medium text-emerald-800">{selectedHandoffAttorneyLabel}</span>
                    <span className="text-xs text-emerald-700/70">selected above</span>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Select an attorney above to keep this retainer step aligned with the current recommendation.
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">State</Label>
                    <Select value={selectedRetainerState} onValueChange={setSelectedRetainerState}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select a state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((state) => (
                          <SelectItem key={state.code} value={state.code}>
                            {state.code} - {state.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Template</Label>
                    {loadingTemplates ? (
                      <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading templates...
                      </div>
                    ) : (
                      <Select
                        value={selectedTemplateId}
                        onValueChange={setSelectedTemplateId}
                        disabled={filteredContractTemplates.length === 0}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredContractTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {!loadingTemplates && selectedRetainerState && filteredContractTemplates.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No templates are currently available for {selectedRetainerStateName}. Choose a different state to continue.
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Name</Label>
                    <Input
                      id="contractRecipientName"
                      type="text"
                      value={contractRecipientName}
                      onChange={(e) => setContractRecipientName(e.target.value)}
                      placeholder="Full name"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Email</Label>
                    <Input
                      id="contractRecipientEmail"
                      type="email"
                      value={contractRecipientEmail}
                      onChange={(e) => setContractRecipientEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {lastEnvelopeId ? (
                  <div className="rounded-xl border border-[#f2d5c1] bg-[#fff8f2] px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Envelope ID
                    </div>
                    <div className="mt-1 font-mono text-sm text-foreground">{lastEnvelopeId}</div>
                  </div>
                ) : null}
                </div>

                <div className="mt-auto pt-4">
                  <Button
                    onClick={handleSendContract}
                    disabled={sendingContract || loadingTemplates || !selectedTemplateId}
                    size="sm"
                    className={`w-full rounded-md border border-[#efbb93] !bg-transparent ${contractHeaderSurfaceClass} text-white shadow-[0_16px_28px_-18px_rgba(185,83,23,0.22)] hover:bg-[linear-gradient(90deg,rgba(234,117,38,0.66)_0%,rgba(234,117,38,0.66)_100%)]`}
                  >
                    {sendingContract ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      "Send Retainer Agreement"
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex h-full flex-col rounded-[20px] border border-[#f2d5c1] bg-[linear-gradient(180deg,rgba(255,245,236,0.92)_0%,rgba(255,255,255,0.98)_100%)] p-4 shadow-[0_18px_36px_-30px_rgba(234,117,38,0.22)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">Agreement Status</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void refreshRetainerStatusView()}
                    disabled={refreshingRetainerStatus}
                    className="gap-2 rounded-md border-[#e6b086] bg-[#fff4ea] text-[#7a3718] shadow-sm hover:bg-[#ffe9d8] hover:text-[#6a2d13]"
                  >
                    <RefreshCw className={refreshingRetainerStatus ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                    Refresh
                  </Button>
                </div>

                <div className="mt-4 rounded-xl border border-[#f2d5c1] bg-white/78 px-3.5 py-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.28)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Retainer Progress
                    </div>
                    <div className="text-xs font-medium text-[#8b4a1f]">{retainerProgress.currentStepLabel}</div>
                  </div>

                  <div className="mt-3 flex items-start">
                    {retainerProgress.steps.map((step, index) => {
                      const markerClass = step.isComplete
                        ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_8px_16px_-12px_rgba(34,197,94,0.9)]"
                        : step.isCurrent
                          ? "border-[#ea7526] bg-[#fff2e8] text-[#b85a20] shadow-[0_10px_18px_-14px_rgba(234,117,38,0.85)]"
                          : "border-slate-200 bg-white text-muted-foreground";
                      const connectorClass = index < retainerProgress.currentStepIndex ? "bg-emerald-400/90" : "bg-slate-200";

                      return (
                        <div key={step.label} className="flex min-w-0 flex-1 items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center">
                              <div
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${markerClass}`}
                              >
                                {step.isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                              </div>
                              {index < retainerProgress.steps.length - 1 ? (
                                <div className={`mx-2 h-[3px] flex-1 rounded-full ${connectorClass}`} />
                              ) : null}
                            </div>
                            <div className="mt-2 pr-2">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
                                {step.label}
                              </div>
                              <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{step.helper}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-auto pt-3 text-[11px] text-muted-foreground">
                  {retainerStatusLastCheckedAt
                    ? `Last refreshed ${new Date(retainerStatusLastCheckedAt).toLocaleString()}`
                    : "Refresh this panel after sending to keep the retainer progress current."}
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  const docusignGuideCard = (
    <Card className={scriptGuideCardClass}>
      <Collapsible open={!isDocusignGuideCollapsed} onOpenChange={(open) => setIsDocusignGuideCollapsed(!open)}>
        <div className={scriptGuideHeaderClass}>
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-slate-200" />
              <span className="text-sm font-bold tracking-tight text-white">DocuSign Signing Script</span>
            </div>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={scriptGuideChevronClass}
                aria-label={isDocusignGuideCollapsed ? "Expand DocuSign signing script" : "Collapse DocuSign signing script"}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                    !isDocusignGuideCollapsed ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
          </div>
          <p className="px-5 pb-3 text-xs leading-5 text-slate-200/80">
            Match what the signer sees to the screenshots below and guide them one step at a time. Click any image to
            enlarge it.
          </p>
        </div>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-3">
              {docusignDesktopGuideSteps.map((step) => (
                <div
                  key={step.step}
                  className="group/step rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:border-[#4b5666]/35 hover:bg-[linear-gradient(180deg,rgba(96,111,131,0.08)_0%,rgba(255,255,255,0.98)_100%)] hover:shadow-[0_18px_36px_-28px_rgba(30,41,59,0.34)] lg:flex lg:items-center lg:gap-3"
                >
                  <div className="space-y-2 lg:w-fit lg:min-w-[24rem] lg:max-w-[46rem] lg:flex-none lg:self-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={scriptGuideStepBadgeClass}>
                        {step.step}
                      </Badge>
                      <div className="text-sm font-semibold text-foreground">{step.title}</div>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{step.body}</p>
                  </div>

                  <div className="hidden lg:flex lg:min-w-[5rem] lg:flex-1 items-center">
                    <div className="h-px flex-1 bg-border/60 transition-colors duration-200 group-hover/step:bg-[#4b5666]/45" />
                    <div className="mx-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border/60 bg-muted/40 transition-colors duration-200 group-hover/step:border-[#4b5666]/35 group-hover/step:bg-[rgba(96,111,131,0.12)]">
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/55 transition-colors duration-200 group-hover/step:bg-[#4b5666]" />
                    </div>
                    <div className="h-px flex-1 bg-border/60 transition-colors duration-200 group-hover/step:bg-[#4b5666]/45" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-start gap-2.5 lg:mt-0 lg:flex-none lg:justify-start">
                    {step.images.map((image) => (
                      <Popover key={image.src}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="w-[15rem] max-w-full overflow-hidden rounded-lg border border-border/60 bg-white shadow-sm transition-all duration-200 hover:scale-[1.01] group-hover/step:border-[#4b5666]/25"
                            aria-label={`Preview ${step.title} screenshot`}
                          >
                            <img
                              src={image.src}
                              alt={image.alt}
                              loading="lazy"
                              className="h-36 w-full object-contain bg-white"
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[30rem] p-2">
                          <div className="space-y-2">
                            <img
                              src={image.src}
                              alt={image.alt}
                              className="max-h-[28rem] w-full rounded-md border border-border/60 object-contain bg-white"
                            />
                            <p className="text-xs leading-5 text-muted-foreground">{image.alt}</p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  const documentUploadCard = (
    <Card className={handoffCardClass}>
      <Collapsible open={!isDocumentUploadCollapsed} onOpenChange={(open) => setIsDocumentUploadCollapsed(!open)}>
        <CardHeader className={uploadHeaderClass}>
          <div className={handoffHeaderContentClass}>
            <div className="flex min-w-0 items-center gap-3">
              <div className={uploadIconClass}>
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="text-sm font-semibold text-foreground">Document Upload</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={uploadInfoButtonClass} aria-label="Document upload info">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-sm">
                    <div className="space-y-2">
                      <div className="font-semibold text-foreground">Document Upload</div>
                      <p className="text-muted-foreground">
                        Create a secure upload link for the client, monitor requested police, insurance, and medical
                        documents, and expand the live upload preview only when you need to review the files.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={uploadChevronClass}
                aria-label={isDocumentUploadCollapsed ? "Expand document upload" : "Collapse document upload"}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                    !isDocumentUploadCollapsed ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <div className="px-5 pb-5 pt-4">
            <DocumentUploadCard
              submissionId={submissionId!}
              customerPhoneNumber={lead?.phone_number}
              embedded
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  const myCasesHandoffGuideCard = (
    <Card className={scriptGuideCardClass}>
      <Collapsible open={!isMyCasesGuideCollapsed} onOpenChange={(open) => setIsMyCasesGuideCollapsed(!open)}>
        <div className={scriptGuideHeaderClass}>
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-slate-200" />
              <span className="text-sm font-bold tracking-tight text-white">Handoff Script</span>
            </div>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={scriptGuideChevronClass}
                aria-label={isMyCasesGuideCollapsed ? "Expand My Cases handoff script" : "Collapse My Cases handoff script"}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                    !isMyCasesGuideCollapsed ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
          </div>
          <p className="px-5 pb-3 text-xs leading-5 text-slate-200/80">
            Use these bullets right before the final transfer. Read the attorney section first, then close with the
            caller.
          </p>
        </div>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Receiving firm
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{handoffLawFirmCueLabel}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Caller
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{handoffCallerFullName}</div>
              </div>
            </div>

            <div className="space-y-3">
              {myCasesHandoffSections.map((section) => (
                <div
                  key={section.audience}
                  className="group/step rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:border-[#4b5666]/35 hover:bg-[linear-gradient(180deg,rgba(96,111,131,0.08)_0%,rgba(255,255,255,0.98)_100%)] hover:shadow-[0_18px_36px_-28px_rgba(30,41,59,0.34)]"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={scriptGuideStepBadgeClass}
                      >
                        {section.tone === "firm" ? "Attorney" : "Caller"}
                      </Badge>
                      <div className="text-sm font-semibold text-foreground">{section.audience}</div>
                    </div>

                    <ul className="space-y-2 text-sm leading-6 text-foreground">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-2">
                          <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  const brokerAccidentDate = useMemo(() => {
    const rawDate = verifiedFieldValues?.accident_date || lead?.accident_date || "";
    if (!rawDate) return undefined;

    const parsed = new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [verifiedFieldValues?.accident_date, lead?.accident_date]);

  const attorneyRecommendationCard = lead ? (
    <Card className="overflow-hidden border-[#f2d5c1] shadow-sm">
      <Collapsible
        open={!isAttorneyRecommendationCollapsed}
        onOpenChange={(open) => setIsAttorneyRecommendationCollapsed(!open)}
      >
        <CardHeader className="border-b border-[#f2d5c1] bg-[#fff2e8] px-5 py-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#efbb93]/70 bg-white text-[#b85a20] shadow-[0_8px_20px_-16px_rgba(184,90,32,0.35)]">
                  <Scale className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm font-bold tracking-tight text-foreground">
                  Attorney Recommendations
                </CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#f0c9af] bg-white/85 text-[#9a5a33] transition-colors hover:bg-[#fff3ea]"
                      aria-label="Attorney recommendation info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-sm">
                    <div className="space-y-2">
                      <div className="font-semibold text-foreground">Selection paths</div>
                      <p className="text-muted-foreground">
                        Use <strong>Internal Lawyer Orders</strong> to assign the lead through open internal inventory.
                        Switch to <strong>Broker Fulfillment</strong> to choose a broker-side lawyer for submission.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={attorneyFulfillmentMode}
                onValueChange={(value) => setAttorneyFulfillmentMode(value as "internal" | "broker")}
              >
                <SelectTrigger className="h-8.5 min-w-[220px] bg-white/90 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal Lawyer Orders</SelectItem>
                  <SelectItem value="broker">Broker Fulfillment</SelectItem>
                </SelectContent>
              </Select>

              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={handoffChevronClass}
                  aria-label={isAttorneyRecommendationCollapsed ? "Expand attorney recommendations" : "Collapse attorney recommendations"}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                      !isAttorneyRecommendationCollapsed ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            <div key={attorneyFulfillmentMode} className="animate-fade-in-up motion-reduce:animate-none">
              {attorneyFulfillmentMode === "internal" ? (
                <OrderRecommendationsCard
                  submissionId={submissionId!}
                  leadId={lead.id}
                  leadOverrides={{
                    state: lead.state,
                    insured: lead.insured ?? null,
                    prior_attorney_involved: lead.prior_attorney_involved ?? null,
                  }}
                  currentAssignedAttorneyId={currentAssignedAttorneyId}
                  onAssigned={({ lawyerId }) => setCurrentAssignedAttorneyId(lawyerId)}
                  onUnassigned={() => setCurrentAssignedAttorneyId(null)}
                  layout="horizontal"
                  hideHeader
                />
              ) : (
                <QualifiedLawyersCard
                  leadState={verifiedFieldValues?.state || lead.state}
                  accidentDate={brokerAccidentDate}
                  policeReport={verifiedFieldValues?.police_report}
                  insuranceDocuments={verifiedFieldValues?.insurance_documents}
                  medicalTreatmentProof={verifiedFieldValues?.medical_treatment_proof}
                  driverLicense={verifiedFieldValues?.driver_license}
                  selectedLawyerId={selectedSubmittedLawyer?.id}
                  onLawyerSelect={setSelectedSubmittedLawyer}
                  hideHeader
                />
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  ) : null;

  const attorneyDisclosureCard = (
    <Card className="border-amber-200/60 bg-amber-50/20 shadow-sm">
      <Collapsible
        open={!isAttorneyDisclosureCollapsed}
        onOpenChange={(open) => setIsAttorneyDisclosureCollapsed(!open)}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-amber-50/40"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-900">Partner Law Firm Disclosure</span>
              <span className="hidden text-xs text-amber-700/70 sm:inline">Verbal agreement required</span>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-amber-700 transition-transform ${
                !isAttorneyDisclosureCollapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2.5 border-t border-amber-200/40 px-5 pb-4 pt-3">
            <div className="flex items-start gap-2 rounded-md bg-amber-100/40 px-3.5 py-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
              <p className="text-[11px] leading-4 text-amber-800">
                Use this after a law firm has been selected above and before moving into documentation or handoff.
              </p>
            </div>

            <div className="rounded-md border border-amber-200/80 bg-white px-3.5 py-2.5 text-[13px] leading-6 text-foreground">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                Read to Caller
              </div>
              <ul className="space-y-2">
                {attorneyDisclosureBullets.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-[0.7rem] h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-400/10 px-3.5 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-700" />
              <p className="text-[13px] font-semibold text-amber-900">
                Get a clear verbal YES to the selected law firm and to case-related communication between our team and that firm.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  // ---- Backwards-compatible combined cards (for non-verification layout) ----
  const callSupportCards = (
    <div className="space-y-4">
      {preCallCards}
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
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-300 ease-out ${
                      !isScriptCollapsed ? "rotate-180" : ""
                    }`}
                  />
                  {isScriptCollapsed ? "Expand" : "Collapse"}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="mb-3 rounded-xl border bg-muted/20 px-4 py-3">
                <div className="text-sm font-semibold text-foreground">Call Flow</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Full intake flow, verification checkpoints, documentation, handoff, and internal review in one place.
                </p>
              </div>

              <ScrollArea className="h-[36rem] rounded-xl border bg-background">
                <div className="space-y-4 p-4">
                  {callFlowSections.map((section, sectionIndex) => {
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
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform duration-300 ease-out ${
                                    isSectionOpen ? "rotate-180" : ""
                                  }`}
                                />
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
                                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Questions To Ask</div>
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
                                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Checklist</div>
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
                                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">Verification Tips</div>
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
                                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-800">Red Flags</div>
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
                                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">Internal Notes</div>
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
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
      {contractCard}
      {docusignGuideCard}
      {documentUploadCard}
      {myCasesHandoffGuideCard}
    </div>
  );

  const flowConnector = (id: string, label: string, delay = 0) => (
    <div
      ref={revealRef(id)}
      className={`flex flex-col items-center py-1 ${revealMotionClass} ${revealClass(id, "translate-y-4")}`}
      style={revealTransition(delay, 620)}
    >
      <div className="h-5 w-px bg-border/60" />
      <div className="rounded-full border border-border/60 bg-muted/40 px-3.5 py-1 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      </div>
      <div className="h-5 w-px bg-border/60" />
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
    if (!submissionId) {
      setCurrentAssignedAttorneyId(assignedAttorneyId || null);
      return;
    }

    let cancelled = false;

    const loadAssignedAttorney = async () => {
      try {
        const { data, error } = await supabase
          .from("daily_deal_flow")
          .select("assigned_attorney_id")
          .eq("submission_id", submissionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setCurrentAssignedAttorneyId(assignedAttorneyId || null);
          return;
        }

        const row = data as { assigned_attorney_id?: string | null } | null;
        setCurrentAssignedAttorneyId(row?.assigned_attorney_id ? String(row.assigned_attorney_id) : (assignedAttorneyId || null));
      } catch {
        if (!cancelled) {
          setCurrentAssignedAttorneyId(assignedAttorneyId || null);
        }
      }
    };

    void loadAssignedAttorney();

    return () => {
      cancelled = true;
    };
  }, [submissionId, assignedAttorneyId]);

  const runDncLookup = useCallback(async (manualPhone?: string) => {
    const phone = manualPhone ? normalizePhoneForLookup(manualPhone) : screeningPhone;
    if (!phone) {
      setDncLookupSummary(null);
      setDncLookupError(null);
      return;
    }

    setDncLookupLoading(true);
    setDncLookupError(null);

    try {
      const { data, error } = await supabase.functions.invoke("dnc-lookup", {
        body: { mobileNumber: phone, leadId: lead?.id ?? null },
      });

      if (error) throw error;

      const summary = summarizeDncLookup(data, phone);
      setDncLookupSummary(summary);

      if (summary.isTcpaLitigator) {
        setShowTcpaBlockedModal(true);
      }
    } catch (error) {
      console.error("DNC lookup failed:", error);
      setDncLookupSummary(null);
      setDncLookupError(error instanceof Error ? error.message : "Failed to run DNC screening");
    } finally {
      setDncLookupLoading(false);
    }
  }, [screeningPhone, lead?.id]);

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

  // Fetch template names from DocuSign and seed recipient name from lead
  useEffect(() => {
    if (!DOCUSIGN_TEMPLATE_IDS.length) return;
    setLoadingTemplates(true);
    Promise.all(
      DOCUSIGN_TEMPLATE_IDS.map(async (id) => {
        try {
          const res = await supabase.functions.invoke<{ name?: string }>("docusign-send-contract", {
            body: { templateId: id, recipientEmail: "noop@example.com", debug: true },
          });
          return { id, name: res.data?.name || id, states: extractTemplateStates(res.data?.name || id) };
        } catch {
          return { id, name: id, states: extractTemplateStates(id) };
        }
      })
    ).then((templates) => {
      const uniqueTemplates = Array.from(
        new Map(templates.map((template) => [template.id, template])).values(),
      );
      setContractTemplates(uniqueTemplates);
    }).finally(() => setLoadingTemplates(false));
  }, []);

  useEffect(() => {
    if (defaultRetainerState && !selectedRetainerState) {
      setSelectedRetainerState(defaultRetainerState);
    }
  }, [defaultRetainerState, selectedRetainerState]);

  useEffect(() => {
    setSelectedTemplateId((currentTemplateId) =>
      filteredContractTemplates.some((template) => template.id === currentTemplateId)
        ? currentTemplateId
        : filteredContractTemplates[0]?.id ?? "",
    );
  }, [filteredContractTemplates]);

  useEffect(() => {
    if (lead?.customer_full_name && !contractRecipientName) {
      setContractRecipientName(lead.customer_full_name);
    }
  }, [lead?.customer_full_name]);

  const refreshRetainerStatusView = useCallback(async () => {
    setRefreshingRetainerStatus(true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    setRetainerStatusLastCheckedAt(new Date().toISOString());
    setRefreshingRetainerStatus(false);
  }, []);

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

    if (!selectedTemplateId) {
      toast({
        title: "Error",
        description: "Please select a contract template",
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
          recipientName: (contractRecipientName || "").trim() || email,
          accidentDate: lead?.accident_date || "",
          templateId: selectedTemplateId,
        },
      });

      if (response.error) throw response.error;

      const envelopeId = response.data?.envelopeId ?? null;
      setLastEnvelopeId(envelopeId);
      setRetainerStatusLastCheckedAt(new Date().toISOString());

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
      <div className="min-h-full bg-muted/30">
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="space-y-8 animate-fade-in">
            {/* Breadcrumb skeleton */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-3" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-3" />
                <Skeleton className="h-4 w-16" />
              </div>
              {/* Name skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>

            {/* DNC card skeleton */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-6 w-80" />
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>

            {/* Two-column skeleton */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Skeleton className="h-80 w-full rounded-lg" />
              <Skeleton className="h-80 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
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
    <div className="min-h-full bg-muted/30">
      {/* ── TCPA Litigator Block Modal ── */}
      <AlertDialog open={showTcpaBlockedModal}>
        <AlertDialogContent className="border-red-500/60 bg-red-50 dark:bg-red-950/80">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              TCPA Litigator Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-red-700/90 dark:text-red-300/90">
              <p className="font-medium">
                Continuing this call is not permitted.
              </p>
              <p>
                The phone number <span className="font-mono font-semibold">{dncLookupSummary?.cleanedPhone || dncLookupSummary?.phone || screeningPhone}</span> has been identified as a TCPA litigator. This lead has been deactivated and will no longer appear in the portal.
              </p>
              <p className="text-sm">
                Any further contact with this number could expose the company to significant legal liability. Please end the call immediately if still connected.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setShowTcpaBlockedModal(false);
                navigate("/transfer-portal");
              }}
            >
              Acknowledged — Return to Portal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="space-y-8">
        {/* ── Header ── */}
        <div className="space-y-4 animate-fade-in-up">
          {/* Breadcrumb navigation */}
          <nav className="flex items-center gap-1.5 text-[13px]">
            <button
              type="button"
              onClick={() => navigate("/transfer-portal")}
              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Transfer Portal
            </button>
            {breadcrumbSections.map((section) => (
              <div key={section.id} className="flex items-center gap-1.5">
                <span className="text-muted-foreground/40 select-none">&gt;</span>
                <button
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {section.label}
                </button>
              </div>
            ))}
          </nav>

          {/* Lead name + meta */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {lead?.customer_full_name || "Unknown Lead"}
                </h1>
                {(screeningPhone || lead?.phone_number) && (
                  <div className="flex items-center gap-0 rounded-lg border border-amber-300/80 bg-amber-50/60 shadow-sm">
                    <div className="px-3 py-1.5 font-mono text-sm font-semibold tracking-wide text-amber-900">
                      {screeningPhone || lead?.phone_number}
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1 border-l border-amber-300/80 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100/80 active:bg-amber-200/60"
                      onClick={() => {
                        void navigator.clipboard.writeText(screeningPhone || lead?.phone_number || "");
                        setPhoneCopied(true);
                        setTimeout(() => setPhoneCopied(false), 2000);
                      }}
                    >
                      {phoneCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span className={phoneCopied ? "text-emerald-600" : ""}>{phoneCopied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {submissionId ? <span>Submission ID: <span className="font-mono text-xs">{submissionId}</span></span> : null}
                {fromCallback ? (
                  <>
                    <span className="text-border">|</span>
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide">Callback</Badge>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="flex max-w-full flex-wrap justify-start gap-2 sm:justify-end">
                {LEAD_TAG_OPTIONS.map((tagOption) => {
                  const isActive = selectedTag === tagOption;
                  return (
                    <Button
                      key={tagOption}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className={`h-9 rounded-full px-4 text-xs font-semibold ${isActive ? "" : getLeadTagToneClass(tagOption)}`}
                      onClick={() => setSelectedTag((current) => (current === tagOption ? "" : tagOption))}
                    >
                      {tagOption}
                    </Button>
                  );
                })}
              </div>

              {!showVerificationPanel || !verificationSessionId ? (
                <StartVerificationModal
                  submissionId={submissionId!}
                  onVerificationStarted={handleVerificationStarted}
                />
              ) : null}
            </div>
          </div>
        </div>
        {showVerificationPanel && verificationSessionId ? (
          <div className="space-y-8">
            <section
              ref={revealRef("safeguards", "safeguards")}
              className={`space-y-3 scroll-mt-6 ${revealMotionClass} ${revealClass("safeguards")}`}
              style={revealTransition(40)}
            >
              <div className="space-y-0.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Pre-Call Safeguards
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Confirm compliance before the live intake</h2>
              </div>
              {preCallCards}
            </section>

            <div className={`space-y-8 transition-all duration-500 ${!dncLookupSummary ? "pointer-events-none select-none opacity-30" : "opacity-100"}`} aria-disabled={!dncLookupSummary}>
              {!dncLookupSummary && (
                <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-50/30 px-4 py-3 text-center text-sm font-medium text-amber-800">
                  Complete the DNC lookup above to unlock the sections below
                </div>
              )}
            <section
              ref={(el) => { sectionNavRefs.current["verification"] = el; }}
              className="space-y-4 scroll-mt-6"
            >
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <div
                  ref={revealRef("verification-panel")}
                  className={`lg:sticky lg:top-4 ${revealMotionClass} ${revealClass("verification-panel")}`}
                  style={revealTransition(70)}
                >
                  <VerificationPanel
                    sessionId={verificationSessionId}
                    onTransferReady={handleTransferReady}
                    onFieldVerified={handleFieldVerifiedWithSync}
                    onStepFocus={handleVerificationStepFocus}
                    linkedSectionEyebrow={linkedScriptSectionEyebrow || undefined}
                  />
                </div>

                <div
                  ref={revealRef("script-panel")}
                  className={`lg:sticky lg:top-4 ${revealMotionClass} ${revealClass("script-panel", "translate-y-6")}`}
                  style={revealTransition(190)}
                >
                  {scriptCard}
                </div>
              </div>
            </section>

            {flowConnector("connector-attorney", "Attorney Match", 60)}
            <section
              ref={revealRef("attorney-section", "attorney")}
              className={`space-y-4 scroll-mt-6 ${revealMotionClass} ${revealClass("attorney-section")}`}
              style={revealTransition(100)}
            >
              {attorneyRecommendationCard}
              {attorneyDisclosureCard}
            </section>

            {flowConnector("connector-handoff", "Documentation", 60)}
            <section
              ref={(el) => { sectionNavRefs.current["handoff"] = el; }}
              className="space-y-5 scroll-mt-6"
            >
              <div
                ref={revealRef("contract-card")}
                className={`${revealMotionClass} ${revealClass("contract-card")}`}
                style={revealTransition(90)}
              >
                {contractCard}
              </div>
              <div
                ref={revealRef("docusign-guide-card")}
                className={`${revealMotionClass} ${revealClass("docusign-guide-card", "translate-y-4")}`}
                style={revealTransition(130)}
              >
                {docusignGuideCard}
              </div>
              <div
                ref={revealRef("document-upload-card")}
                className={`${revealMotionClass} ${revealClass("document-upload-card", "translate-y-4")}`}
                style={revealTransition(170)}
              >
                {documentUploadCard}
              </div>
              <div
                ref={revealRef("my-cases-handoff-card")}
                className={`${revealMotionClass} ${revealClass("my-cases-handoff-card", "translate-y-4")}`}
                style={revealTransition(210)}
              >
                {myCasesHandoffGuideCard}
              </div>
            </section>

            {flowConnector("connector-result", "Handoff", 60)}
            <section
              ref={(el) => { sectionNavRefs.current["result"] = el; }}
              className="space-y-4 scroll-mt-6"
            >
              <div
                ref={revealRef("result-card")}
                className={`mx-auto w-full xl:max-w-[44rem] ${revealMotionClass} ${revealClass("result-card")}`}
                style={revealTransition(95)}
              >
                <CallResultForm
                  submissionId={submissionId!}
                  customerName={lead.customer_full_name}
                  selectedTag={selectedTag}
                  initialAssignedAttorneyId={currentAssignedAttorneyId || undefined}
                  verificationSessionId={verificationSessionId || undefined}
                  verifiedFieldValues={verifiedFieldValues}
                  verificationProgress={verificationProgress}
                  selectedSubmittedLawyer={selectedSubmittedLawyer}
                  attorneyFulfillmentMode={attorneyFulfillmentMode}
                  onSuccess={() => navigate(`/call-result-journey?submissionId=${submissionId}`)}
                />
              </div>
            </section>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <section
              ref={revealRef("workspace", "workspace")}
              className={`space-y-4 scroll-mt-6 ${revealMotionClass} ${revealClass("workspace")}`}
              style={revealTransition(50)}
            >

              <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                <div className="self-start space-y-4">
                  {attorneyRecommendationCard}
                  {attorneyDisclosureCard}
                </div>

                <div className="space-y-6">
                  {callSupportCards}
                  <CallResultForm
                    submissionId={submissionId!}
                    customerName={lead.customer_full_name}
                    selectedTag={selectedTag}
                    initialAssignedAttorneyId={currentAssignedAttorneyId || undefined}
                    verificationSessionId={verificationSessionId || undefined}
                    verificationProgress={verificationProgress}
                    selectedSubmittedLawyer={selectedSubmittedLawyer}
                    attorneyFulfillmentMode={attorneyFulfillmentMode}
                    onSuccess={() => navigate(`/call-result-journey?submissionId=${submissionId}`)}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default CallResultUpdate;
