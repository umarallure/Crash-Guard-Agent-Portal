import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: string;
  passcode: string;
  uploadUrl: string;
}

export function DocumentUploadModal({
  open,
  onOpenChange,
  submissionId,
  passcode,
  uploadUrl,
}: DocumentUploadModalProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = async (text: string, type: 'url' | 'passcode') => {
    try {
      await navigator.clipboard.writeText(text);
      
      if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedPasscode(true);
        setTimeout(() => setCopiedPasscode(false), 2000);
      }
      
      toast({
        title: "Copied!",
        description: `${type === 'url' ? 'Upload URL' : 'Passcode'} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Document Upload Link</DialogTitle>
          <DialogDescription>
            Share this secure link and passcode with the customer to upload their documents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Submission ID */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Submission ID
            </label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <code className="text-sm font-mono text-gray-900">{submissionId}</code>
            </div>
          </div>

          {/* Upload URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Upload URL
            </label>
            <div className="flex gap-2">
              <Input
                value={uploadUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(uploadUrl, 'url')}
                className="shrink-0"
              >
                {copiedUrl ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Passcode */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Passcode
            </label>
            <div className="flex gap-2">
              <Input
                value={passcode}
                readOnly
                className="font-mono text-lg font-semibold tracking-wider"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(passcode, 'passcode')}
                className="shrink-0"
              >
                {copiedPasscode ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              Instructions for Customer
            </h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Open the upload URL in your browser</li>
              <li>Enter the passcode when prompted</li>
              <li>Upload the requested documents (PDF, PNG, or JPEG only)</li>
              <li>Maximum file size: 10 MB per file</li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => window.open(uploadUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Link
            </Button>
            <Button onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
