import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Phone, Mail, MapPin, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateUS } from "@/lib/dateUtils";

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

interface LeadInfoCardProps {
  lead: Lead;
}

export const LeadInfoCard = ({ lead }: LeadInfoCardProps) => {
  const { toast } = useToast();
  const dateOfBirth = formatDateUS(lead.date_of_birth, "N/A");
  const accidentDate = formatDateUS(lead.accident_date, "N/A");

  const copyToClipboard = () => {
    const leadInfo = `
Lead Information:
Name: ${lead.customer_full_name}
Phone: ${lead.phone_number}
Email: ${lead.email}
Address: ${lead.street_address}, ${lead.city}, ${lead.state} ${lead.zip_code}
Date of Birth: ${dateOfBirth}
Age: ${lead.age}

Accident/Incident Information:
Accident Date: ${accidentDate}
Accident Location: ${lead.accident_location || 'N/A'}
Accident Scenario: ${lead.accident_scenario || 'N/A'}
Injuries: ${lead.injuries || 'N/A'}
Medical Attention: ${lead.medical_attention || 'N/A'}
Police Attended: ${lead.police_attended ? 'Yes' : 'No'}
Insured: ${lead.insured ? 'Yes' : 'No'}
Vehicle Registration: ${lead.vehicle_registration || 'N/A'}
Insurance Company: ${lead.insurance_company || 'N/A'}
Third Party Vehicle Registration: ${lead.third_party_vehicle_registration || 'N/A'}
Other Party Admit Fault: ${lead.other_party_admit_fault ? 'Yes' : 'No'}
Passengers Count: ${lead.passengers_count || 0}
Prior Attorney Involved: ${lead.prior_attorney_involved ? 'Yes' : 'No'}
Prior Attorney Details: ${lead.prior_attorney_details || 'N/A'}

Witness/Contact Information:
Contact Name: ${lead.contact_name || 'N/A'}
Contact Number: ${lead.contact_number || 'N/A'}
Contact Address: ${lead.contact_address || 'N/A'}

Notes: ${lead.additional_notes}
Submission ID: ${lead.submission_id}
    `.trim();

    navigator.clipboard.writeText(leadInfo);
    toast({
      title: "Copied!",
      description: "Lead information copied to clipboard",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Lead Information
        </CardTitle>
        <Button onClick={copyToClipboard} variant="outline" size="sm">
          <Copy className="h-4 w-4 mr-2" />
          Copy Basic Info
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-lg">{lead.customer_full_name}</h3>
              <p className="text-sm text-muted-foreground">Age: {lead.age}</p>
              <p className="text-sm text-muted-foreground">DOB: {dateOfBirth}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span>{lead.phone_number}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span>{lead.email}</span>
            </div>
            
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-1" />
              <div>
                <div>{lead.street_address}</div>
                <div>{lead.city}, {lead.state} {lead.zip_code}</div>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div>
              <h4 className="font-medium">Accident Information</h4>
              {lead.accident_date && <p className="text-sm">Date: {accidentDate}</p>}
              {lead.accident_location && <p className="text-sm">Location: {lead.accident_location}</p>}
              {lead.injuries && <p className="text-sm">Injuries: {lead.injuries}</p>}
            </div>
          </div>
        </div>
        
        {lead.additional_notes && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Additional Notes:</h4>
            <p className="text-sm">{lead.additional_notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
