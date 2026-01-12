import { useState, useEffect } from "react";
import { Copy, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  "additional_notes"
];
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColoredProgress } from "@/components/ui/colored-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Clock, User, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { useRealtimeVerification, VerificationItem } from "@/hooks/useRealtimeVerification";

interface VerificationPanelProps {
  sessionId: string;
  onTransferReady?: () => void;
}

export const VerificationPanel = ({ sessionId, onTransferReady }: VerificationPanelProps) => {
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
      const newInputValues: Record<string, string> = {};
      verificationItems.forEach(item => {
        if (!(item.id in inputValues)) {
          newInputValues[item.id] = item.verified_value || item.original_value || '';
        }
      });
      setInputValues(prev => ({ ...prev, ...newInputValues }));
    }
  }, [verificationItems]);

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
    
    // Debounce the database update
    setTimeout(() => {
      updateVerifiedValue(itemId, newValue);
    }, 500);
  };

  const handleCheckboxChange = (itemId: string, checked: boolean) => {
    toggleVerification(itemId, checked);
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
      case 'in_progress': return 'bg-blue-500';
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

  // Determine field type
  const getFieldType = (fieldName: string): 'boolean' | 'longText' | 'text' => {
    // Boolean fields
    const booleanFields = [
      'police_attended',
      'insured',
      'other_party_admit_fault',
      'prior_attorney_involved'
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

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Verification Panel</CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={getStatusBadgeColor(session.status)}>
              {session.status.replace('_', ' ').toUpperCase()}
            </Badge>
            {/* Copy Notes Button */}
            <Button onClick={copyNotesToClipboard} variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-2" />
              Copy Edited Notes
            </Button>
          </div>
        </div>
        {/* Session Info */}
        <div className="space-y-2 text-sm mt-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>Agent: {session.buffer_agent_id || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Time: {elapsedTime}</span>
          </div>
        </div>
        {/* Small Progress Bar (original) */}
        <div className="space-y-2 mt-4">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className={`font-semibold ${
              currentProgress >= 76 ? 'text-green-600' :
              currentProgress >= 51 ? 'text-yellow-600' :
              currentProgress >= 26 ? 'text-orange-600' : 'text-red-600'
            }`}>
              {currentProgress}%
            </span>
          </div>
          <div className="relative">
            <ColoredProgress 
              value={currentProgress} 
              className="h-3 transition-all duration-500"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {verificationItems.filter(item => item.is_verified).length} of {verificationItems.length} fields verified
            <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
              currentProgress >= 76 ? 'bg-green-100 text-green-800' :
              currentProgress >= 51 ? 'bg-yellow-100 text-yellow-800' :
              currentProgress >= 26 ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'
            }`}>
              {currentProgress >= 76 ? 'Ready for Transfer' :
               currentProgress >= 51 ? 'Nearly Complete' :
               currentProgress >= 26 ? 'In Progress' : 'Just Started'}
            </span>
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto">
        {sortedItems.map((item) => (
          <div key={item.id} className="space-y-2">
            <div className="flex items-center gap-2">
              {getFieldIcon(item)}
              <Label className="text-xs font-medium">
                {formatFieldName(item.field_name)}
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
            <Separator className="mt-4" />
          </div>
        ))}

        {/* Notes Section */}
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

        {/* Footer */}
        <div className="p-4 border-t flex-shrink-0">
          <div className="flex justify-end gap-3">
            {/* Buffer Agent Buttons */}
            {session.buffer_agent_id && !session.licensed_agent_id && (
              <>
                <Button
                  variant="destructive"
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
                  Call Dropped
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await updateSessionStatus('buffer_done');
                    toast({
                      title: 'Call Done',
                      description: 'Buffer agent is now free from the call.'
                    });
                    refetch();
                  }}
                >
                  Call Done
                </Button>
                <Button
                  variant="default"
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
                  Transfer to LA
                </Button>
              </>
            )}
            {/* Licensed Agent Buttons */}
            {session.licensed_agent_id && (
              <>
                <Button
                  variant="destructive"
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
                  Call Dropped
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await updateSessionStatus('la_done');
                    toast({
                      title: 'Call Done',
                      description: 'Licensed agent is now free from the call.'
                    });
                    refetch();
                  }}
                >
                  Call Done
                </Button>
                <Button
                  variant="default"
                  onClick={async () => {
                    await updateSessionStatus('ready_for_transfer');
                    toast({
                      title: 'Transfer',
                      description: 'Session is now available for other licensed agents to claim.'
                    });
                    refetch();
                  }}
                >
                  Transfer to Other Licensed Agent
                </Button>
              </>
            )}
          </div>
        </div>
    </Card>
  );
};
