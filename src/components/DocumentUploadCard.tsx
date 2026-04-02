import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle2, XCircle, FileText, Image as ImageIcon, Loader2, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { DocumentUploadModal } from "./DocumentUploadModal";

interface DocumentUploadCardProps {
  submissionId: string;
  customerPhoneNumber?: string | null;
  embedded?: boolean;
  onUploadedDocumentsToggle?: (open: boolean) => void;
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
  uploaded_by?: string | null;
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

const DOCUMENT_BUCKET_NAME = "lead-documents";
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const FILE_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

const sanitizeFileName = (fileName: string) =>
  fileName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

const resolveUploadMimeType = (file: File) => {
  if (file.type) return file.type;

  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return FILE_EXTENSION_TO_MIME_TYPE[extension] || "";
};

export function DocumentUploadCard({
  submissionId,
  customerPhoneNumber,
  embedded = false,
  onUploadedDocumentsToggle,
}: DocumentUploadCardProps) {
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [generatedPasscode, setGeneratedPasscode] = useState<string>("");
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [request, setRequest] = useState<LeadDocumentRequest | null>(null);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isUploadedDocumentsOpen, setIsUploadedDocumentsOpen] = useState(!embedded);
  const [selectedUploadCategory, setSelectedUploadCategory] = useState<DocumentCategory>("insurance_document");
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleOpenDirectUpload = () => {
    fileInputRef.current?.click();
  };

  const getUploadUrl = () => {
    const baseUrl = import.meta.env.VITE_UPLOAD_PORTAL_URL;
    return `${baseUrl}/upload-document/${submissionId}`;
  };

  const selectedUploadCategoryLabel =
    documentTypeConfig.find((documentType) => documentType.key === selectedUploadCategory)?.label || "Document";

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

      const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET_NAME).list(path, {
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
              bucket_name: DOCUMENT_BUCKET_NAME,
              uploaded_at: file.created_at || file.updated_at || null,
              uploaded_by: null,
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
      deduped.set(`${document.bucket_name || DOCUMENT_BUCKET_NAME}:${document.storage_path}`, document);
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
          .select("id, submission_id, request_id, category, file_name, file_size, file_type, storage_path, bucket_name, uploaded_at, uploaded_by, status")
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
      const storageDocumentKeys = new Set(
        storageDocuments.map((document) => `${document.bucket_name || DOCUMENT_BUCKET_NAME}:${document.storage_path}`)
      );
      const databaseDocumentsStillInStorage = databaseDocuments.filter((document) =>
        storageDocumentKeys.has(`${document.bucket_name || DOCUMENT_BUCKET_NAME}:${document.storage_path}`)
      );
      const mergedDocuments = [...databaseDocumentsStillInStorage];
      const existingKeys = new Set(
        databaseDocumentsStillInStorage.map((document) => `${document.bucket_name || DOCUMENT_BUCKET_NAME}:${document.storage_path}`)
      );

      storageDocuments.forEach((document) => {
        const key = `${document.bucket_name || DOCUMENT_BUCKET_NAME}:${document.storage_path}`;
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
    if (!request) return;

    const firstRequiredCategory =
      documentTypeConfig.find((documentType) => Boolean(request[documentType.requestFlag]))?.key || "insurance_document";

    setSelectedUploadCategory((currentCategory) => currentCategory || firstRequiredCategory);
  }, [request]);

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
          const bucket = document.bucket_name || DOCUMENT_BUCKET_NAME;
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

  const handleSelectedFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []);
    setSelectedUploadFiles(nextFiles);
  };

  const handleUploadFiles = async () => {
    if (selectedUploadFiles.length === 0) {
      toast({
        title: "Select files first",
        description: "Choose one or more files to upload into the live document stream.",
        variant: "destructive",
      });
      return;
    }

    const invalidFile = selectedUploadFiles.find((file) => {
      const mimeType = resolveUploadMimeType(file);
      return !ACCEPTED_UPLOAD_TYPES.includes(mimeType) || file.size > MAX_UPLOAD_SIZE_BYTES;
    });

    if (invalidFile) {
      const reason = invalidFile.size > MAX_UPLOAD_SIZE_BYTES ? "larger than 10 MB" : "not a PDF, JPG, or PNG file";
      toast({
        title: "Unsupported file",
        description: `${invalidFile.name} is ${reason}.`,
        variant: "destructive",
      });
      return;
    }

    setUploadingFiles(true);

    try {
      const timestamp = new Date().toISOString();
      const requestId = request?.id ?? null;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const leadDocumentsTable = (supabase as unknown as {
        from: (table: "lead_documents") => {
          insert: (payload: Array<Record<string, unknown>>) => Promise<{ error: Error | null }>;
        };
      }).from("lead_documents");

      await Promise.all(
        selectedUploadFiles.map(async (file) => {
          const mimeType = resolveUploadMimeType(file);
          const safeName = sanitizeFileName(file.name) || `document-${Date.now()}`;
          const uniqueId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const storagePath = `${submissionId}/${selectedUploadCategory}/${uniqueId}-${safeName}`;

          const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET_NAME).upload(storagePath, file, {
            upsert: false,
            contentType: mimeType,
          });

          if (uploadError) {
            throw uploadError;
          }

          const { error: insertError } = await leadDocumentsTable.insert([
            {
              submission_id: submissionId,
              request_id: requestId,
              category: selectedUploadCategory,
              file_name: file.name,
              file_size: file.size,
              file_type: mimeType,
              storage_path: storagePath,
              bucket_name: DOCUMENT_BUCKET_NAME,
              uploaded_at: timestamp,
              uploaded_by: user?.id ?? null,
              status: "uploaded",
            },
          ]);

          if (insertError) {
            await supabase.storage.from(DOCUMENT_BUCKET_NAME).remove([storagePath]);
            throw insertError;
          }
        }),
      );

      setSelectedUploadFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsUploadedDocumentsOpen(true);
      onUploadedDocumentsToggle?.(true);
      await fetchDocuments();

      toast({
        title: "Documents uploaded",
        description:
          selectedUploadFiles.length === 1
            ? `${selectedUploadFiles[0].name} was added to the live document stream.`
            : `${selectedUploadFiles.length} files were added to the live document stream.`,
      });
    } catch (error) {
      console.error("Error uploading documents:", error);
      toast({
        title: "Upload failed",
        description: "The files could not be uploaded. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingFiles(false);
    }
  };

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
      <CardContent className={embedded ? "space-y-4 px-0 py-0" : "space-y-5"}>
        <div className="space-y-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={request ? "default" : "secondary"}>
                {request ? `Request: ${request.status || "pending"}` : "No request yet"}
              </Badge>
              <Badge variant="outline">
                {uploadedRequestedCount}/{requestedDocumentCount || documentTypeConfig.length} categories uploaded
              </Badge>
              <Badge variant="outline">
                {documents.length} file{documents.length === 1 ? "" : "s"} in stream
              </Badge>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchDocuments()}
              disabled={loadingDocuments}
              className="gap-2 rounded-md border-[#efbb93]/80 bg-white/92 text-[#9a5a33] shadow-sm transition-colors hover:border-[#e1893b] hover:bg-[#e1893b] hover:text-white"
            >
              {loadingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-[18px] border border-[#f2d5c1] bg-[linear-gradient(180deg,rgba(255,245,236,0.95)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-[0_14px_30px_-26px_rgba(234,117,38,0.4)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">Portal Upload Link</div>
                <div className="shrink-0 whitespace-nowrap rounded-full border border-[#efbb93]/70 bg-white/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9a5a33]">
                  Live Link
                </div>
              </div>

              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                Share the secure portal and passcode with the client so they can upload directly from phone or desktop.
              </div>

              <div className="mt-3 space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Portal URL</Label>
                <Input value={getUploadUrl()} readOnly className="h-9 rounded-xl border-[#ecd6c5] bg-white/90 text-xs" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>Passcode uses the caller's last phone digits.</span>
                <span className="text-[#d28a54]">PDF, JPG, PNG accepted.</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={handleCreateUploadLink}
                  className="rounded-md bg-[linear-gradient(135deg,#e1893b_0%,#cb6f2a_52%,#ad571b_100%)] text-white shadow-[0_16px_28px_-18px_rgba(173,87,27,0.75)] hover:bg-[linear-gradient(135deg,#e6944b_0%,#d67930_52%,#b75f20_100%)]"
                >
                  Create Upload Link
                </Button>
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">Direct Upload</div>
                <div className="shrink-0 whitespace-nowrap rounded-full border border-slate-300/90 bg-white/88 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                  Manual Upload
                </div>
              </div>

              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                Upload on behalf of the client and send files into the same live stream used by the document portal.
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.95fr)_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`document-upload-category-${submissionId}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Document Category
                  </Label>
                  <Select value={selectedUploadCategory} onValueChange={(value) => setSelectedUploadCategory(value as DocumentCategory)}>
                    <SelectTrigger id={`document-upload-category-${submissionId}`} className="h-9 rounded-xl border-slate-200 bg-white/90 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypeConfig.map((documentType) => (
                        <SelectItem key={documentType.key} value={documentType.key}>
                          {documentType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md border-slate-200 bg-white/90 text-slate-700 transition-[border-color,color,box-shadow] hover:border-[#2c3440] hover:bg-[#2c3440] hover:text-white focus-visible:ring-[#2c3440]/25"
                    onClick={handleOpenDirectUpload}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Choose Files
                  </Button>
                  <Button
                    type="button"
                    className="rounded-md bg-[linear-gradient(135deg,#45505f_0%,#2c3440_48%,#161c24_100%)] text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.9)] hover:bg-[linear-gradient(135deg,#4b5666_0%,#313947_48%,#1a2028_100%)]"
                    onClick={() => void handleUploadFiles()}
                    disabled={uploadingFiles || selectedUploadFiles.length === 0}
                  >
                    {uploadingFiles ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload Directly"
                    )}
                  </Button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={handleSelectedFiles}
              />

              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-2.5">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {selectedUploadFiles.length > 0
                        ? `${selectedUploadFiles.length} file${selectedUploadFiles.length === 1 ? "" : "s"} ready for ${selectedUploadCategoryLabel}`
                        : "No files selected yet"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Files uploaded here will appear in the same live preview as portal uploads.
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">Max 10 MB each • PDF, JPG, PNG</div>
                </div>
                {selectedUploadFiles.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedUploadFiles.slice(0, 3).map((file) => (
                      <Badge key={`${file.name}-${file.size}`} variant="secondary" className="rounded-full px-2.5 py-1">
                        {file.name}
                      </Badge>
                    ))}
                    {selectedUploadFiles.length > 3 ? (
                      <Badge variant="outline" className="rounded-full px-2.5 py-1">
                        +{selectedUploadFiles.length - 3} more
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 md:grid-cols-3">
            {documentTypeConfig.map((documentType) => {
              const categoryDocuments = documentsByCategory[documentType.key] || [];
              const isRequired = request ? Boolean(request[documentType.requestFlag]) : false;
              const isUploaded = categoryDocuments.length > 0;

              return (
                <div
                  key={documentType.key}
                  className={`rounded-xl border px-3 py-3 ${
                    isUploaded
                      ? "border-emerald-200 bg-emerald-50/85"
                      : isRequired
                        ? "border-amber-200 bg-amber-50/85"
                        : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{documentType.label}</div>
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
                  <div className="mt-1.5 text-xs font-medium">
                    {isUploaded ? `${categoryDocuments.length} uploaded` : isRequired ? "Waiting for upload" : "Not uploaded"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

          <Separator />

          <Collapsible
            open={isUploadedDocumentsOpen}
            onOpenChange={(open) => {
              setIsUploadedDocumentsOpen(open);
              onUploadedDocumentsToggle?.(open);
            }}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">Uploaded Documents</h4>
                  <p className="text-xs text-muted-foreground">
                    Live preview of portal and direct uploads from the shared document stream
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-md border-[#efbb93]/80 bg-white/92 text-[#9a5a33] shadow-sm transition-colors hover:border-[#e1893b] hover:bg-[#e1893b] hover:text-white"
                  >
                    {isUploadedDocumentsOpen ? "Hide uploads" : "Show uploads"}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                        isUploadedDocumentsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="space-y-3">
              {loadingDocuments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading documents...
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No documents have been uploaded into this live stream yet.
              </div>
            ) : (
              <ScrollArea className="w-full">
                <div className="grid gap-4 pr-3 md:grid-cols-2">
                  {documents.map((document) => {
                    const publicUrl = previewUrls[document.id];
                    const fileType = document.file_type || "";
                    const uploadSourceLabel = document.uploaded_by ? "Direct Upload" : "Portal Upload";
                    const uploadSourceClass = document.uploaded_by
                      ? "border-transparent bg-[linear-gradient(135deg,#45505f_0%,#2c3440_48%,#161c24_100%)] text-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.95)]"
                      : "border-[#efbb93]/70 bg-[#fff2e8] text-[#9a5a33]";
                    const shouldShowStatusBadge = Boolean(document.status && document.status !== "uploaded");

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
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${uploadSourceClass}`}>
                              {uploadSourceLabel}
                            </Badge>
                            {shouldShowStatusBadge ? (
                              <Badge variant={document.status === "verified" ? "default" : "secondary"}>
                                {document.status}
                              </Badge>
                            ) : null}
                          </div>
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
              </CollapsibleContent>
            </div>
          </Collapsible>
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
