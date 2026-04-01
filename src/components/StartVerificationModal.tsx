import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logCallUpdate, getLeadInfo } from "@/lib/callLogging";
import { getTodayDateEST } from "@/lib/dateUtils";

interface LicensedAgent {
  user_id: string;
  display_name: string;
}

interface AgentsRow {
  id: string;
  name: string | null;
  email: string;
}

interface AppUserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

type AppUsersQueryClient = {
  from: (
    table: "app_users"
  ) => {
    select: (columns: string) => {
      in: (column: "user_id", values: string[]) => Promise<{ data: AppUserRow[] | null }>;
    };
  };
};

interface StartVerificationModalProps {
  submissionId: string;
  onVerificationStarted: (sessionId: string) => void;
}

const NEW_TRANSFER_SOURCE_STATUSES = ["new_transfer", "transfer_api"];
const PENDING_DISPOSITION_STATUS = "pending_disposition";

export const StartVerificationModal = ({ submissionId, onVerificationStarted }: StartVerificationModalProps) => {
  const [open, setOpen] = useState(false);
  const [licensedAgents, setLicensedAgents] = useState<LicensedAgent[]>([]);
  const [selectedLA, setSelectedLA] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchingAgents, setFetchingAgents] = useState(false);
  const { toast } = useToast();

  const fetchLicensedAgents = useCallback(async () => {
    setFetchingAgents(true);
    try {
      const { data: agentStatus } = await supabase
        .from('agent_status')
        .select('user_id')
        .eq('agent_type', 'licensed');

      const ids = agentStatus?.map((a) => a.user_id) || [];
      let profiles: LicensedAgent[] = [];

      if (ids.length > 0) {
        const { data: fetchedProfiles } = await (supabase as unknown as AppUsersQueryClient)
          .from('app_users')
          .select('user_id, display_name, email')
          .in('user_id', ids);

        profiles = ((fetchedProfiles || []) as AppUserRow[]).map((u) => ({
          user_id: u.user_id,
          display_name: u.display_name || (u.email ? String(u.email).split('@')[0] : '')
        }));
      }

      setLicensedAgents(profiles);
    } catch (error) {
      console.error('Error fetching licensed agents:', error);
      toast({
        title: "Error",
        description: "Failed to load closers",
        variant: "destructive",
      });
    } finally {
      setFetchingAgents(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchLicensedAgents();
    }
  }, [open, fetchLicensedAgents]);

  const startVerification = async () => {
    if (!selectedLA) {
      toast({
        title: "Error",
        description: "Please select a closer",
        variant: "destructive",
      });
      return;
    }

    const selectedCloser = licensedAgents.find(a => a.user_id === selectedLA);

    setLoading(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      // Fetch lead info for notification
      let leadData = {};
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('lead_vendor, customer_full_name')
        .eq('submission_id', submissionId)
        .single();
      if (!leadError && lead) {
        leadData = {
          lead_vendor: lead.lead_vendor,
          customer_full_name: lead.customer_full_name
        };
      }

      const licensedAgentName = selectedCloser?.display_name || 'Closer';
      const sessionData = {
        submission_id: submissionId,
        licensed_agent_id: selectedLA,
        status: 'in_progress',
        is_retention_call: false,
        started_at: new Date().toISOString()
      };
      const notificationPayload = {
        type: 'verification_started',
        submissionId,
        agentType: 'licensed',
        agentName: licensedAgentName,
        licensedAgentName: licensedAgentName,
        leadData
      };

      // Create verification session
      const { data: session, error: sessionError } = await supabase
        .from('verification_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (sessionError) {
        throw sessionError;
      }

      // Update the lead with retention flag (always false now)
      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({ is_retention_call: false })
        .eq('submission_id', submissionId);

      if (leadUpdateError) {
        console.warn('Failed to update lead retention flag:', leadUpdateError);
      }

      const { error: leadStatusError } = await supabase
        .from('leads')
        .update({ status: PENDING_DISPOSITION_STATUS })
        .eq('submission_id', submissionId)
        .in('status', NEW_TRANSFER_SOURCE_STATUSES);

      if (leadStatusError) {
        console.warn('Failed to move lead to pending disposition on verification start:', leadStatusError);
      }

      // Initialize verification items for both workflows
      const { error: initError } = await supabase.rpc(
        'initialize_verification_items',
        {
          session_id_param: session.id,
          submission_id_param: submissionId
        }
      );

      if (initError) {
        throw initError;
      }

      // Update agent status
      const agentId = selectedLA;
      
      // Check if agent status exists
      const { data: existingStatus } = await supabase
        .from('agent_status')
        .select('id')
        .eq('user_id', agentId)
        .single();

      let statusError;
      if (existingStatus) {
        // Update existing status
        const { error } = await supabase
          .from('agent_status')
          .update({
            status: 'on_call',
            current_session_id: session.id,
            last_activity: new Date().toISOString()
          })
          .eq('user_id', agentId);
        statusError = error;
      } else {
        // Insert new status
        const { error } = await supabase
          .from('agent_status')
          .insert({
            user_id: agentId,
            status: 'on_call',
            agent_type: 'licensed',
            current_session_id: session.id,
            last_activity: new Date().toISOString()
          });
        statusError = error;
      }

      if (statusError) {
        console.warn('Failed to update agent status:', statusError);
      }

      // Send notification to center when verification starts
      const { data: notificationData, error: notificationError } = await supabase.functions.invoke('center-transfer-notification', {
        body: notificationPayload
      });

      if (notificationError) {
        console.warn('Failed to send notification:', notificationError);
        // Don't throw - continue with verification even if notification fails
      }

      // Log the verification started event
      const { customerName, leadVendor } = await getLeadInfo(submissionId);

      await logCallUpdate({
        submissionId,
        agentId: selectedLA,
        agentType: 'licensed',
        agentName: licensedAgentName,
        eventType: 'verification_started',
        eventDetails: {
          workflow_type: 'licensed',
          session_id: session.id,
          started_by: user.id
        },
        verificationSessionId: session.id,
        customerName,
        leadVendor,
        isRetentionCall: false
      });


      toast({
        title: "Success",
        description: "Verification session started with closer",
      });

      setOpen(false);
      setSelectedLA("");
      onVerificationStarted?.(session.id);
    } catch (error) {
      console.error('Error starting verification:', error);
      // Log the full error object for debugging
      console.error('Error details:', JSON.stringify(error, null, 2));
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start verification session",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button className="flex items-center gap-2" onClick={() => setOpen(true)}>
        <UserCheck className="h-4 w-4" />
        Start Verification
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Start Verification Process</h2>

            <div className="mb-4">
              <label className="block font-medium mb-2">Select Workflow Type</label>
              <select
                value="licensed"
                disabled
                className="border rounded px-2 py-1 w-full bg-muted text-muted-foreground"
              >
                <option value="licensed">Closer</option>
              </select>
            </div>
            
            {/* Licensed Agent Selection (Closer Workflow) */}
            <div className="mb-4">
              <label className="block font-medium mb-2">Select Closer</label>
              {fetchingAgents ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading closers...</span>
                </div>
              ) : (
                <select
                  value={selectedLA}
                  onChange={(e) => setSelectedLA(e.target.value)}
                  className="border rounded px-2 py-1 w-full"
                >
                  <option value="">Select Closer</option>
                  {licensedAgents.map((agent) => (
                    <option key={agent.user_id} value={agent.user_id}>
                      {agent.display_name}
                    </option>
                  ))}
                </select>
              )}
              {licensedAgents.length === 0 && !fetchingAgents && (
                <p className="text-sm text-muted-foreground mt-1">
                  No closers available. Please ensure closers are registered in the system.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={startVerification} 
                disabled={!selectedLA || loading}
              >
                {loading ? 'Starting...' : 'Start Verification'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
