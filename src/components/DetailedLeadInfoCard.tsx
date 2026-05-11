import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, User, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { formatDateUS } from "@/lib/dateUtils";

interface DetailedLead {
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

interface DetailedLeadInfoCardProps {
  lead: DetailedLead;
}

export const DetailedLeadInfoCard = ({ lead }: DetailedLeadInfoCardProps) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const dateOfBirth = formatDateUS(lead.date_of_birth, "N/A");
  const accidentDate = formatDateUS(lead.accident_date, "N/A");

  const copyToClipboard = () => {
    const leadInfo = `${lead.lead_vendor || 'Lead Vendor'}: ${lead.customer_full_name}

PERSONAL INFORMATION:
Date of Birth: ${dateOfBirth}
Age: ${lead.age}
Birth State: ${lead.birth_state || ''}
Social Security: ${lead.social_security}
Driver License: ${lead.driver_license || ''}

CONTACT INFORMATION:
Address: ${lead.street_address}, ${lead.city}, ${lead.state} ${lead.zip_code}
Phone: ${lead.phone_number}
Email: ${lead.email}

ACCIDENT/INCIDENT INFORMATION:
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

WITNESS/CONTACT INFORMATION:
Contact Name: ${lead.contact_name || 'N/A'}
Contact Number: ${lead.contact_number || 'N/A'}
Contact Address: ${lead.contact_address || 'N/A'}

ADDITIONAL NOTES:
${lead.additional_notes}`;

    navigator.clipboard.writeText(leadInfo);
    toast({
      title: "Copied!",
      description: "Lead information copied to clipboard",
    });
  };

  const formatValue = (value: string | number | undefined | null) => {
    if (value === null || value === undefined || value === '') return '';
    return String(value);
  };

  return (
    <Card className="w-full">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Additional Notes & Lead Details
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={(e) => {
                e.stopPropagation();
                copyToClipboard();
              }} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <div className="space-y-1 text-xl font-normal">
              <div><strong>{lead.lead_vendor || 'Lead Vendor'}:</strong> {lead.customer_full_name}</div>
              <br />
              
              <div><strong>PERSONAL INFORMATION:</strong></div>
              <div><strong>Date of Birth:</strong> {dateOfBirth}</div>
              <div><strong>Age:</strong> {lead.age}</div>
              <div><strong>Birth State:</strong> {formatValue(lead.birth_state)}</div>
              <div><strong>Social Security:</strong> {lead.social_security}</div>
              <div><strong>Driver License:</strong> {formatValue(lead.driver_license)}</div>
              
              <br />
              <div><strong>CONTACT INFORMATION:</strong></div>
              <div><strong>Address:</strong> {lead.street_address}, {lead.city}, {lead.state} {lead.zip_code}</div>
              <div><strong>Phone:</strong> {lead.phone_number}</div>
              <div><strong>Email:</strong> {lead.email}</div>
              
              <br />
              <div><strong>ACCIDENT/INCIDENT INFORMATION:</strong></div>
              <div><strong>Accident Date:</strong> {accidentDate}</div>
              <div><strong>Accident Location:</strong> {formatValue(lead.accident_location)}</div>
              <div><strong>Accident Scenario:</strong> {formatValue(lead.accident_scenario)}</div>
              <div><strong>Injuries:</strong> {formatValue(lead.injuries)}</div>
              <div><strong>Medical Attention:</strong> {formatValue(lead.medical_attention)}</div>
              <div><strong>Police Attended:</strong> {lead.police_attended ? 'Yes' : 'No'}</div>
              <div><strong>Insured:</strong> {lead.insured ? 'Yes' : 'No'}</div>
              <div><strong>Vehicle Registration:</strong> {formatValue(lead.vehicle_registration)}</div>
              <div><strong>Insurance Company:</strong> {formatValue(lead.insurance_company)}</div>
              <div><strong>Third Party Vehicle Registration:</strong> {formatValue(lead.third_party_vehicle_registration)}</div>
              <div><strong>Other Party Admit Fault:</strong> {lead.other_party_admit_fault ? 'Yes' : 'No'}</div>
              <div><strong>Passengers Count:</strong> {lead.passengers_count || 0}</div>
              <div><strong>Prior Attorney Involved:</strong> {lead.prior_attorney_involved ? 'Yes' : 'No'}</div>
              <div><strong>Prior Attorney Details:</strong> {formatValue(lead.prior_attorney_details)}</div>
              
              <br />
              <div><strong>WITNESS/CONTACT INFORMATION:</strong></div>
              <div><strong>Contact Name:</strong> {formatValue(lead.contact_name)}</div>
              <div><strong>Contact Number:</strong> {formatValue(lead.contact_number)}</div>
              <div><strong>Contact Address:</strong> {formatValue(lead.contact_address)}</div>
              
              <br />
              <div><strong>ADDITIONAL NOTES:</strong></div>
              <div className="ml-4 whitespace-pre-wrap bg-muted p-3 rounded-md">{lead.additional_notes}</div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
