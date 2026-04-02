import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, ExternalLink, FileText, FolderOpen, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";

interface LeadDocumentsTabProps {
  submissionId: string;
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
];

const documentCategoryByFolder: Record<string, DocumentCategory> = {
  police_report: "police_report",
  police_reports: "police_report",
  insurance_document: "insurance_document",
  insurance_documents: "insurance_document",
  medical_report: "medical_report",
  medical_reports: "medical_report",
};

export function LeadDocumentsTab({ submissionId }: LeadDocumentsTabProps) {
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [request, setRequest] = useState<LeadDocumentRequest | null>(null);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

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
      deduped.set(`${document.bucket_name || bucketName}:${document.storage_path}`, document);
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
        storageDocuments.map((document) => `${document.bucket_name || "lead-documents"}:${document.storage_path}`)
      );
      const databaseDocumentsStillInStorage = databaseDocuments.filter((document) =>
        storageDocumentKeys.has(`${document.bucket_name || "lead-documents"}:${document.storage_path}`)
      );
      const mergedDocuments = [...databaseDocumentsStillInStorage];
      const existingKeys = new Set(
        databaseDocumentsStillInStorage.map((document) => `${document.bucket_name || "lead-documents"}:${document.storage_path}`)
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
          const bucket = document.bucket_name || "lead-documents";
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
    return documentTypeConfig.map((categoryConfig) => {
      const categoryDocuments = documents.filter((document) => document.category === categoryConfig.key);
      return {
        ...categoryConfig,
        documents: categoryDocuments,
      };
    });
  }, [documents]);

  const totalRequested = useMemo(() => {
    if (!request) return 0;
    return documentTypeConfig.filter((item) => request[item.requestFlag]).length;
  }, [request]);

  const totalUploadedRequested = useMemo(() => {
    if (!request) return 0;
    return documentsByCategory.filter((item) => request[item.requestFlag] && item.documents.length > 0).length;
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
              {totalUploadedRequested}/{totalRequested || documentTypeConfig.length} requested categories uploaded
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={loadingDocuments}>
              {loadingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          {documentsByCategory.map((category) => {
            const isRequired = request ? Boolean(request[category.requestFlag]) : false;
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
