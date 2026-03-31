import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LeadInfoCard } from "@/components/LeadInfoCard";
import { CallResultForm } from "@/components/CallResultForm";
import { StartVerificationModal } from "@/components/StartVerificationModal";
import { VerificationPanel } from "@/components/VerificationPanel";
import { OrderRecommendationsCard } from "@/components/OrderRecommendationsCard";
import { DocumentUploadCard } from "@/components/DocumentUploadCard";
import { Loader2, ArrowLeft, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
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

  const { toast } = useToast();

  const screeningPhone = normalizePhoneForLookup(verifiedFieldValues.phone_number || lead?.phone_number);

  const callSupportCards = (
    <div className="mt-6 space-y-4">
      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base text-amber-900">Disclaimer</CardTitle>
              <p className="text-xs text-amber-700/70">DNC Verbal Consent — Read to customer before proceeding</p>
            </div>
          </div>
        </CardHeader>
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
            have your permission to call you and submit your application for insurance to AMAM - 31/03/2026 via your
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Script</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-foreground/90">
            <p>Hello, this is Accident Payments following up on your case.</p>
            <p className="mt-3">
              I just want to confirm a few details with you, make sure your information is accurate, and update
              you on the next step in the process.
            </p>
            <p className="mt-3">
              If anything has changed since we last spoke, please let me know so I can document it correctly for
              your file.
            </p>
          </div>
        </CardContent>
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
  }, [submissionId]);

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

  const dncAlert = (() => {
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

    if (!dncLookupSummary) return null;

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

  const checkExistingVerificationSession = async () => {
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
  };

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
        const verified = items.filter((item: any) => item.is_verified).length;
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

  const fetchLead = async () => {
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
        setLead(directLead);
        setContractRecipientEmail(directLead.email || "");
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
                {dncAlert ? <div className="mb-4">{dncAlert}</div> : null}
                <CallResultForm 
                  submissionId={submissionId!} 
                  customerName={lead.customer_full_name}
                  initialAssignedAttorneyId={assignedAttorneyId || undefined}
                  verificationSessionId={verificationSessionId || undefined}
                  verifiedFieldValues={verifiedFieldValues}
                  verificationProgress={verificationProgress}
                  onSuccess={() => navigate(`/call-result-journey?submissionId=${submissionId}`)}
                />
                {callSupportCards}
              </div>
            </div>
            
            <div className="grid grid-cols-1 items-start lg:grid-cols-2 gap-6">
              <div className="self-start">
                <DocumentUploadCard
                  submissionId={submissionId!}
                  customerPhoneNumber={lead.phone_number}
                />
              </div>

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
                  <DocumentUploadCard
                    submissionId={submissionId!}
                    customerPhoneNumber={lead.phone_number}
                  />
                </div>

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
              {dncAlert ? <div className="mb-4">{dncAlert}</div> : null}
              <CallResultForm 
                submissionId={submissionId!} 
                customerName={lead.customer_full_name}
                initialAssignedAttorneyId={assignedAttorneyId || undefined}
                verificationSessionId={verificationSessionId || undefined}
                verificationProgress={verificationProgress}
                onSuccess={() => navigate(`/call-result-journey?submissionId=${submissionId}`)}
              />
              {callSupportCards}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallResultUpdate;
