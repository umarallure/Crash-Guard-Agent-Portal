import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useQualifiedLawyers, QualifiedLawyer } from "@/hooks/useQualifiedLawyers";
import { toast } from "sonner";
import { 
  User, 
  MapPin, 
  Clock, 
  FileText, 
  Phone, 
  Link, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Send,
  ChevronDown,
  ChevronUp,
  Ban
} from "lucide-react";

export type SelectedLawyer = (QualifiedLawyer & { isNoCoverage?: false }) | { id: "nocoverage"; attorney_name: "No Coverage"; isNoCoverage: true; allRequirementsMet: false };

interface QualifiedLawyersCardProps {
  leadState?: string;
  accidentDate?: Date;
  policeReport?: boolean | string;
  insuranceDocuments?: boolean | string;
  medicalTreatmentProof?: boolean | string;
  driverLicense?: boolean | string;
  selectedLawyerId?: string;
  onLawyerSelect?: (lawyer: SelectedLawyer | null) => void;
  submissionStatus?: "pending" | "submitted" | "rejected";
}

export const QualifiedLawyersCard = ({
  leadState,
  accidentDate,
  policeReport,
  insuranceDocuments,
  medicalTreatmentProof,
  driverLicense,
  selectedLawyerId,
  onLawyerSelect,
  submissionStatus,
}: QualifiedLawyersCardProps) => {
  const [showAllLawyers, setShowAllLawyers] = useState(false);

  const { availableLawyers, partiallyMatchedLawyers, loading, error } = useQualifiedLawyers({
    state: leadState,
    accidentDate,
    policeReport,
    insuranceDocuments,
    medicalTreatmentProof,
    driverLicense,
  });

  const isNoCoverageSelected = selectedLawyerId === "nocoverage";
  
  const selectedLawyer = selectedLawyerId && selectedLawyerId !== "nocoverage"
    ? availableLawyers.find((l) => l.id === selectedLawyerId) ||
      partiallyMatchedLawyers.find((l) => l.id === selectedLawyerId)
    : null;

  const handleSelectLawyer = (lawyer: QualifiedLawyer) => {
    if (onLawyerSelect) {
      onLawyerSelect({ ...lawyer, isNoCoverage: false });
    }
    toast.success(`Selected ${lawyer.attorney_name}`);
  };

  const handleSelectNoCoverage = () => {
    if (onLawyerSelect) {
      onLawyerSelect({ id: "nocoverage", attorney_name: "No Coverage", isNoCoverage: true, allRequirementsMet: false } as SelectedLawyer);
    }
    toast.info("Selected: No Coverage");
  };

  const handleDeselectLawyer = () => {
    if (onLawyerSelect) {
      onLawyerSelect(null);
    }
  };

  const renderMatchStatus = (isMatch: boolean, label: string) => {
    if (isMatch) {
      return (
        <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
          <CheckCircle className="h-4 w-4" />
          <span>{label}: Match</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-red-500 text-sm font-medium">
        <XCircle className="h-4 w-4" />
        <span>{label}: No Match</span>
      </div>
    );
  };

  const renderSolStatus = (lawyer: QualifiedLawyer) => {
    if (!lawyer.sol) return null;
    
    const status = lawyer.solStatus;
    if (!status) return null;

    if (status.valid) {
      return (
        <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
          <Clock className="h-4 w-4" />
          <span>SOL: {status.monthsRemaining} months remaining</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-red-500 text-sm font-medium">
        <AlertCircle className="h-4 w-4" />
        <span>SOL: Expired ({Math.abs(status.monthsRemaining)} months ago)</span>
      </div>
    );
  };

  const renderLawyerCard = (lawyer: QualifiedLawyer, isSelected: boolean) => (
    <div
      key={lawyer.id}
      className={`p-4 border rounded-lg mb-2 cursor-pointer transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-50"
          : lawyer.allRequirementsMet
          ? "border-green-300 hover:border-green-400 bg-white"
          : "border-gray-200 hover:border-gray-300 bg-gray-50"
      }`}
      onClick={() => !isSelected && handleSelectLawyer(lawyer)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <span className="font-semibold text-lg">{lawyer.attorney_name}</span>
            {lawyer.allRequirementsMet && (
              <Badge className="bg-green-100 text-green-800 text-sm">Available</Badge>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {renderMatchStatus(lawyer.isStateMatch, "State")}
            {renderSolStatus(lawyer)}
            {lawyer.police_report === "yes" && renderMatchStatus(lawyer.isPoliceReportMatch, "Police Report")}
            {lawyer.insurance_report === "yes" && renderMatchStatus(lawyer.isInsuranceReportMatch, "Insurance")}
            {lawyer.medical_report === "yes" && renderMatchStatus(lawyer.isMedicalReportMatch, "Medical")}
            {lawyer.driver_id === "yes" && renderMatchStatus(lawyer.isDriverIdMatch, "Driver ID")}
          </div>

          <Separator className="my-3" />

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {lawyer.did_number && (
              <div className="flex items-center gap-1">
                <Phone className="h-4 w-4" />
                <span className="font-mono font-medium">{lawyer.did_number}</span>
              </div>
            )}
            {lawyer.submission_link && (
              <div className="flex items-center gap-1">
                <Link className="h-4 w-4" />
                <a
                  href={lawyer.submission_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  Submission Portal
                </a>
              </div>
            )}
          </div>
        </div>

        {isSelected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeselectLawyer();
            }}
          >
            Deselect
          </Button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Available Lawyers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4 text-lg">
            Loading lawyers...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Available Lawyers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-500 py-4">
            Error loading lawyers: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Available Lawyers</CardTitle>
            <CardDescription>
              Based on verification data and lawyer requirements
            </CardDescription>
          </div>
          {availableLawyers.length > 0 && (
            <Badge className="bg-green-100 text-green-800">
              {availableLawyers.length} Available
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {availableLawyers.length === 0 && partiallyMatchedLawyers.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            No lawyers configured. Add lawyer requirements first.
          </div>
        ) : (
          <>
            {selectedLawyer && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="font-medium">Selected: {selectedLawyer.attorney_name}</span>
                    </div>
                    {selectedLawyer.did_number && (
                      <div className="text-sm text-muted-foreground mt-1">
                        DID: {selectedLawyer.did_number}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {selectedLawyer.submission_link && (
                      <Button
                        size="sm"
                        asChild
                      >
                        <a
                          href={selectedLawyer.submission_link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Submit
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isNoCoverageSelected && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-red-600" />
                  <span className="font-medium">Selected: No Coverage</span>
                </div>
              </div>
            )}

            {/* No Coverage Option - Only show when no available lawyers but have partial matches */}
            {availableLawyers.length === 0 && partiallyMatchedLawyers.length > 0 && (
              <div className="mb-4">
                <Button
                  type="button"
                  variant={isNoCoverageSelected ? "default" : "outline"}
                  className={`w-full ${isNoCoverageSelected ? "bg-red-600 hover:bg-red-700" : "border-red-300 text-red-600 hover:bg-red-50"}`}
                  onClick={handleSelectNoCoverage}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  No Coverage
                </Button>
              </div>
            )}

            {availableLawyers.length > 0 && (
              <>
                <Label className="text-sm font-medium mb-2 block">
                  Matching Lawyers ({availableLawyers.length})
                </Label>
                {availableLawyers.map((lawyer) =>
                  renderLawyerCard(lawyer, lawyer.id === selectedLawyerId)
                )}
              </>
            )}

            {!showAllLawyers && partiallyMatchedLawyers.length > 0 && (
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => setShowAllLawyers(true)}
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Show {partiallyMatchedLawyers.length} Partially Matched Lawyers
              </Button>
            )}

            {showAllLawyers && partiallyMatchedLawyers.length > 0 && (
              <>
                <Separator className="my-4" />
                <Label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Partially Matching Lawyers ({partiallyMatchedLawyers.length})
                </Label>
                {partiallyMatchedLawyers.map((lawyer) =>
                  renderLawyerCard(lawyer, lawyer.id === selectedLawyerId)
                )}
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => setShowAllLawyers(false)}
                >
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Show Less
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

type QualifiedLawyersCardPropsProps = QualifiedLawyersCardProps;
