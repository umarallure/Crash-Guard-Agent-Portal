import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LeadInfoCard } from "@/components/LeadInfoCard";
import { DetailedLeadInfoCard } from "@/components/DetailedLeadInfoCard";
import { CallResultForm } from "@/components/CallResultForm";
import { StartVerificationModal } from "@/components/StartVerificationModal";
import { VerificationPanel } from "@/components/VerificationPanel";
import { Loader2, ArrowLeft } from "lucide-react";
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

  const { toast } = useToast();

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

  const checkExistingVerificationSession = async () => {
    try {
      const { data: session, error } = await supabase
        .from('verification_sessions')
        .select('id, status')
        .eq('submission_id', submissionId)
        .in('status', ['pending', 'in_progress', 'ready_for_transfer', 'transferred', 'completed'])
        .single();

      if (session && !error) {
        setVerificationSessionId(session.id);
        setShowVerificationPanel(true);
      }
    } catch (error) {
      // No existing session found, which is fine
    }
  };

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
            <h1 className="text-3xl font-bold whitespace-nowrap">
              {fromCallback ? "Update Callback Result" : "Update Call Result"}
            </h1>
            <p className="text-muted-foreground mt-1 truncate">
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
                />
              </div>
              
              {/* Call Result Form - Right Half */}
              <div>
                <CallResultForm 
                  submissionId={submissionId!} 
                  customerName={lead.customer_full_name}
                  initialAssignedAttorneyId={assignedAttorneyId || undefined}
                  verificationSessionId={verificationSessionId || undefined}
                  onSuccess={() => navigate(`/call-result-journey?submissionId=${submissionId}`)}
                />
              </div>
            </div>
            
            {/* Additional Notes - Bottom Collapsible */}
            <DetailedLeadInfoCard lead={lead} />
          </>
        ) : (
          /* Original layout when no verification panel */
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Lead Details */}
            <div className="space-y-6">
              <DetailedLeadInfoCard lead={lead} />
            </div>
            
            {/* Call Result Form */}
            <div>
              <CallResultForm 
                submissionId={submissionId!} 
                customerName={lead.customer_full_name}
                initialAssignedAttorneyId={assignedAttorneyId || undefined}
                verificationSessionId={verificationSessionId || undefined}
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