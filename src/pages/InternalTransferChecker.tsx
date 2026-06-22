import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Loader2,
  ExternalLink,
  Phone,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";

type Lead = {
  id: string;
  customer_full_name: string | null;
  phone_number: string | null;
  state: string | null;
  status: string | null;
  submission_id: string | null;
  created_at: string | null;
  tag: string | null;
};

type PortalStage = {
  pipeline: string;
  key: string;
  label: string;
};

type StageRule = {
  stage_name: string;
  message: string;
  is_addable: boolean;
};

type StageInfoResult = {
  stageName: string;
  message: string;
  isAddable: boolean;
  pipeline: string;
};

const PIPELINE_COLORS: Record<string, string> = {
  transfer_portal: "bg-blue-100 text-blue-800",
  submission_portal: "bg-green-100 text-green-800",
  closer_portal: "bg-purple-100 text-purple-800",
  cold_call_pipeline: "bg-orange-100 text-orange-800",
  payment_status: "bg-yellow-100 text-yellow-800",
  lawyer_portal: "bg-indigo-100 text-indigo-800",
};

const PIPELINE_LABELS: Record<string, string> = {
  transfer_portal: "Transfer",
  submission_portal: "Submission",
  closer_portal: "Closer",
  cold_call_pipeline: "Cold Call",
  payment_status: "Payment",
  lawyer_portal: "Lawyer",
};

type SearchMode = "name" | "phone";

const InternalTransferChecker = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [searchMode, setSearchMode] = useState<SearchMode>("phone");
  const [searchValue, setSearchValue] = useState("");
  const [results, setResults] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [portalStages, setPortalStages] = useState<PortalStage[]>([]);
  const [stageRules, setStageRules] = useState<StageRule[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [stagesRes, rulesRes] = await Promise.all([
          supabase
            .from("portal_stages")
            .select("pipeline, key, label")
            .eq("is_active", true)
            .order("display_order", { ascending: true }),
          supabase
            .from("ssn_duplicate_stage_rules")
            .select("stage_name, message, is_addable")
            .eq("is_active", true)
            .order("precedence_rank", { ascending: true }),
        ]);

        if (stagesRes.error) throw stagesRes.error;
        if (rulesRes.error) throw rulesRes.error;

        setPortalStages((stagesRes.data ?? []) as PortalStage[]);
        setStageRules((rulesRes.data ?? []) as StageRule[]);
      } catch (err: any) {
        toast({ title: "Failed to load stage data", description: err.message, variant: "destructive" });
      } finally {
        setLoadingMeta(false);
      }
    };

    fetchMeta();
  }, [toast]);

  const getStageInfo = useCallback(
    (status: string | null): StageInfoResult | null => {
      const s = (status ?? "").trim().toLowerCase();
      if (!s || portalStages.length === 0 || stageRules.length === 0) return null;

      const stage = portalStages.find((ps) => ps.key === s);
      if (!stage) return null;

      const stageName = `${stage.pipeline} - ${stage.label}`;
      const rule = stageRules.find((r) => r.stage_name === stageName);
      if (!rule) return null;

      return {
        stageName,
        message: rule.message,
        isAddable: rule.is_addable,
        pipeline: stage.pipeline,
      };
    },
    [portalStages, stageRules]
  );

  const handleSearch = useCallback(async () => {
    const trimmed = searchValue.trim();
    if (!trimmed) {
      toast({
        title: "Search criteria required",
        description: "Enter a name or phone number to search.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      let query = supabase
        .from("leads")
        .select("id, customer_full_name, phone_number, state, status, submission_id, created_at, tag")
        .order("created_at", { ascending: false });

      if (searchMode === "name") {
        query = query.ilike("customer_full_name", `%${trimmed}%`);
      } else {
        const cleanPhone = trimmed.replace(/\D/g, "");
        const phonePattern = cleanPhone.length >= 4 ? cleanPhone : trimmed;
        query = query.ilike("phone_number", `%${phonePattern}%`);
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;

      setResults((data as Lead[]) ?? []);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchValue, searchMode, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  if (loadingMeta) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-8">
      <div className={`flex flex-col items-center justify-center ${!hasSearched || results.length === 0 ? "min-h-[60vh]" : ""}`}>
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">Internal Transfer Checker</h1>
            <p className="text-muted-foreground mt-2">
              Search for a lead to check transfer eligibility
            </p>
          </div>

          <div className="flex items-center justify-center gap-1 bg-muted p-1 rounded-lg w-fit mx-auto">
            <button
              onClick={() => setSearchMode("name")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === "name"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-4 w-4" />
              Search by Name
            </button>
            <button
              onClick={() => setSearchMode("phone")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === "phone"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Phone className="h-4 w-4" />
              Search by Phone
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={searchMode === "name" ? "Search by lead name..." : "Search by phone number..."}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-12 h-14 text-lg rounded-xl"
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoading} className="h-14 px-6 rounded-xl shrink-0">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </Button>
            {hasSearched && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchValue("");
                  setResults([]);
                  setHasSearched(false);
                }}
                className="h-14 px-4 rounded-xl shrink-0"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && hasSearched && results.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No leads found matching your search criteria.
          </CardContent>
        </Card>
      )}

      {!isLoading && results.length > 0 && (
        <div className="space-y-4 max-w-xl mx-auto">
          <div className="text-sm text-muted-foreground">
            {results.length} lead{results.length !== 1 ? "s" : ""} found
          </div>

          <div className="grid gap-4">
            {results.map((lead) => {
              const stageInfo = getStageInfo(lead.status);
              return (
                <Card key={lead.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold truncate">
                            {lead.customer_full_name || "Unnamed Lead"}
                          </h3>
                          {lead.tag && (
                            <Badge variant="outline" className="text-xs">
                              {lead.tag}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {lead.phone_number && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {lead.phone_number}
                            </span>
                          )}
                          {lead.state && <span>{lead.state}</span>}
                        </div>

                        {stageInfo && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {stageInfo?.pipeline && PIPELINE_LABELS[stageInfo.pipeline] && (
                                <Badge
                                  className={PIPELINE_COLORS[stageInfo.pipeline] || "bg-gray-100 text-gray-800"}
                                >
                                  {PIPELINE_LABELS[stageInfo.pipeline]}
                                </Badge>
                              )}
                              {stageInfo && (
                                <span className="text-xs text-muted-foreground">
                                  {stageInfo.stageName.split(" - ").slice(1).join(" - ")}
                                </span>
                              )}
                            </div>

                            <div
                              className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                                stageInfo.isAddable
                                  ? "bg-green-50 text-green-800 border border-green-200"
                                  : "bg-red-50 text-red-800 border border-red-200"
                              }`}
                            >
                              {stageInfo.isAddable ? (
                                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                              )}
                              <span>{stageInfo.message}</span>
                            </div>
                          </div>
                        )}

                        {!stageInfo && lead.status && (
                          <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-gray-50 text-gray-600 border border-gray-200">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Stage: {lead.status} — no transfer rule defined</span>
                          </div>
                        )}

                        {!lead.status && (
                          <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-gray-50 text-gray-600 border border-gray-200">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>No stage status assigned</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default InternalTransferChecker;
