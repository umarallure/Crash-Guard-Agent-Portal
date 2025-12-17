import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentTimestampEST, formatDateToEST } from "@/lib/dateUtils";
import { useCenters } from "@/hooks/useCenters";

const NewCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { leadVendors, loading: centersLoading } = useCenters();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [customerFullName, setCustomerFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState<Date>();
  const [age, setAge] = useState("");
  const [socialSecurity, setSocialSecurity] = useState("");
  const [healthConditions, setHealthConditions] = useState("");
  const [leadVendor, setLeadVendor] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [submissionDate, setSubmissionDate] = useState<Date>();

  // Generate unique submission ID
  const generateSubmissionId = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `CB${timestamp}${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!customerFullName || !phoneNumber || !leadVendor || !submissionDate) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields (Name, Phone, Lead Vendor, Submission Date)",
          variant: "destructive",
        });
        return;
      }

      const submissionId = generateSubmissionId();
      
      const leadData = {
        submission_id: submissionId,
        submission_date: formatDateToEST(submissionDate), // Using selected submission date
        customer_full_name: customerFullName,
        phone_number: phoneNumber,
        email: email || null,
        street_address: streetAddress || null,
        city: city || null,
        state: state || null,
        zip_code: zipCode || null,
        date_of_birth: dateOfBirth ? formatDateToEST(dateOfBirth) : null, // Using EST formatting
        age: age ? parseInt(age) : null,
        social_security: socialSecurity || null,
        health_conditions: healthConditions || null,
        lead_vendor: leadVendor,
        additional_notes: additionalNotes || null,
        is_callback: true, // Mark as callback since submission ID starts with CB
      };

      // Insert into leads table
      const { error: insertError } = await supabase
        .from("leads")
        .insert(leadData);

      if (insertError) {
        console.error("Error creating lead:", insertError);
        toast({
          title: "Error",
          description: "Failed to create new callback entry",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "New callback entry created successfully",
      });

      // Navigate to call result update form
      navigate(`/call-result-update?submissionId=${submissionId}&fromCallback=true`);

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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">New Callback</h1>
            <p className="text-muted-foreground mt-1">
              Create a new callback entry manually
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lead Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Required Fields */}
              <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
                <h3 className="font-semibold text-blue-800">Required Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customerFullName">Customer Full Name *</Label>
                    <Input
                      id="customerFullName"
                      value={customerFullName}
                      onChange={(e) => setCustomerFullName(e.target.value)}
                      placeholder="Enter full name"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="phoneNumber">Phone Number *</Label>
                    <Input
                      id="phoneNumber"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="(555) 123-4567"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="leadVendor">Lead Vendor *</Label>
                    <Select value={leadVendor} onValueChange={setLeadVendor} required>
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

                  <div className="md:col-span-2">
                    <Label>Submission Date *</Label>
                    <DatePicker
                      date={submissionDate}
                      onDateChange={setSubmissionDate}
                      placeholder="Pick a submission date"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Contact Information */}
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h3 className="font-semibold text-gray-800">Contact Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="customer@email.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="streetAddress">Street Address</Label>
                    <Input
                      id="streetAddress"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      placeholder="123 Main St"
                    />
                  </div>

                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                    />
                  </div>

                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                    />
                  </div>

                  <div>
                    <Label htmlFor="zipCode">ZIP Code</Label>
                    <Input
                      id="zipCode"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="12345"
                    />
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h3 className="font-semibold text-gray-800">Personal Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Date of Birth</Label>
                    <DatePicker
                      date={dateOfBirth}
                      onDateChange={setDateOfBirth}
                      placeholder="Pick a date"
                    />
                  </div>

                  <div>
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="35"
                    />
                  </div>

                  <div>
                    <Label htmlFor="socialSecurity">Social Security</Label>
                    <Input
                      id="socialSecurity"
                      value={socialSecurity}
                      onChange={(e) => setSocialSecurity(e.target.value)}
                      placeholder="XXX-XX-XXXX"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="healthConditions">Health Conditions</Label>
                  <Textarea
                    id="healthConditions"
                    value={healthConditions}
                    onChange={(e) => setHealthConditions(e.target.value)}
                    placeholder="Any relevant health conditions..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="additionalNotes">Additional Notes</Label>
                  <Textarea
                    id="additionalNotes"
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder="Any additional notes or comments..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate("/dashboard")}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="min-w-32"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Callback"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NewCallback;
