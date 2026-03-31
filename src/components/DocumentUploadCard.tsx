import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle2, XCircle, FileText, Image as ImageIcon, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { DocumentUploadModal } from "./DocumentUploadModal";

interface DocumentUploadCardProps {
  submissionId: string;
  customerPhoneNumber?: string | null;
  embedded?: boolean;
}

type DocumentCategory = "police_report" | "insurance_document" | "medical_report";

type LeadDocumentRequest = {
  id: string;
  submission_id: string;
  police_report_required: boolean | null;
  insurance_document_required: boolean | null;
  medical_report_required: boolean | null;
  status: string | null;
  expires_at: string | null;
  email_sent_at: string | null;
  email_sent_to: string | null;
  updated_at: string | null;
};

type LeadDocument = {
  id: string;
  submission_id: string;
  request_id: string | null;
  category: DocumentCategory;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  bucket_name: string | null;
  uploaded_at: string | null;
  status: string | null;
};

type StorageListFile = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
};

type DocumentTypeConfig = {
  key: DocumentCategory;
  label: string;
  requestFlag: keyof Pick<
    LeadDocumentRequest,
    "police_report_required" | "insurance_document_required" | "medical_report_required"
  >;
};

const documentTypeConfig: DocumentTypeConfig[] = [
  {
    key: "police_report",
    label: "Police Report",
    requestFlag: "police_report_required",
  },
  {
    key: "insurance_document",
    label: "Insurance Document",
    requestFlag: "insurance_document_required",
  },
  {
    key: "medical_report",
    label: "Medical Report",
    requestFlag: "medical_report_required",
  },
];

const documentCategoryByFolder: Record<string, DocumentCategory> = {
  police_report: "police_report",
  police_reports: "police_report",
  insurance_document: "insurance_document",
  insurance_documents: "insurance_document",
  medical_report: "medical_report",
  medical_reports: "medical_report",
};

export function DocumentUploadCard({ submissionId, customerPhoneNumber, embedded = false }: DocumentUploadCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [generatedPasscode, setGeneratedPasscode] = useState<string>("");
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [request, setRequest] = useState<LeadDocumentRequest | null>(null);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const generatePasscode = () => {
    const digitsOnly = (customerPhoneNumber || "").replace(/\D/g, "");

    if (digitsOnly.length >= 4) {
      return digitsOnly.slice(-4);
    }

    if (digitsOnly.length > 0) {
      return digitsOnly;
    }

    return "0000";
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

  const inferCategoryFromPath = (path: string): DocumentCategory | null => {
    const normalizedPath = path.toLowerCase();

    if (normalizedPath.includes("/police_report/") || normalizedPath.includes("police")) {
      return "police_report";
    }

    if (normalizedPath.includes("/insurance_document/") || normalizedPath.includes("insurance")) {
      return "insurance_document";
    }

    if (normalizedPath.includes("/medical_report/") || normalizedPath.includes("medical")) {
      return "medical_report";
    }

    return null;
  };

  const fetchStorageDocuments = useCallback(async (): Promise<LeadDocument[]> => {
    const bucketName = "lead-documents";
    const visitedPaths = new Set<string>();
    const rootPaths = [
      submissionId,
      `${submissionId}/police_report`,
      `${submissionId}/police_reports`,
      `${submissionId}/insurance_document`,
      `${submissionId}/insurance_documents`,
      `${submissionId}/medical_report`,
      `${submissionId}/medical_reports`,
      `police_report/${submissionId}`,
      `police_reports/${submissionId}`,
      `insurance_document/${submissionId}`,
      `insurance_documents/${submissionId}`,
      `medical_report/${submissionId}`,
      `medical_reports/${submissionId}`,
    ];

    const collectFiles = async (path: string, depth = 0): Promise<LeadDocument[]> => {
      if (depth > 4 || visitedPaths.has(path)) {
        return [];
      }

      visitedPaths.add(path);

      const { data, error } = await supabase.storage.from(bucketName).list(path, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

      if (error || !data) {
        return [];
      }

      const nestedResults = await Promise.all(
        data.map(async (item) => {
          const file = item as StorageListFile;
          const itemPath = `${path}/${file.name}`.replace(/\/+/g, "/");
          const looksLikeFile =
            Boolean(file.metadata?.mimetype) ||
            typeof file.metadata?.size === "number" ||
            file.name.includes(".");

          if (!file.name || file.name === ".emptyFolderPlaceholder") {
            return [] as LeadDocument[];
          }

          if (!looksLikeFile) {
            return collectFiles(itemPath, depth + 1);
          }

          const category =
            itemPath
              .split("/")
              .map((segment) => documentCategoryByFolder[segment.toLowerCase()])
              .find(Boolean) ||
            inferCategoryFromPath(itemPath) ||
            "insurance_document";

          return [
            {
              id: file.id || itemPath,
              submission_id: submissionId,
              request_id: null,
              category,
              file_name: file.name,
              file_size: file.metadata?.size || 0,
              file_type: file.metadata?.mimetype || "",
              storage_path: itemPath,
              bucket_name: bucketName,
              uploaded_at: file.created_at || file.updated_at || null,
              status: "uploaded",
            } satisfies LeadDocument,
          ];
        })
      );

      return nestedResults.flat();
    };

    const rootFileResults = await Promise.all(
      Array.from(new Set(rootPaths)).map((path) => collectFiles(path))
    );

    const deduped = new Map<string, LeadDocument>();
    rootFileResults.flat().forEach((document) => {
      deduped.set(`${document.bucket_name || bucketName}:${document.storage_path}`, document);
    });

    return Array.from(deduped.values());
  }, [submissionId]);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoadingDocuments(true);

      const [{ data: requestData, error: requestError }, { data: documentData, error: documentError }, storageDocuments] = await Promise.all([
        (supabase as unknown as {
          from: (table: "lead_document_requests") => {
            select: (
              query: string
            ) => {
              eq: (
                column: "submission_id",
                value: string
              ) => { maybeSingle: () => Promise<{ data: LeadDocumentRequest | null; error: Error | null }> };
            };
          };
        })
          .from("lead_document_requests")
          .select("id, submission_id, police_report_required, insurance_document_required, medical_report_required, status, expires_at, email_sent_at, email_sent_to, updated_at")
          .eq("submission_id", submissionId)
          .maybeSingle(),
        (supabase as unknown as {
          from: (table: "lead_documents") => {
            select: (
              query: string
            ) => {
              eq: (
                column: "submission_id",
                value: string
              ) => {
                order: (
                  column: "uploaded_at",
                  options: { ascending: boolean }
                ) => Promise<{ data: LeadDocument[] | null; error: Error | null }>;
              };
            };
          };
        })
          .from("lead_documents")
          .select("id, submission_id, request_id, category, file_name, file_size, file_type, storage_path, bucket_name, uploaded_at, status")
          .eq("submission_id", submissionId)
          .order("uploaded_at", { ascending: false }),
        fetchStorageDocuments(),
      ]);

      if (requestError) {
        console.error("Error fetching document request:", requestError);
      }

      if (documentError) {
        console.error("Error fetching documents:", documentError);
      }

      setRequest(requestData ?? null);

      const databaseDocuments = (documentData ?? []).filter(Boolean);
      const mergedDocuments = [...databaseDocuments];
      const existingKeys = new Set(
        databaseDocuments.map((document) => `${document.bucket_name || "lead-documents"}:${document.storage_path}`)
      );

      storageDocuments.forEach((document) => {
        const key = `${document.bucket_name || "lead-documents"}:${document.storage_path}`;
        if (!existingKeys.has(key)) {
          mergedDocuments.push(document);
          existingKeys.add(key);
        }
      });

      mergedDocuments.sort((a, b) => {
        const aTime = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
        const bTime = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
        return bTime - aTime;
      });

      setDocuments(mergedDocuments);
    } finally {
      setLoadingDocuments(false);
    }
  }, [fetchStorageDocuments, submissionId]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const channel = supabase
      .channel(`lead-documents:${submissionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_documents",
          filter: `submission_id=eq.${submissionId}`,
        },
        () => {
          void fetchDocuments();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_document_requests",
          filter: `submission_id=eq.${submissionId}`,
        },
        () => {
          void fetchDocuments();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchDocuments, submissionId]);

  useEffect(() => {
    let isCancelled = false;

    const loadPreviewUrls = async () => {
      const urlEntries = await Promise.all(
        documents.map(async (document) => {
          const bucket = document.bucket_name || "lead-documents";
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(document.storage_path, 60 * 60);

          if (error || !data?.signedUrl) {
            return [document.id, ""] as const;
          }

          return [document.id, data.signedUrl] as const;
        })
      );

      if (isCancelled) {
        return;
      }

      setPreviewUrls(
        Object.fromEntries(urlEntries.filter(([, url]) => Boolean(url)))
      );
    };

    void loadPreviewUrls();

    return () => {
      isCancelled = true;
    };
  }, [documents]);

  const documentsByCategory = useMemo(() => {
    return documents.reduce<Record<string, LeadDocument[]>>((acc, document) => {
      if (!acc[document.category]) {
        acc[document.category] = [];
      }
      acc[document.category].push(document);
      return acc;
    }, {});
  }, [documents]);

  const requestedDocumentCount = useMemo(() => {
    if (!request) return 0;
    return documentTypeConfig.filter((item) => request[item.requestFlag]).length;
  }, [request]);

  const uploadedRequestedCount = useMemo(() => {
    if (!request) return 0;
    return documentTypeConfig.filter((item) => request[item.requestFlag] && (documentsByCategory[item.key]?.length || 0) > 0).length;
  }, [documentsByCategory, request]);

  const isPreviewableImage = (fileType: string) => fileType.startsWith("image/");
  const isPreviewablePdf = (fileType: string) => fileType === "application/pdf";

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const content = (
    <>
      {embedded ? null : (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Document Upload
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground mb-4">
            Generate a secure upload link for the customer to submit their documents.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={request ? "default" : "secondary"}>
                {request ? `Request: ${request.status || "pending"}` : "No request yet"}
              </Badge>
              <Badge variant="outline">
                {uploadedRequestedCount}/{requestedDocumentCount || documentTypeConfig.length} uploaded
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={loadingDocuments}>
                {loadingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button onClick={handleCreateUploadLink} className="w-full sm:w-auto">
                Create Upload Link
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {documentTypeConfig.map((documentType) => {
              const categoryDocuments = documentsByCategory[documentType.key] || [];
              const isRequired = request ? Boolean(request[documentType.requestFlag]) : false;
              const isUploaded = categoryDocuments.length > 0;

              return (
                <div
                  key={documentType.key}
                  className={`rounded-lg border p-3 ${
                    isUploaded
                      ? "border-emerald-200 bg-emerald-50"
                      : isRequired
                        ? "border-amber-200 bg-amber-50"
                        : "border-muted bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{documentType.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {isRequired ? "Required from customer" : "Optional / not requested"}
                      </div>
                    </div>
                    {isUploaded ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className={`h-5 w-5 shrink-0 ${isRequired ? "text-amber-600" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div className="mt-2 text-xs font-medium">
                    {isUploaded ? `${categoryDocuments.length} uploaded` : isRequired ? "Waiting for upload" : "Not uploaded"}
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">Uploaded Documents</h4>
                <p className="text-xs text-muted-foreground">
                  Live preview of customer uploads from Supabase Storage
                </p>
              </div>
            </div>

            {loadingDocuments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading documents...
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No documents uploaded yet for this submission.
              </div>
            ) : (
              <ScrollArea className="w-full">
                <div className="grid gap-4 pr-3 md:grid-cols-2">
                  {documents.map((document) => {
                    const publicUrl = previewUrls[document.id];
                    const fileType = document.file_type || "";

                    return (
                      <div key={document.id} className="rounded-lg border bg-background overflow-hidden">
                        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{document.file_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {documentTypeConfig.find((item) => item.key === document.category)?.label || document.category}
                              {" • "}
                              {formatFileSize(document.file_size)}
                            </div>
                          </div>
                          <Badge variant={document.status === "verified" ? "default" : "secondary"}>
                            {document.status || "uploaded"}
                          </Badge>
                        </div>

                        <div className="h-48 overflow-hidden bg-muted/30">
                          {publicUrl && isPreviewableImage(fileType) ? (
                            <img
                              src={publicUrl}
                              alt={document.file_name}
                              className="h-48 w-full object-cover"
                            />
                          ) : publicUrl && isPreviewablePdf(fileType) ? (
                            <iframe
                              src={publicUrl}
                              title={document.file_name}
                              className="h-full w-full border-0 bg-white"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              {fileType.startsWith("image/") ? (
                                <ImageIcon className="h-10 w-10" />
                              ) : (
                                <FileText className="h-10 w-10" />
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                          <span>
                            {document.uploaded_at ? new Date(document.uploaded_at).toLocaleString() : "Uploaded"}
                          </span>
                          {publicUrl ? (
                            <a
                              href={publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
      </CardContent>
    </>
  );

  return (
    <>
      {embedded ? content : <Card>{content}</Card>}
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
