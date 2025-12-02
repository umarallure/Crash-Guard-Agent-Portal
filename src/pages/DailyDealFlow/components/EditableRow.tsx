import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, X, Edit, CalendarIcon, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DailyDealFlowRow } from "../DailyDealFlowPage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentTimestampEST } from "@/lib/dateUtils";

// Helper function to create Date object from YYYY-MM-DD string without timezone conversion
const createDateFromString = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed in Date constructor
};

// Utility function to format dates without timezone conversion
const formatDateWithoutTimezone = (dateString: string): string => {
  // Parse YYYY-MM-DD format directly without creating Date object
  const [year, month, day] = dateString.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(month) - 1;
  const shortYear = year.slice(-2);
  
  return `${monthNames[monthIndex]} ${day.padStart(2, '0')}, ${shortYear}`;
};

interface EditableRowProps {
  row: DailyDealFlowRow;
  rowIndex: number;
  serialNumber: number;
  onUpdate: () => void;
  hasWritePermissions?: boolean;
  isDuplicate?: boolean;
}

// Dropdown options (same as CallResultForm)
const bufferAgentOptions = [
    "All Buffer Agents",
    "Justine",
    "Kyla",
    "Laiza Batain",
    "Angelica",
    "Aqib Afridi",
    "Qasim Raja",
    "Noah Akins",
    "Hussain Khan",
    "N/A"
];

const agentOptions = [
  "Claudia", "Lydia", "Zack","Tatumn","Angy", "Benjamin", "Erica", "N/A", "Isaac"
];

const licensedAccountOptions = [
  "Claudia", "Lydia", "Isaac", "Noah","Trinity", "Benjamin", "Erica", "N/A","Tatumn"
];

const carrierOptions = [
  "Liberty", "SBLI", "Corebridge", "MOH", "Transamerica", "RNA", "AMAM",
  "GTL", "Aetna", "Americo", "CICA", "N/A"
];

const productTypeOptions = [
  "Preferred", "Standard", "Graded", "Modified", "GI", "Immediate", "Level", "ROP", "N/A"
];

const statusOptions = [
  "Needs BPO Callback",
  "Not Interested",
  "Pending Approval",
  "Previously Sold BPO",
  "Returned To Center - DQ",
  "Application Withdrawn",
  "Call Back Fix",
  "Incomplete Transfer",
  "DQ'd Can't be sold"
];

const callResultOptions = [
  "Submitted", "Underwriting", "Not Submitted"
];

const leadVendorOptions = [
  "Ark Tech", "GrowthOnics BPO", "Maverick", "Omnitalk BPO", "Vize BPO",
  "Corebiz", "Digicon", "Ambition", "Benchmark", "Poshenee", "Plexi",
  "Gigabite", "Everline solution", "Progressive BPO", "Cerberus BPO",
  "NanoTech", "Optimum BPO", "Ethos BPO", "Trust Link", "Crown Connect BPO",
  "Quotes BPO", "Zupax Marketing", "Argon Communications", "Care Solutions",
  "Cutting Edge", "Next Era", "Rock BPO", "Avenue Consultancy",
  "AJ BPO", "Pro Solutions BPO", "Emperor BPO",
  "Networkize",
  "LightVerse BPO",
  "StratiX BPO",
  "Leads BPO",
  "Helix BPO",
  "Exito BPO"
];

export const EditableRow = ({ row, rowIndex, serialNumber, onUpdate, hasWritePermissions = true, isDuplicate = false }: EditableRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<DailyDealFlowRow>(row);
  const [isSaving, setIsSaving] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const prevRowId = useRef(row.id);
  const { toast } = useToast();

  // Reset edit state when dialog closes
  useEffect(() => {
    if (!showDetailsDialog) {
      setIsEditing(false);
      setEditData(row);
    }
  }, [showDetailsDialog, row]);

  // Update editData when row ID changes (new row entirely) but not during editing
  useEffect(() => {
    if (prevRowId.current !== row.id) {
      setEditData(row);
      prevRowId.current = row.id;
    }
  }, [row]);

  // Color coding based on status
  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'submitted':
        return 'bg-green-50 border-green-200';
      case 'underwriting':
        return 'bg-blue-50 border-blue-200';
      case 'not submitted':
        return 'bg-red-50 border-red-200';
      case 'needs callback':
        return 'bg-yellow-50 border-yellow-200';
      case 'dq':
        return 'bg-gray-50 border-gray-200';
      default:
        return rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
    }
  };

  const getStatusTextColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'submitted':
        return 'text-green-800';
      case 'underwriting':
        return 'text-blue-800';
      case 'not submitted':
        return 'text-red-800';
      case 'needs callback':
        return 'text-yellow-800';
      case 'dq':
        return 'text-gray-800';
      default:
        return 'text-foreground';
    }
  };

  // Lead Vendor color coding
  const getLeadVendorBadge = (vendor?: string) => {
    const colors: { [key: string]: string } = {
      'Ark Tech': 'bg-blue-500 text-white',
      'GrowthOnics BPO': 'bg-green-500 text-white',
      'Maverick': 'bg-purple-500 text-white',
      'Omnitalk BPO': 'bg-orange-500 text-white',
      'Vize BPO': 'bg-red-500 text-white',
      'Corebiz': 'bg-indigo-500 text-white',
      'Digicon': 'bg-pink-500 text-white',
      'Ambition': 'bg-teal-500 text-white',
      'Benchmark': 'bg-yellow-600 text-white',
      'Poshenee': 'bg-cyan-500 text-white',
      'Plexi': 'bg-emerald-500 text-white',
      'Gigabite': 'bg-rose-500 text-white',
      'Everline solution': 'bg-violet-500 text-white',
      'Progressive BPO': 'bg-amber-500 text-white',
      'Cerberus BPO': 'bg-slate-500 text-white',
      'NanoTech': 'bg-lime-500 text-white',
      'Optimum BPO': 'bg-fuchsia-500 text-white',
      'Ethos BPO': 'bg-sky-500 text-white',
      'Trust Link': 'bg-stone-500 text-white',
      'Crown Connect BPO': 'bg-neutral-500 text-white',
      'Quotes BPO': 'bg-zinc-500 text-white',
      'Zupax Marketing': 'bg-red-600 text-white',
      'Argon Communications': 'bg-blue-600 text-white',
      'Care Solutions': 'bg-green-600 text-white',
      'Cutting Edge': 'bg-purple-600 text-white',
      'Next Era': 'bg-orange-600 text-white',
      'Rock BPO': 'bg-gray-600 text-white',
      'Avenue Consultancy': 'bg-pink-600 text-white',
    };
    return colors[vendor || ''] || 'bg-gray-400 text-white';
  };

  // Status color badge
  const getStatusBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'pending approval':
        return 'bg-green-600 text-white';
      case 'needs bpo callback':
        return 'bg-yellow-500 text-white';
      case 'returned to center - dq':
        return 'bg-orange-500 text-white';
      case 'dq':
      case "dq'd can't be sold":
        return 'bg-gray-500 text-white';
      case 'application withdrawn':
        return 'bg-purple-500 text-white';
      case 'call back fix':
        return 'bg-pink-500 text-white';
      case 'incomplete transfer':
        return 'bg-indigo-500 text-white';
      case 'disconnected':
        return 'bg-slate-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  // Call Result color badge
  const getCallResultBadge = (result?: string) => {
    switch (result?.toLowerCase()) {
      case 'submitted':
        return 'bg-green-600 text-white';
      case 'underwriting':
        return 'bg-yellow-600 text-white';
      case 'not submitted':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  // Buffer Agent color badge
  const getBufferAgentBadge = (agent?: string) => {
    const colors: { [key: string]: string } = {
      'N/A': 'bg-gray-500 text-white',
      'Ira': 'bg-blue-500 text-white',
      'Burney': 'bg-green-500 text-white',
      'Kyla': 'bg-purple-500 text-white',
      'Bryan': 'bg-orange-500 text-white',
      'Justine': 'bg-pink-500 text-white',
      'Isaac': 'bg-indigo-500 text-white',
      'Landon': 'bg-teal-500 text-white',
      'Juan': 'bg-red-500 text-white',
      'Tatumn': 'bg-orange-500 text-white'
    };
    return colors[agent || ''] || 'bg-gray-400 text-white';
  };

  // Agent color badge
  const getAgentBadge = (agent?: string) => {
    const colors: { [key: string]: string } = {
      'Claudia': 'bg-emerald-500 text-white',
      'Lydia': 'bg-violet-500 text-white',
      'Juan': 'bg-amber-500 text-white',
      'Benjamin': 'bg-sky-500 text-white',
      'Erica': 'bg-rose-500 text-white',
      'N/A': 'bg-gray-500 text-white',
      'Isaac': 'bg-cyan-500 text-white',
      'Tatumn': 'bg-orange-500 text-white'
    };
    return colors[agent || ''] || 'bg-gray-400 text-white';
  };

  // Licensed Agent color badge
  const getLicensedAgentBadge = (agent?: string) => {
    const colors: { [key: string]: string } = {
      'Claudia': 'bg-emerald-600 text-white',
      'Lydia': 'bg-violet-600 text-white',
      'Isaac': 'bg-cyan-600 text-white',
      'Juan': 'bg-amber-600 text-white',
      'Benjamin': 'bg-sky-600 text-white',
      'Erica': 'bg-rose-600 text-white',
      'N/A': 'bg-gray-600 text-white',
    };
    return colors[agent || ''] || 'bg-gray-500 text-white';
  };

  // Function to generate structured notes for pending approval applications
  const generatePendingApprovalNotes = (
    licensedAgentAccount: string,
    carrier: string,
    productType: string,
    monthlyPremium: number | null,
    coverageAmount: number | null,
    draftDate: string | null
  ) => {
    const parts = [];

    // Licensed agent account (point 1)
    if (licensedAgentAccount && licensedAgentAccount !== 'N/A') {
      parts.push(`1. Licensed agent account: ${licensedAgentAccount}`);
    }

    // Carrier (point 2)
    if (carrier && carrier !== 'N/A') {
      parts.push(`2. Carrier: ${carrier}`);
    }

    // Carrier product name and level (point 3)
    if (productType && productType !== 'N/A') {
      parts.push(`3. Carrier product name and level: ${productType}`);
    }

    // Premium amount (point 4)
    if (monthlyPremium && monthlyPremium > 0) {
      parts.push(`4. Premium amount: $${monthlyPremium}`);
    }

    // Coverage amount (point 5)
    if (coverageAmount && coverageAmount > 0) {
      parts.push(`5. Coverage amount: $${coverageAmount}`);
    }

    // Draft date (point 6)
    if (draftDate) {
      const date = new Date(draftDate);
      parts.push(`6. Draft date: ${date.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
      })}`);
    }

    // Always add point 7 for pending approval
    parts.push('7. Sent to Underwriting');

    // Carrier-specific commission rules as the final point
    let commissionNote = "";
    if (/aetna/i.test(carrier) || /corebridge/i.test(carrier)) {
      commissionNote = "8. Commissions from this carrier are paid after the first successful draft";
    } else if (/cica/i.test(carrier)) {
      commissionNote = "8. Commissions from this carrier are paid 10-14 days after first successful draft";
    } else {
      commissionNote = "8. Commissions are paid after policy is officially approved and issued";
    }

    // Add commission note at the bottom
    parts.push(commissionNote);

    return parts.join('\n');
  };

  // Function to combine structured notes with existing notes
  const combineNotes = (structuredNotes: string, existingNotes: string) => {
    if (!structuredNotes && !existingNotes) return '';
    if (!structuredNotes) return existingNotes;
    if (!existingNotes) return structuredNotes;
    return structuredNotes + '\n\n' + existingNotes;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Check if status is being changed to "Pending Approval" and generate structured notes
      let finalEditData = { ...editData };
      
      if (editData.status === "Pending Approval" && row.status !== "Pending Approval") {
        // Generate structured notes for pending approval
        const structuredNotes = generatePendingApprovalNotes(
          editData.licensed_agent_account || '',
          editData.carrier || '',
          editData.product_type || '',
          editData.monthly_premium || null,
          editData.face_amount || null,
          editData.draft_date || null
        );
        
        // Combine with existing notes
        const combinedNotes = combineNotes(structuredNotes, editData.notes || '');
        finalEditData = {
          ...editData,
          notes: combinedNotes
        };
      }

      const { error } = await supabase
        .from('daily_deal_flow')
        .update({
          ...finalEditData,
          updated_at: getCurrentTimestampEST()
        })
        .eq('id', row.id);

      if (error) {
        console.error("Error updating row:", error);
        toast({
          title: "Error",
          description: "Failed to update row",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Row updated successfully",
      });

      setIsEditing(false);
      setShowDetailsDialog(false);
      onUpdate();
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData(row);
    setIsEditing(false);
    // Close the dialog if it's open
    if (showDetailsDialog) {
      setShowDetailsDialog(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('daily_deal_flow')
        .delete()
        .eq('id', row.id);

      if (error) {
        console.error("Error deleting row:", error);
        toast({
          title: "Error",
          description: "Failed to delete row",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Row deleted successfully",
      });

      onUpdate();
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const updateField = useCallback((field: keyof DailyDealFlowRow, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Memoize dialog close handler to prevent re-renders
  const handleDialogOpenChange = useCallback((open: boolean) => {
    setShowDetailsDialog(open);
  }, []);

  // Details Dialog Component - Memoized to prevent unnecessary re-renders
  const DetailsDialog = useMemo(() => (
    <Dialog open={showDetailsDialog} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Lead Details - {row.insured_name}</DialogTitle>
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="ml-4"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Contact Information</h3>
            
            <div>
              <Label className="text-sm font-medium">Phone Number</Label>
              {isEditing ? (
                <Input
                  value={editData.client_phone_number || ''}
                  onChange={(e) => updateField('client_phone_number', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.client_phone_number || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Lead Vendor</Label>
              {isEditing ? (
                <Select
                  value={editData.lead_vendor || ''}
                  onValueChange={(value) => updateField('lead_vendor', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadVendorOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.lead_vendor || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Insured Name</Label>
              {isEditing ? (
                <Input
                  value={editData.insured_name || ''}
                  onChange={(e) => updateField('insured_name', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.insured_name || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Submission ID</Label>
              <div className="mt-1 p-2 bg-muted rounded text-sm font-mono">
                {row.submission_id || 'N/A'}
              </div>
            </div>
          </div>

          {/* Agent Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Agent Information</h3>
            
            <div>
              <Label className="text-sm font-medium">Buffer Agent</Label>
              {isEditing ? (
                <Select
                  value={editData.buffer_agent || ''}
                  onValueChange={(value) => updateField('buffer_agent', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select buffer agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {bufferAgentOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.buffer_agent || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Agent</Label>
              {isEditing ? (
                <Select
                  value={editData.agent || ''}
                  onValueChange={(value) => updateField('agent', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.agent || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Licensed Agent Account</Label>
              {isEditing ? (
                <Select
                  value={editData.licensed_agent_account || ''}
                  onValueChange={(value) => updateField('licensed_agent_account', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select licensed agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {licensedAccountOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.licensed_agent_account || 'N/A'}</div>
              )}
            </div>
          </div>

          {/* Application Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Application Information</h3>
            
            <div>
              <Label className="text-sm font-medium">Status</Label>
              {isEditing ? (
                <Select
                  value={editData.status || ''}
                  onValueChange={(value) => updateField('status', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.status || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Call Result</Label>
              {isEditing ? (
                <Select
                  value={editData.call_result || ''}
                  onValueChange={(value) => updateField('call_result', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select call result" />
                  </SelectTrigger>
                  <SelectContent>
                    {callResultOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.call_result || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">From Callback</Label>
              {isEditing ? (
                <Select
                  value={editData.from_callback ? 'TRUE' : 'FALSE'}
                  onValueChange={(value) => updateField('from_callback', value === 'TRUE')}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRUE">Yes</SelectItem>
                    <SelectItem value="FALSE">No</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">
                  {row.from_callback ? 'Yes' : 'No'}
                </div>
              )}
            </div>
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Additional Information</h3>
            
            <div>
              <Label className="text-sm font-medium">Date</Label>
              {isEditing ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full mt-1 justify-start text-left font-normal",
                        !editData.date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editData.date ? format(createDateFromString(editData.date), "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editData.date ? createDateFromString(editData.date) : undefined}
                      onSelect={(date) => updateField('date', date ? format(date, "yyyy-MM-dd") : null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">
                  {row.date ? format(createDateFromString(row.date), "PPP") : 'N/A'}
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Policy Number</Label>
              {isEditing ? (
                <Input
                  value={editData.policy_number || ''}
                  onChange={(e) => updateField('policy_number', e.target.value)}
                  className="mt-1"
                  placeholder="Enter policy number"
                />
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.policy_number || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Carrier Audit</Label>
              {isEditing ? (
                <Input
                  value={editData.carrier_audit || ''}
                  onChange={(e) => updateField('carrier_audit', e.target.value)}
                  className="mt-1"
                  placeholder="Enter carrier audit info"
                />
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.carrier_audit || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Product Type Carrier</Label>
              {isEditing ? (
                <Input
                  value={editData.product_type_carrier || ''}
                  onChange={(e) => updateField('product_type_carrier', e.target.value)}
                  className="mt-1"
                  placeholder="Enter product type carrier"
                />
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.product_type_carrier || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Level or GI</Label>
              {isEditing ? (
                <Input
                  value={editData.level_or_gi || ''}
                  onChange={(e) => updateField('level_or_gi', e.target.value)}
                  className="mt-1"
                  placeholder="Enter level or GI"
                />
              ) : (
                <div className="mt-1 p-2 bg-muted rounded">{row.level_or_gi || 'N/A'}</div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Created At</Label>
              <div className="mt-1 p-2 bg-muted rounded text-sm">
                {row.created_at ? format(new Date(row.created_at), "PPP 'at' p") : 'N/A'}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Updated At</Label>
              <div className="mt-1 p-2 bg-muted rounded text-sm">
                {row.updated_at ? format(new Date(row.updated_at), "PPP 'at' p") : 'N/A'}
              </div>
            </div>
          </div>

          {/* Notes Section - Full Width */}
          <div className="md:col-span-2 lg:col-span-3 space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Notes</h3>
            {isEditing ? (
              <Textarea
                value={editData.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Enter notes..."
                className="min-h-[100px]"
              />
            ) : (
              <div className="p-3 bg-muted rounded min-h-[100px] whitespace-pre-wrap">
                {row.notes || 'No notes available'}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {isEditing ? (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowDetailsDialog(false)}
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  ), [showDetailsDialog, handleDialogOpenChange, isEditing, editData, row, isSaving, handleCancel, handleSave]); // Add all dependencies

  if (isEditing) {
    return (
      <>
        <tr className={`bg-blue-50 ${isDuplicate ? 'bg-yellow-50' : ''} border-2 border-blue-200`}>
          {/* Serial Number */}
          <td className="border border-border px-3 py-2 text-center font-medium">
            {serialNumber}
          </td>

          {/* Date */}
          <td className="border border-border px-3 py-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-8 text-xs justify-start text-left font-normal",
                    !editData.date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {editData.date ? format(createDateFromString(editData.date), "MMM dd") : "Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={editData.date ? createDateFromString(editData.date) : undefined}
                  onSelect={(date) => updateField('date', date ? format(date, "yyyy-MM-dd") : null)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </td>

          {/* Lead Vendor */}
          <td className="border border-border px-3 py-2">
            <Select
              value={editData.lead_vendor || ''}
              onValueChange={(value) => updateField('lead_vendor', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Vendor" />
              </SelectTrigger>
              <SelectContent>
                {leadVendorOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>

          {/* Insured Name */}
          <td className="border border-border px-3 py-2 w-32 align-top">
            <Textarea
              value={editData.insured_name || ''}
              onChange={(e) => updateField('insured_name', e.target.value)}
              className="min-h-[2.5rem] text-xs resize-none"
              placeholder="Customer name"
              rows={2}
            />
          </td>

          {/* Phone Number */}
          <td className="border border-border px-3 py-2">
            <Input
              value={editData.client_phone_number || ''}
              onChange={(e) => updateField('client_phone_number', e.target.value)}
              className="h-8 text-xs"
              placeholder="Phone number"
            />
          </td>

          {/* Buffer Agent */}
          <td className="border border-border px-3 py-2">
            <Select
              value={editData.buffer_agent || ''}
              onValueChange={(value) => updateField('buffer_agent', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Buffer Agent" />
              </SelectTrigger>
              <SelectContent>
                {bufferAgentOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>

          {/* Agent */}
          <td className="border border-border px-3 py-2">
            <Select
              value={editData.agent || ''}
              onValueChange={(value) => updateField('agent', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                {agentOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>

          {/* Licensed Account */}
          <td className="border border-border px-3 py-2">
            <Select
              value={editData.licensed_agent_account || ''}
              onValueChange={(value) => updateField('licensed_agent_account', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Licensed" />
              </SelectTrigger>
              <SelectContent>
                {licensedAccountOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>

          {/* Status */}
          <td className="border border-border px-3 py-2">
            <Select
              value={editData.status || ''}
              onValueChange={(value) => updateField('status', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>

          {/* Call Result */}
          <td className="border border-border px-3 py-2">
            <Select
              value={editData.call_result || ''}
              onValueChange={(value) => updateField('call_result', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                {callResultOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>

          {/* Notes */}
          <td className="border border-border px-3 py-2 w-32 align-top">
            <Textarea
              value={editData.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              className="min-h-[4rem] text-xs resize-none"
              placeholder="Notes..."
              rows={3}
            />
          </td>

          {/* Actions */}
          {hasWritePermissions && (
            <td className="border border-border px-3 py-2">
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-7 w-7 p-0"
                >
                  <Save className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDetailsDialog(true)}
                  className="h-7 w-7 p-0"
                >
                  <Eye className="h-3 w-3" />
                </Button>
              </div>
            </td>
          )}
        </tr>
        {DetailsDialog}
      </>
    );
  }

  // Display mode
  return (
    <>
      <tr className={`${getStatusColor(row.status)} ${isDuplicate ? 'bg-yellow-50' : ''} hover:bg-muted/50 transition-colors border`}>
        {/* Serial Number */}
        <td className="border border-border px-3 py-2 text-sm text-center font-medium">
          {serialNumber}
        </td>

        {/* Date */}
        <td className="border border-border px-3 py-2 text-sm w-20">
          {row.date ? formatDateWithoutTimezone(row.date) : ''}
        </td>

        {/* Lead Vendor */}
        <td className="border border-border px-2 py-2 text-sm w-20">
          {row.lead_vendor ? (
            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${getLeadVendorBadge(row.lead_vendor)}`}>
              {row.lead_vendor.length > 12 ? row.lead_vendor.substring(0, 12) + '...' : row.lead_vendor}
            </span>
          ) : ''}
        </td>

        {/* Insured Name */}
        <td className="border border-border px-2 py-3 text-sm w-32 align-top">
          <div className="font-medium text-gray-800 whitespace-normal break-words leading-tight min-h-[2.5rem]">
            {row.insured_name || ''}
          </div>
        </td>

        {/* Phone Number */}
        <td className="border border-border px-3 py-2 text-sm w-28">
          <div className="font-mono text-gray-700">
            {row.client_phone_number || ''}
          </div>
        </td>

        {/* Buffer Agent */}
        <td className="border border-border px-2 py-2 text-sm w-24">
          {row.buffer_agent ? (
            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${getBufferAgentBadge(row.buffer_agent)}`}>
              {row.buffer_agent}
            </span>
          ) : ''}
        </td>

        {/* Agent */}
        <td className="border border-border px-2 py-2 text-sm w-20">
          {row.agent ? (
            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${getAgentBadge(row.agent)}`}>
              {row.agent}
            </span>
          ) : ''}
        </td>

        {/* Licensed Account */}
        <td className="border border-border px-2 py-2 text-sm w-28">
          {row.licensed_agent_account ? (
            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${getLicensedAgentBadge(row.licensed_agent_account)}`}>
              {row.licensed_agent_account.length > 10 ? row.licensed_agent_account.substring(0, 10) + '...' : row.licensed_agent_account}
            </span>
          ) : ''}
        </td>

        {/* Status */}
        <td className="border border-border px-2 py-2 text-sm w-32">
          {row.status ? (
            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${getStatusBadge(row.status)}`}>
              {row.status.length > 16 ? row.status.substring(0, 16) + '...' : row.status}
            </span>
          ) : ''}
        </td>

        {/* Call Result */}
        <td className="border border-border px-2 py-2 text-sm w-24">
          {row.call_result ? (
            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${getCallResultBadge(row.call_result)}`}>
              {row.call_result.length > 12 ? row.call_result.substring(0, 12) + '...' : row.call_result}
            </span>
          ) : ''}
        </td>

        {/* Notes */}
        <td className="border border-border px-3 py-3 text-xs w-32 align-top">
          <div className="whitespace-pre-wrap break-words leading-tight min-h-[2.5rem] max-h-20 overflow-y-auto">
            {row.notes || ''}
          </div>
        </td>

        {/* Actions */}
        {hasWritePermissions && (
          <td className="border border-border px-3 py-2 w-28">
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="h-7 w-7 p-0"
                title="Edit row"
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowDetailsDialog(true); }}
                className="h-7 w-7 p-0"
                title="View & edit details"
              >
                <Eye className="h-3 w-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Delete row"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to delete this row?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the row for {row.insured_name || 'this customer'}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </td>
        )}
      </tr>
      {DetailsDialog}
    </>
  );
};
