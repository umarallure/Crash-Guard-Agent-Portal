import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { DocumentUploadModal } from "./DocumentUploadModal";

interface DocumentUploadCardProps {
  submissionId: string;
}

export function DocumentUploadCard({ submissionId }: DocumentUploadCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [generatedPasscode, setGeneratedPasscode] = useState<string>("");

  // Generate a simple passcode (8 characters, alphanumeric, no ambiguous chars)
  const generatePasscode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude I, O, 0, 1
    let passcode = '';
    for (let i = 0; i < 8; i++) {
      passcode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return passcode;
  };

  const handleCreateUploadLink = () => {
    const passcode = generatePasscode();
    setGeneratedPasscode(passcode);
    setShowModal(true);
  };

  const getUploadUrl = () => {
    const baseUrl = import.meta.env.VITE_UPLOAD_PORTAL_URL;
    return `${baseUrl}/upload-document/${submissionId}`;
  };


  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Document Upload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Generate a secure upload link for the customer to submit their documents.
          </p>
          <Button 
            onClick={handleCreateUploadLink}
            className="w-full"
          >
            Create Upload Link
          </Button>
        </CardContent>
      </Card>

      <DocumentUploadModal
        open={showModal}
        onOpenChange={setShowModal}
        submissionId={submissionId}
        passcode={generatedPasscode}
        uploadUrl={getUploadUrl()}
      />
    </>
  );
}
