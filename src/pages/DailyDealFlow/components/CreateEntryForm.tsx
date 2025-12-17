import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getTodayDateEST, getCurrentDateEST } from "@/lib/dateUtils";
import { useCenters } from "@/hooks/useCenters";

interface CreateEntryFormProps {
  onSuccess: () => void;
}

// Same dropdown options as EditableRow
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
  "Claudia", "Lydia", "Zack", "Tatumn","Angy", "Benjamin", "N/A", "Isaac"
];

const licensedAccountOptions = [
  "Claudia", "Lydia", "Isaac", "Noah","Trinity", "Benjamin", "N/A","Tatumn"
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
  "Returned To Center - DQ",
  "Application Withdrawn",
  "Call Back Fix",
  "Incomplete Transfer",
  "DQ'd Can't be sold"
];

const callResultOptions = [
  "Submitted", "Underwriting", "Not Submitted"
];

// Function to generate unique CB submission ID
const generateCBSubmissionId = (): string => {
  const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
  const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `CB${randomDigits}${timestamp}`;
};

export const CreateEntryForm = ({ onSuccess }: CreateEntryFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { leadVendors } = useCenters();

  // Form state - Initialize with today's date and generated submission ID
  const [formData, setFormData] = useState(() => {
    const todayDate = getTodayDateEST();
    
    return {
      submission_id: generateCBSubmissionId(),
      date: todayDate,
      lead_vendor: '',
      insured_name: '',
      client_phone_number: '',
      buffer_agent: 'N/A',
      agent: '',
      licensed_agent_account: 'N/A',
      status: '',
      call_result: '',
      carrier: 'N/A',
      product_type: 'N/A',
      draft_date: '',
      monthly_premium: '',
      face_amount: '',
      notes: '',
      policy_number: '',
      carrier_audit: '',
      product_type_carrier: '',
      level_or_gi: '',
      from_callback: false
    };
  });

  const [selectedDate, setSelectedDate] = useState<Date>(getCurrentDateEST());
  const [selectedDraftDate, setSelectedDraftDate] = useState<Date | undefined>();

  const updateField = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      updateField('date', format(date, 'yyyy-MM-dd'));
    }
  };

  const handleDraftDateSelect = (date: Date | undefined) => {
    setSelectedDraftDate(date);
    if (date) {
      updateField('draft_date', format(date, 'yyyy-MM-dd'));
    } else {
      updateField('draft_date', '');
    }
  };

  const resetForm = () => {
    const todayDate = getTodayDateEST();
    
    setFormData({
      submission_id: generateCBSubmissionId(),
      date: todayDate,
      lead_vendor: '',
      insured_name: '',
      client_phone_number: '',
      buffer_agent: 'N/A',
      agent: '',
      licensed_agent_account: 'N/A',
      status: '',
      call_result: '',
      carrier: 'N/A',
      product_type: 'N/A',
      draft_date: '',
      monthly_premium: '',
      face_amount: '',
      notes: '',
      policy_number: '',
      carrier_audit: '',
      product_type_carrier: '',
      level_or_gi: '',
      from_callback: false
    });
    setSelectedDate(getCurrentDateEST());
    setSelectedDraftDate(undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.insured_name.trim()) {
        toast({
          title: "Error",
          description: "Customer name is required",
          variant: "destructive",
        });
        return;
      }

      if (!formData.status) {
        toast({
          title: "Error",
          description: "Status is required",
          variant: "destructive",
        });
        return;
      }

      if (!formData.call_result) {
        toast({
          title: "Error",
          description: "Call result is required",
          variant: "destructive",
        });
        return;
      }

      // Prepare data for insertion
      const insertData = {
        ...formData,
        monthly_premium: formData.monthly_premium ? parseFloat(formData.monthly_premium) : null,
        face_amount: formData.face_amount ? parseFloat(formData.face_amount) : null,
        draft_date: formData.draft_date || null,
        policy_number: formData.policy_number || null,
        carrier_audit: formData.carrier_audit || null,
        product_type_carrier: formData.product_type_carrier || null,
        level_or_gi: formData.level_or_gi || null,
      };

      const { error } = await supabase
        .from('daily_deal_flow')
        .insert(insertData);

      if (error) {
        console.error("Error creating entry:", error);
        toast({
          title: "Error",
          description: "Failed to create entry",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `New entry created successfully with ID: ${formData.submission_id}`,
      });

      resetForm();
      setIsOpen(false);
      onSuccess();
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

  const handleCancel = () => {
    resetForm();
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create New Entry
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Daily Deal Flow Entry</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Contact Information Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Contact Information</h3>
              
              {/* Submission ID (Read-only) */}
              <div>
                <label className="text-sm font-medium">Submission ID</label>
                <Input
                  value={formData.submission_id}
                  readOnly
                  className="bg-gray-50 font-mono text-sm"
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-sm font-medium">Date *</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Lead Vendor */}
              <div>
                <label className="text-sm font-medium">Lead Vendor</label>
                <Select
                  value={formData.lead_vendor}
                  onValueChange={(value) => updateField('lead_vendor', value)}
                >
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

              {/* Customer Name */}
              <div>
                <label className="text-sm font-medium">Customer Name *</label>
                <Input
                  value={formData.insured_name}
                  onChange={(e) => updateField('insured_name', e.target.value)}
                  placeholder="Enter customer name"
                  required
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="text-sm font-medium">Phone Number</label>
                <Input
                  value={formData.client_phone_number}
                  onChange={(e) => updateField('client_phone_number', e.target.value)}
                  placeholder="(XXX) XXX-XXXX"
                />
              </div>
            </div>

            {/* Agent Information Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Agent Information</h3>
              
              {/* Buffer Agent */}
              <div>
                <label className="text-sm font-medium">Buffer Agent</label>
                <Select
                  value={formData.buffer_agent}
                  onValueChange={(value) => updateField('buffer_agent', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
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

              {/* Agent */}
              <div>
                <label className="text-sm font-medium">Agent</label>
                <Select
                  value={formData.agent}
                  onValueChange={(value) => updateField('agent', value)}
                >
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

              {/* Licensed Agent Account */}
              <div>
                <label className="text-sm font-medium">Licensed Agent Account</label>
                <Select
                  value={formData.licensed_agent_account}
                  onValueChange={(value) => updateField('licensed_agent_account', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {licensedAccountOptions.map((agent) => (
                      <SelectItem key={agent} value={agent}>
                        {agent}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div>
                <label className="text-sm font-medium">Status *</label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => updateField('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Call Result */}
              <div>
                <label className="text-sm font-medium">Call Result *</label>
                <Select
                  value={formData.call_result}
                  onValueChange={(value) => updateField('call_result', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select call result" />
                  </SelectTrigger>
                  <SelectContent>
                    {callResultOptions.map((result) => (
                      <SelectItem key={result} value={result}>
                        {result}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Application Information Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Application Information</h3>
              
              {/* Carrier */}
              <div>
                <label className="text-sm font-medium">Carrier</label>
                <Select
                  value={formData.carrier}
                  onValueChange={(value) => updateField('carrier', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
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

              {/* Product Type */}
              <div>
                <label className="text-sm font-medium">Product Type</label>
                <Select
                  value={formData.product_type}
                  onValueChange={(value) => updateField('product_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {productTypeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Draft Date */}
              <div>
                <label className="text-sm font-medium">Draft Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDraftDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDraftDate ? format(selectedDraftDate, "PPP") : "Select draft date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDraftDate}
                      onSelect={handleDraftDateSelect}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Monthly Premium */}
              <div>
                <label className="text-sm font-medium">Monthly Premium ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.monthly_premium}
                  onChange={(e) => updateField('monthly_premium', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Face Amount */}
              <div>
                <label className="text-sm font-medium">Face Amount ($)</label>
                <Input
                  type="number"
                  value={formData.face_amount}
                  onChange={(e) => updateField('face_amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Policy Number */}
              <div>
                <label className="text-sm font-medium">Policy Number</label>
                <Input
                  value={formData.policy_number}
                  onChange={(e) => updateField('policy_number', e.target.value)}
                  placeholder="Enter policy number"
                />
              </div>
            </div>
          </div>

          {/* Notes Section - Full Width */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Notes</h3>
            <Textarea
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Enter notes..."
              className="min-h-[100px]"
              rows={4}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Entry
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};