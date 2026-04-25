import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

interface AppFixBankingFormProps {
  submissionId: string;
  customerName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const licensedAgentOptions = [
  "Lydia",
  "Isaac",
  "Benjamin",
  "Tatumn",
  "Noah",
  "Zack"
];

export const AppFixBankingForm = ({ 
  submissionId, 
  customerName, 
  onClose,
  onSuccess 
}: AppFixBankingFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankAccountOwner, setBankAccountOwner] = useState("");
  const [bankInstitutionName, setBankInstitutionName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("");
  const [newDraftDate, setNewDraftDate] = useState<Date>();
  const [bankingInfoSource, setBankingInfoSource] = useState("");
  const [policyAction, setPolicyAction] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  
  // Existing bank details from lead table
  const [existingBankDetails, setExistingBankDetails] = useState<{
    bank_name: string | null;
    routing_number: string | null;
    account_number: string | null;
    account_type: string | null;
    account_owner: string | null;
  } | null>(null);
  const [loadingExistingData, setLoadingExistingData] = useState(true);
  const [showExistingDetails, setShowExistingDetails] = useState(true);
  
  const { toast } = useToast();

  // Fetch existing bank details from leads table
  useEffect(() => {
    const fetchExistingBankDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('institution_name, beneficiary_routing, beneficiary_account, account_type, customer_full_name')
          .eq('submission_id', submissionId)
          .single();

        if (error) {
          console.error('Error fetching existing bank details:', error);
        } else if (data) {
          setExistingBankDetails({
            bank_name: data.institution_name,
            routing_number: data.beneficiary_routing?.trim(),
            account_number: data.beneficiary_account,
            account_type: data.account_type,
            account_owner: data.customer_full_name
          });
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoadingExistingData(false);
      }
    };

    fetchExistingBankDetails();
  }, [submissionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!bankAccountOwner || !bankInstitutionName || !routingNumber || 
        !accountNumber || !accountType || !newDraftDate || 
        !bankingInfoSource || !policyAction || !assignedTo) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get current user's profile for retention agent name
      const { data: profileData } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single();

      const creatorName = profileData?.display_name || 'Unknown Agent';

      // Create the app fix task
      const { data: task, error: taskError } = await supabase
        .from('app_fix_tasks')
        .insert({
          submission_id: submissionId,
          customer_name: customerName,
          fix_type: 'banking_info',
          status: 'pending',
          created_by: user.id,
          created_by_name: creatorName,
          assigned_to_name: assignedTo,
          notes: `Banking update requested by ${creatorName}`
        })
        .select()
        .single();

      if (taskError) {
        console.error("Error creating app fix task:", taskError);
        throw taskError;
      }

      // Create the banking update record
      const { error: bankingError } = await supabase
        .from('app_fix_banking_updates')
        .insert({
          task_id: task.id,
          submission_id: submissionId,
          bank_account_owner: bankAccountOwner,
          bank_institution_name: bankInstitutionName,
          routing_number: routingNumber,
          account_number: accountNumber,
          account_type: accountType,
          new_draft_date: format(newDraftDate, "yyyy-MM-dd"),
          banking_info_source: bankingInfoSource,
          policy_action: policyAction,
          additional_notes: additionalNotes
        });

      if (bankingError) {
        console.error("Error creating banking update:", bankingError);
        throw bankingError;
      }

      // Send notification to assigned licensed agent
      try {
        await supabase.functions.invoke('send-app-fix-notification', {
          body: {
            taskId: task.id,
            submissionId: submissionId,
            customerName: customerName,
            assignedTo: assignedTo,
            retentionAgent: creatorName,
            fixType: 'banking_info',
            newDraftDate: format(newDraftDate, "yyyy-MM-dd")
          }
        });
      } catch (notificationError) {
        console.error('Failed to send notification:', notificationError);
        // Don't fail the entire process if notification fails
      }

      toast({
        title: "Success",
        description: `Banking update task created and assigned to ${assignedTo}`,
      });

      if (onSuccess) {
        onSuccess();
      }
      
      onClose();

    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Failed to create app fix task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">App Fix - Update Banking Information</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={isSubmitting}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Info and Existing Bank Details Display */}
          <div className="bg-white p-4 rounded-md border border-blue-200">
            <div className="mb-3">
              <p className="text-sm font-medium text-blue-900">Submission ID: {submissionId}</p>
              {customerName && <p className="text-sm text-blue-700 mt-1">Customer: {customerName}</p>}
            </div>

            {loadingExistingData ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading existing bank details...</span>
              </div>
            ) : existingBankDetails ? (
              <div className="mt-3 pt-3 border-t border-blue-100">
                <button
                  type="button"
                  onClick={() => setShowExistingDetails(!showExistingDetails)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-blue-900 mb-2 hover:text-blue-700 transition-colors"
                >
                  <span>Old Bank Account Details:</span>
                  {showExistingDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showExistingDetails && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Bank Name:</span>
                    <p className="text-foreground">{existingBankDetails.bank_name || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Account Owner:</span>
                    <p className="text-foreground">{existingBankDetails.account_owner || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Routing Number:</span>
                    <p className="text-foreground">{existingBankDetails.routing_number || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Account Number:</span>
                    <p className="text-foreground">
                      {existingBankDetails.account_number || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Account Type:</span>
                    <p className="text-foreground capitalize">
                      {existingBankDetails.account_type || 'Not provided'}
                    </p>
                  </div>
                </div>
                )}
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-blue-100">
                <p className="text-sm text-gray-600">No existing bank details found</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Bank Account Owner */}
            <div>
              <Label htmlFor="bank-account-owner">
                Bank Account Owner <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bank-account-owner"
                value={bankAccountOwner}
                onChange={(e) => setBankAccountOwner(e.target.value)}
                placeholder="Enter account owner name"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Bank Institution Name */}
            <div>
              <Label htmlFor="bank-institution">
                Bank Institution Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bank-institution"
                value={bankInstitutionName}
                onChange={(e) => setBankInstitutionName(e.target.value)}
                placeholder="Enter bank name"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Routing Number */}
            <div>
              <Label htmlFor="routing-number">
                Routing Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="routing-number"
                value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="9-digit routing number"
                maxLength={9}
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Account Number */}
            <div>
              <Label htmlFor="account-number">
                Account Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="account-number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter account number"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Account Type */}
            <div>
              <Label htmlFor="account-type">
                Account Type <span className="text-red-500">*</span>
              </Label>
              <Select value={accountType} onValueChange={setAccountType} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* New Draft Date */}
            <div>
              <Label htmlFor="new-draft-date">
                New Draft Date <span className="text-red-500">*</span>
              </Label>
              <DatePicker
                date={newDraftDate}
                onDateChange={setNewDraftDate}
                placeholder="Select new draft date"
                disabled={isSubmitting}
              />
            </div>

            {/* Banking Information Source */}
            <div>
              <Label htmlFor="banking-info-source">
                Banking Information Source <span className="text-red-500">*</span>
              </Label>
              <Select value={bankingInfoSource} onValueChange={setBankingInfoSource} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone_call">Bank Call</SelectItem>
                  <SelectItem value="email">Checkbook</SelectItem>
                  <SelectItem value="text_message">Bank Statement</SelectItem>
                  <SelectItem value="online_banking_enrollment">Online Banking enrollment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Policy Action */}
            <div>
              <Label htmlFor="policy-action">
                Policy Redraft or Redate <span className="text-red-500">*</span>
              </Label>
              <Select value={policyAction} onValueChange={setPolicyAction} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="redraft">Redraft</SelectItem>
                  <SelectItem value="redate">Redate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assign To */}
            <div>
              <Label htmlFor="assigned-to">
                Assign To (Licensed Agent) <span className="text-red-500">*</span>
              </Label>
              <Select value={assignedTo} onValueChange={setAssignedTo} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select licensed agent" />
                </SelectTrigger>
                <SelectContent>
                  {licensedAgentOptions.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Additional Notes */}
            <div>
              <Label htmlFor="additional-notes">Additional Notes</Label>
              <Textarea
                id="additional-notes"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Enter any additional notes or instructions"
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 md:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Task...
                  </>
                ) : (
                  "Create Task"
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
