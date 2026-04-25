import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, BriefcaseBusiness, CheckCircle2, Loader2, RefreshCw, Scale, Search, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AttorneyAccountType,
  type AttorneyRecommendation,
  type AttorneyRecommendationResult,
  getAttorneyRecommendations,
  loadLeadForAttorneyRecommendations,
} from "@/lib/attorneyRecommendations";

type AccountFilter = "all" | AttorneyAccountType;

const accountFilterOptions: Array<{ value: AccountFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "internal_lawyer", label: "Internal" },
  { value: "broker_lawyer", label: "Broker" },
];

const getAccountLabel = (value: AttorneyAccountType) =>
  value === "internal_lawyer" ? "Internal Lawyer" : "Broker Lawyer";

const getSourceLabel = (value: AttorneyRecommendation["coverageSource"]) => {
  if (value === "orders") return "Open orders";
  if (value === "licensed_states") return "License fallback";
  if (value === "lawyer_requirements") return "Lawyer requirements";
  return "No coverage";
};

const getSourceClasses = (value: AttorneyRecommendation["coverageSource"]) => {
  if (value === "orders") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "licensed_states") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "lawyer_requirements") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const getSolClasses = (rec: AttorneyRecommendation) => {
  if (!rec.solMatch) return "border-rose-200 bg-rose-50 text-rose-700";
  if (rec.sol.status === "missing_accident_date") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const getMatchIcon = (rec: AttorneyRecommendation) =>
  rec.isMatch ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  ) : (
    <XCircle className="h-4 w-4 text-rose-500" />
  );

const RecommendationTable = ({
  title,
  accountType,
  rows,
}: {
  title: string;
  accountType: AttorneyAccountType;
  rows: AttorneyRecommendation[];
}) => {
  const Icon = accountType === "internal_lawyer" ? Scale : BriefcaseBusiness;
  const matchedCount = rows.filter((row) => row.isMatch).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{matchedCount} matched</Badge>
            <Badge variant="outline">{rows.length} checked</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Attorney</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>SOL</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead className="min-w-[260px]">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((rec) => {
                const remaining = rec.openOrders.reduce((sum, order) => sum + order.remaining, 0);

                return (
                  <TableRow key={`${rec.accountType}-${rec.id}`}>
                    <TableCell>
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium text-foreground">{rec.attorneyName}</div>
                        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {rec.primaryEmail ? <span>{rec.primaryEmail}</span> : null}
                          {rec.didNumber ? <span>{rec.didNumber}</span> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getMatchIcon(rec)}
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={
                              rec.isMatch
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                            }
                          >
                            {rec.isMatch ? "Matched" : "Excluded"}
                          </Badge>
                          <div className="text-xs text-muted-foreground">Score {rec.score}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Badge variant="outline" className={getSourceClasses(rec.coverageSource)}>
                          {getSourceLabel(rec.coverageSource)}
                        </Badge>
                        <div className="max-w-[220px] text-xs text-muted-foreground">
                          {rec.coverageStates.length ? rec.coverageStates.join(", ") : "No states listed"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getSolClasses(rec)}>
                        {rec.sol.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {accountType === "internal_lawyer" ? (
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">{rec.openOrders.length} matching</div>
                          <div className="text-xs text-muted-foreground">{remaining} remaining</div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5 text-xs">
                        {rec.reasons.map((reason) => (
                          <div key={reason} className="text-muted-foreground">
                            {reason}
                          </div>
                        ))}
                        {rec.warnings.map((warning) => (
                          <div key={warning} className="flex items-start gap-1.5 text-amber-700">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No attorneys in this view.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

const AttorneyRecommendationsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRunRef = useRef(false);

  const [submissionId, setSubmissionId] = useState(searchParams.get("submissionId") ?? "");
  const [leadId, setLeadId] = useState(searchParams.get("leadId") ?? "");
  const [state, setState] = useState(searchParams.get("state") ?? "");
  const [accidentDate, setAccidentDate] = useState(searchParams.get("accidentDate") ?? "");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>(
    (searchParams.get("accountType") as AccountFilter | null) ?? "all"
  );
  const [showExcluded, setShowExcluded] = useState(searchParams.get("showExcluded") === "1");
  const [loading, setLoading] = useState(false);
  const [loadingLead, setLoadingLead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttorneyRecommendationResult | null>(null);

  const updateUrl = (next: {
    submissionId?: string;
    leadId?: string;
    state?: string;
    accidentDate?: string;
    accountType?: AccountFilter;
    showExcluded?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (next.submissionId?.trim()) params.set("submissionId", next.submissionId.trim());
    if (next.leadId?.trim()) params.set("leadId", next.leadId.trim());
    if (next.state?.trim()) params.set("state", next.state.trim());
    if (next.accidentDate?.trim()) params.set("accidentDate", next.accidentDate.trim());
    if (next.accountType && next.accountType !== "all") params.set("accountType", next.accountType);
    if (next.showExcluded) params.set("showExcluded", "1");
    setSearchParams(params, { replace: true });
  };

  const hydrateLead = async () => {
    setLoadingLead(true);
    setError(null);
    try {
      const lead = await loadLeadForAttorneyRecommendations({ leadId, submissionId });
      if (!lead) {
        setError("Lead not found.");
        return null;
      }

      setLeadId(lead.id ?? "");
      setSubmissionId(lead.submission_id ?? "");
      setState(lead.state ?? "");
      setAccidentDate(lead.accident_date ?? "");
      return lead;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoadingLead(false);
    }
  };

  const runRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getAttorneyRecommendations({
        leadId: leadId.trim() || null,
        submissionId: submissionId.trim() || null,
        state: state.trim() || null,
        accidentDate: accidentDate.trim() || null,
      });

      setResult(next);
      setLeadId(next.lead.id ?? leadId);
      setSubmissionId(next.lead.submission_id ?? submissionId);
      setState(next.leadState || next.lead.state || state);
      setAccidentDate(next.accidentDate ?? "");
      updateUrl({
        submissionId: next.lead.submission_id ?? submissionId,
        leadId: next.lead.id ?? leadId,
        state: next.leadState || state,
        accidentDate: next.accidentDate ?? accidentDate,
        accountType: accountFilter,
        showExcluded,
      });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialRunRef.current) return;
    initialRunRef.current = true;

    if (submissionId || leadId || state) {
      void runRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleBrokerRows = useMemo(() => {
    if (!result || accountFilter === "internal_lawyer") return [];
    return result.broker.filter((row) => showExcluded || row.isMatch);
  }, [accountFilter, result, showExcluded]);

  const visibleInternalRows = useMemo(() => {
    if (!result || accountFilter === "broker_lawyer") return [];
    return result.internal.filter((row) => showExcluded || row.isMatch);
  }, [accountFilter, result, showExcluded]);

  const totals = useMemo(() => {
    const brokerMatched = result?.broker.filter((row) => row.isMatch).length ?? 0;
    const internalMatched = result?.internal.filter((row) => row.isMatch).length ?? 0;

    return {
      brokerMatched,
      internalMatched,
      totalMatched: brokerMatched + internalMatched,
      totalChecked: (result?.broker.length ?? 0) + (result?.internal.length ?? 0),
    };
  }, [result]);

  const canRun = Boolean(state.trim() || submissionId.trim() || leadId.trim());

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attorney Recommendation Check</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {result?.lead.customer_full_name ? result.lead.customer_full_name : "Route-only diagnostic"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{totals.totalMatched} matched</Badge>
          <Badge variant="outline">{totals.totalChecked} checked</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 lg:grid-cols-[1fr_1fr_11rem_11rem_auto]">
          <div className="space-y-2">
            <Label htmlFor="submission-id">Submission ID</Label>
            <Input
              id="submission-id"
              value={submissionId}
              onChange={(event) => setSubmissionId(event.target.value)}
              placeholder="1776893436617904520"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-id">Lead ID</Label>
            <Input
              id="lead-id"
              value={leadId}
              onChange={(event) => setLeadId(event.target.value)}
              placeholder="UUID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-state">State</Label>
            <Input
              id="lead-state"
              value={state}
              onChange={(event) => setState(event.target.value)}
              placeholder="IL"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accident-date">Accident Date</Label>
            <Input
              id="accident-date"
              type="date"
              value={accidentDate}
              onChange={(event) => setAccidentDate(event.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void hydrateLead()}
              disabled={loadingLead || (!submissionId.trim() && !leadId.trim())}
              className="gap-2"
            >
              {loadingLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Load
            </Button>
            <Button
              type="button"
              onClick={() => void runRecommendations()}
              disabled={loading || !canRun}
              className="gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Run
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-44">
            <Select
              value={accountFilter}
              onValueChange={(value) => {
                const next = value as AccountFilter;
                setAccountFilter(next);
                updateUrl({ submissionId, leadId, state, accidentDate, accountType: next, showExcluded });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={showExcluded}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setShowExcluded(next);
                updateUrl({ submissionId, leadId, state, accidentDate, accountType: accountFilter, showExcluded: next });
              }}
            />
            Show excluded
          </label>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Internal {totals.internalMatched}
          </Badge>
          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
            Broker {totals.brokerMatched}
          </Badge>
          {result?.leadState ? <Badge variant="secondary">{result.leadState}</Badge> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!result && !loading ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            Enter a lead or state, then run recommendations.
          </CardContent>
        </Card>
      ) : null}

      {result && !result.leadState ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            State is required to evaluate attorney recommendations.
          </CardContent>
        </Card>
      ) : null}

      {result && result.leadState ? (
        <div className="space-y-5">
          {accountFilter !== "broker_lawyer" ? (
            <RecommendationTable
              title={getAccountLabel("internal_lawyer")}
              accountType="internal_lawyer"
              rows={visibleInternalRows}
            />
          ) : null}

          {accountFilter !== "internal_lawyer" ? (
            <RecommendationTable
              title={getAccountLabel("broker_lawyer")}
              accountType="broker_lawyer"
              rows={visibleBrokerRows}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default AttorneyRecommendationsPage;
