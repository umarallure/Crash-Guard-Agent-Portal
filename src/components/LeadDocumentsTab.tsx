import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, ExternalLink, FileText, FolderOpen, Image as ImageIcon, Loader2, RefreshCw, Upload } from "lucide-react";

interface LeadDocumentsTabProps {
  submissionId: string;
  allowDirectUpload?: boolean;
  includeOtherCategory?: boolean;
}

type DocumentCategory = "police_report" | "insurance_document" | "medical_report" | "other_document";

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
  requestFlag?: keyof Pick<
    LeadDocumentRequest,
    "police_report_required" | "insurance_document_required" | "medical_report_required"
  >;
  description: string;
};

const documentTypeConfig: DocumentTypeConfig[] = [
  {
    key: "police_report",
    label: "Police Report",
    requestFlag: "police_report_required",
    description: "Crash reports, incident reports, and law-enforcement records.",
  },
  {
    key: "insurance_document",
    label: "Insurance Document",
    requestFlag: "insurance_document_required",
    description: "Insurance cards, declarations, claim paperwork, and carrier files.",
  },
  {
    key: "medical_report",
    label: "Medical Report",
    requestFlag: "medical_report_required",
    description: "Medical records, discharge paperwork, bills, and treatment documents.",
  },
  {
    key: "other_document",
    label: "Other Document",
    description: "Any additional files that do not fit the standard police, insurance, or medical groups.",
  },
];

const documentCategoryByFolder: Record<string, DocumentCategory> = {
  police_report: "police_report",
  police_reports: "police_report",
  insurance_document: "insurance_document",
  insurance_documents: "insurance_document",
  medical_report: "medical_report",
  medical_reports: "medical_report",
  other_document: "other_document",
  other_documents: "other_document",
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

export function LeadDocumentsTab({
  submissionId,
  allowDirectUpload = false,
  includeOtherCategory = false,
}: LeadDocumentsTabProps) {
  const { toast } = useToast();
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [request, setRequest] = useState<LeadDocumentRequest | null>(null);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [selectedUploadCategory, setSelectedUploadCategory] = useState<DocumentCategory>("insurance_document");
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleDocumentTypeConfig = useMemo(
    () =>
      includeOtherCategory
        ? documentTypeConfig
        : documentTypeConfig.filter((documentType) => documentType.key !== "other_document"),
    [includeOtherCategory]
  );

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

    if (normalizedPath.includes("/other_document/") || normalizedPath.includes("/other_documents/")) {
      return "other_document";
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
      `${submissionId}/other_document`,
      `${submissionId}/other_documents`,
      `police_report/${submissionId}`,
      `police_reports/${submissionId}`,
      `insurance_document/${submissionId}`,
      `insurance_documents/${submissionId}`,
      `medical_report/${submissionId}`,
      `medical_reports/${submissionId}`,
      `other_document/${submissionId}`,
      `other_documents/${submissionId}`,
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

    const rootFileResults = await Promise.all(Array.from(new Set(rootPaths)).map((path) => collectFiles(path)));
    const deduped = new Map<string, LeadDocument>();

    rootFileResults.flat().forEach((document) => {
      deduped.set(`${document.bucket_name || DOCUMENT_BUCKET_NAME}:${document.storage_path}`, document);
    });

    return Array.from(deduped.values());
  }, [submissionId]);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoadingDocuments(true);

      const [{ data: requestData }, { data: documentData }, storageDocuments] = await Promise.all([
        (supabase as unknown as {
          from: (table: "lead_document_requests") => {
            select: (query: string) => {
              eq: (column: "submission_id", value: string) => {
                maybeSingle: () => Promise<{ data: LeadDocumentRequest | null; error: Error | null }>;
              };
            };
          };
        })
          .from("lead_document_requests")
          .select("id, submission_id, police_report_required, insurance_document_required, medical_report_required, status, expires_at, email_sent_at, email_sent_to, updated_at")
          .eq("submission_id", submissionId)
          .maybeSingle(),
        (supabase as unknown as {
          from: (table: "lead_documents") => {
            select: (query: string) => {
              eq: (column: "submission_id", value: string) => {
                order: (column: "uploaded_at", options: { ascending: boolean }) => Promise<{ data: LeadDocument[] | null; error: Error | null }>;
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
    const firstRequiredCategory =
      visibleDocumentTypeConfig.find((documentType) => documentType.requestFlag && request?.[documentType.requestFlag])?.key ||
      "insurance_document";

    setSelectedUploadCategory((currentCategory) => currentCategory || firstRequiredCategory);
  }, [request, visibleDocumentTypeConfig]);

  useEffect(() => {
    const channel = supabase
      .channel(`lead-documents-browser:${submissionId}`)
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
          const { data, error } = await supabase.storage.from(bucket).createSignedUrl(document.storage_path, 60 * 60);

          if (error || !data?.signedUrl) {
            return [document.id, ""] as const;
          }

          return [document.id, data.signedUrl] as const;
        })
      );

      if (isCancelled) return;

      setPreviewUrls(Object.fromEntries(urlEntries.filter(([, url]) => Boolean(url))));
    };

    void loadPreviewUrls();

    return () => {
      isCancelled = true;
    };
  }, [documents]);

  const documentsByCategory = useMemo(() => {
    return visibleDocumentTypeConfig.map((categoryConfig) => {
      const categoryDocuments = documents.filter((document) => document.category === categoryConfig.key);
      return {
        ...categoryConfig,
        documents: categoryDocuments,
      };
    });
  }, [documents, visibleDocumentTypeConfig]);

  const requestableDocumentTypes = useMemo(() => visibleDocumentTypeConfig.filter((item) => item.requestFlag), [visibleDocumentTypeConfig]);

  const totalRequested = useMemo(() => {
    if (!request) return 0;
    return requestableDocumentTypes.filter((item) => item.requestFlag && request[item.requestFlag]).length;
  }, [request, requestableDocumentTypes]);

  const totalUploadedRequested = useMemo(() => {
    if (!request) return 0;
    return documentsByCategory.filter((item) => item.requestFlag && request[item.requestFlag] && item.documents.length > 0).length;
  }, [documentsByCategory, request]);

  const selectedUploadCategoryLabel =
    visibleDocumentTypeConfig.find((documentType) => documentType.key === selectedUploadCategory)?.label || "Document";

  const handleOpenDirectUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSelectedFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedUploadFiles(Array.from(event.target.files || []));
  };

  const handleUploadFiles = async () => {
    if (selectedUploadFiles.length === 0) {
      toast({
        title: "Select files first",
        description: "Choose one or more files to upload for this lead.",
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
          const uniqueId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
        })
      );

      setSelectedUploadFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await fetchDocuments();

      toast({
        title: "Documents uploaded",
        description:
          selectedUploadFiles.length === 1
            ? `${selectedUploadFiles[0].name} was uploaded successfully.`
            : `${selectedUploadFiles.length} files were uploaded successfully.`,
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

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Documents
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse all documents available in Supabase Storage for this submission, grouped by category.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={request ? "default" : "secondary"}>
              {request ? `Request: ${request.status || "pending"}` : "No request found"}
            </Badge>
            <Badge variant="outline">
              {documents.length} file{documents.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              {totalUploadedRequested}/{totalRequested || requestableDocumentTypes.length} requested categories uploaded
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void fetchDocuments()} disabled={loadingDocuments}>
              {loadingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {allowDirectUpload ? (
          <div className="rounded-xl border bg-muted/10 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Upload className="h-4 w-4" />
                  Upload Documents
                </div>
                <p className="text-sm text-muted-foreground">
                  Add files directly from the lead detail page into this submission&apos;s document stream.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`lead-document-category-${submissionId}`} className="text-xs font-medium text-muted-foreground">
                    Document Category
                  </Label>
                  <Select value={selectedUploadCategory} onValueChange={(value) => setSelectedUploadCategory(value as DocumentCategory)}>
                    <SelectTrigger id={`lead-document-category-${submissionId}`} className="h-9 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleDocumentTypeConfig.map((documentType) => (
                        <SelectItem key={documentType.key} value={documentType.key}>
                          {documentType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={handleOpenDirectUpload}>
                    <Upload className="mr-2 h-4 w-4" />
                    Choose Files
                  </Button>
                  <Button type="button" onClick={() => void handleUploadFiles()} disabled={uploadingFiles || selectedUploadFiles.length === 0}>
                    {uploadingFiles ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload"
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <Input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={handleSelectedFiles}
            />

            <div className="mt-4 rounded-lg border border-dashed bg-background/70 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {selectedUploadFiles.length > 0
                      ? `${selectedUploadFiles.length} file${selectedUploadFiles.length === 1 ? "" : "s"} ready for ${selectedUploadCategoryLabel}`
                      : "No files selected yet"}
                  </div>
                  <div className="text-xs text-muted-foreground">Accepted types: PDF, JPG, PNG. Max size: 10 MB per file.</div>
                </div>
                {selectedUploadFiles.length > 0 ? <Badge variant="secondary">{selectedUploadFiles.length} selected</Badge> : null}
              </div>

              {selectedUploadFiles.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedUploadFiles.slice(0, 4).map((file) => (
                    <Badge key={`${file.name}-${file.size}`} variant="outline">
                      {file.name}
                    </Badge>
                  ))}
                  {selectedUploadFiles.length > 4 ? <Badge variant="outline">+{selectedUploadFiles.length - 4} more</Badge> : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {documentsByCategory.map((category) => {
            const isRequired = category.requestFlag ? (request ? Boolean(request[category.requestFlag]) : false) : false;
            const hasFiles = category.documents.length > 0;

            return (
              <div
                key={category.key}
                className={`rounded-xl border p-4 ${
                  hasFiles
                    ? "border-emerald-200 bg-emerald-50/60"
                    : isRequired
                      ? "border-amber-200 bg-amber-50/60"
                      : "border-border bg-muted/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{category.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{category.description}</div>
                  </div>
                  {hasFiles ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={hasFiles ? "default" : "secondary"}>
                    {category.documents.length} file{category.documents.length === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline">{isRequired ? "Required" : "Optional"}</Badge>
                </div>
              </div>
            );
          })}
        </div>

        {loadingDocuments ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No documents were found in storage for this submission.
          </div>
        ) : (
          <Accordion type="multiple" className="w-full rounded-lg border px-4">
            {documentsByCategory.map((category) => (
              <AccordionItem key={category.key} value={category.key}>
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-4 text-left">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{category.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {category.documents.length > 0
                          ? `${category.documents.length} document${category.documents.length === 1 ? "" : "s"} available`
                          : "No documents in this category"}
                      </div>
                    </div>
                    <Badge variant="outline">{category.documents.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {category.documents.length === 0 ? (
                    <div className="pb-2 text-sm text-muted-foreground">No documents uploaded in this category yet.</div>
                  ) : (
                    <ScrollArea className="w-full">
                      <div className="grid gap-4 pb-2 pr-2 md:grid-cols-2 xl:grid-cols-3">
                        {category.documents.map((document) => {
                          const previewUrl = previewUrls[document.id];
                          const fileType = document.file_type || "";
                          const uploadSourceLabel = document.uploaded_by ? "Direct Upload" : "Portal Upload";
                          const uploadSourceClass = document.uploaded_by
                            ? "border-transparent bg-[linear-gradient(135deg,#45505f_0%,#2c3440_48%,#161c24_100%)] text-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.95)]"
                            : "border-[#efbb93]/70 bg-[#fff2e8] text-[#9a5a33]";
                          const shouldShowStatusBadge = Boolean(document.status && document.status !== "uploaded");

                          return (
                            <div key={document.id} className="overflow-hidden rounded-lg border bg-background">
                              <div className="flex items-start justify-between gap-3 border-b px-3 py-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{document.file_name}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {formatFileSize(document.file_size)}
                                    {document.uploaded_at ? ` • ${new Date(document.uploaded_at).toLocaleString()}` : ""}
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

                              <div className="h-44 overflow-hidden bg-muted/30">
                                {previewUrl && isPreviewableImage(fileType) ? (
                                  <img src={previewUrl} alt={document.file_name} className="h-full w-full object-cover" />
                                ) : previewUrl && isPreviewablePdf(fileType) ? (
                                  <iframe src={previewUrl} title={document.file_name} className="h-full w-full border-0 bg-white" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-muted-foreground">
                                    {fileType.startsWith("image/") ? <ImageIcon className="h-10 w-10" /> : <FileText className="h-10 w-10" />}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
                                <div className="truncate">{document.storage_path}</div>
                                {previewUrl ? (
                                  <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
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
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
