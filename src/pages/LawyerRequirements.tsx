import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { US_STATES } from "@/lib/us-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Save,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit,
  ExternalLink,
  Building2,
  BriefcaseBusiness,
  Users,
  Scale,
  Phone,
  Link,
  FileText,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LawyerRequirement {
  id: string;
  attorney_id: string | null;
  attorney_name: string;
  lawyer_type: string | null;
  doc_requirement: boolean;
  sol: string | null;
  states: string[];
  police_report: string;
  insurance_report: string;
  medical_report: string;
  driver_id: string;
  did_number: string | null;
  submission_link: string | null;
}

interface DocusignTemplateMapping {
  id: string;
  attorney_id: string | null;
  lawyer_requirement_id: string | null;
  state_code: string | null;
  template_id: string;
  template_name: string | null;
  template_type: string | null;
  is_default: boolean;
  priority: number;
  is_active: boolean;
}

type LawyerTypeFilter = "all" | "broker_lawyer" | "internal_lawyer";

const FILTER_META: Record<
  LawyerTypeFilter,
  {
    label: string;
    icon: typeof Building2;
    activeClasses: string;
    badgeClasses: string;
  }
> = {
  all: {
    label: "All Lawyers",
    icon: Users,
    activeClasses: "border-slate-300 bg-slate-900 text-white shadow-sm",
    badgeClasses: "bg-slate-100 text-slate-700",
  },
  broker_lawyer: {
    label: "Broker Lawyers",
    icon: BriefcaseBusiness,
    activeClasses: "border-sky-300 bg-sky-50 text-sky-900 shadow-sm",
    badgeClasses: "bg-sky-100 text-sky-700",
  },
  internal_lawyer: {
    label: "Internal Lawyers",
    icon: Scale,
    activeClasses: "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm",
    badgeClasses: "bg-emerald-100 text-emerald-700",
  },
};

const formatLawyerTypeLabel = (value: string | null | undefined) => {
  if (value === "internal_lawyer") return "Internal Lawyer";
  if (value === "broker_lawyer") return "Broker Lawyer";
  return "Not Set";
};

const getLawyerTypeClasses = (value: string | null | undefined) => {
  if (value === "internal_lawyer") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value === "broker_lawyer") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const formatRequirementLabel = (value: string | boolean | null | undefined) => {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (!value) return "Not Set";
  return String(value);
};

const getRequirementBadgeClasses = (value: string | boolean | null | undefined) => {
  const normalized = typeof value === "string" ? value.toLowerCase() : value;
  if (normalized === true || normalized === "yes") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === false || normalized === "no") {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
};

const getInitials = (name: string) => {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
};

const getAvatarColor = (_name: string, type: string | null) => {
  if (type === "internal_lawyer") return "bg-emerald-100 text-emerald-700";
  if (type === "broker_lawyer") return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-600";
};

export default function LawyerRequirements() {
  const [requirements, setRequirements] = useState<LawyerRequirement[]>([]);
  const [templateMappings, setTemplateMappings] = useState<DocusignTemplateMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<LawyerRequirement | null>(null);
  const [expandedAttorney, setExpandedAttorney] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<LawyerTypeFilter>("all");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [formData, setFormData] = useState({
    attorney_id: "",
    attorney_name: "",
    lawyer_type: "" as string,
    doc_requirement: false,
    sol: "" as string,
    states: [] as string[],
    police_report: "no",
    insurance_report: "no",
    medical_report: "no",
    driver_id: "no",
    did_number: "",
    submission_link: "",
  });

  useEffect(() => {
    loadRequirements();
  }, []);

  const loadRequirements = async () => {
    setLoading(true);
    const [{ data: requirementsData, error: requirementsError }, { data: mappingsData, error: mappingsError }] =
      await Promise.all([
        supabaseAny.from("lawyer_requirements").select("*").order("attorney_name"),
        supabaseAny
          .from("docusign_template_mappings")
          .select("*")
          .order("state_code", { ascending: true, nullsFirst: true })
          .order("priority", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (requirementsError) {
      console.error("Error loading requirements:", requirementsError);
      toast.error("Failed to load lawyer requirements");
    } else {
      setRequirements(requirementsData || []);
    }

    if (mappingsError) {
      console.error("Error loading DocuSign template mappings:", mappingsError);
      toast.error("Failed to load DocuSign templates");
      setTemplateMappings([]);
    } else {
      setTemplateMappings(mappingsData || []);
    }
    setLoading(false);
  };

  const openNewDialog = () => {
    setEditingRequirement(null);
    setFormData({
      attorney_id: "",
      attorney_name: "",
      lawyer_type: "",
      doc_requirement: false,
      sol: "",
      states: [],
      police_report: "no",
      insurance_report: "no",
      medical_report: "no",
      driver_id: "no",
      did_number: "",
      submission_link: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (req: LawyerRequirement) => {
    setEditingRequirement(req);
    setFormData({
      attorney_id: req.attorney_id || "",
      attorney_name: req.attorney_name,
      lawyer_type: req.lawyer_type || "",
      doc_requirement: req.doc_requirement || false,
      sol: req.sol || "",
      states: req.states || [],
      police_report: req.police_report || "no",
      insurance_report: req.insurance_report || "no",
      medical_report: req.medical_report || "no",
      driver_id: req.driver_id || "no",
      did_number: req.did_number || "",
      submission_link: req.submission_link || "",
    });
    setIsDialogOpen(true);
  };

  const handleStateToggle = (stateCode: string) => {
    setFormData((prev) => ({
      ...prev,
      states: prev.states.includes(stateCode)
        ? prev.states.filter((s) => s !== stateCode)
        : [...prev.states, stateCode],
    }));
  };

  const handleSave = async () => {
    if (!formData.attorney_name.trim()) {
      toast.error("Please enter attorney name");
      return;
    }
    if (!formData.lawyer_type) {
      toast.error("Please select lawyer type");
      return;
    }
    if (formData.states.length === 0) {
      toast.error("Please select at least one state");
      return;
    }

    const payload = {
      attorney_id: formData.attorney_id || null,
      attorney_name: formData.attorney_name,
      lawyer_type: formData.lawyer_type,
      doc_requirement: formData.doc_requirement,
      sol: formData.sol || null,
      states: formData.states,
      police_report: formData.police_report,
      insurance_report: formData.insurance_report,
      medical_report: formData.medical_report,
      driver_id: formData.driver_id,
      did_number: formData.did_number || null,
      submission_link: formData.submission_link || null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let error: any;
    if (editingRequirement) {
      const { error: updateError } = await supabaseAny
        .from("lawyer_requirements")
        .update(payload)
        .eq("id", editingRequirement.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabaseAny
        .from("lawyer_requirements")
        .insert(payload);
      error = insertError;
    }

    if (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save requirements");
    } else {
      toast.success(editingRequirement ? "Requirements updated" : "Requirements created");
      setIsDialogOpen(false);
      loadRequirements();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete these requirements?")) return;
    const { error } = await supabaseAny
      .from("lawyer_requirements")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete requirements");
    } else {
      toast.success("Requirements deleted");
      loadRequirements();
    }
  };

  // Group all requirements by attorney name
  const groupedRequirements = requirements.reduce((acc, req) => {
    const key = req.attorney_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(req);
    return acc;
  }, {} as Record<string, LawyerRequirement[]>);

  // Filter grouped entries by active filter
  const filteredEntries = Object.entries(groupedRequirements).filter(([, reqs]) => {
    if (activeFilter === "all") return true;
    return reqs[0]?.lawyer_type === activeFilter;
  });

  // Counts for filter tabs
  const brokerCount = Object.values(groupedRequirements).filter(
    (reqs) => reqs[0]?.lawyer_type === "broker_lawyer"
  ).length;
  const internalCount = Object.values(groupedRequirements).filter(
    (reqs) => reqs[0]?.lawyer_type === "internal_lawyer"
  ).length;
  const allCount = Object.keys(groupedRequirements).length;

  const counts: Record<LawyerTypeFilter, number> = {
    all: allCount,
    broker_lawyer: brokerCount,
    internal_lawyer: internalCount,
  };

  const getTemplateMappingsForRequirement = (req: LawyerRequirement) => {
    const byRequirement = templateMappings.filter(
      (mapping) => mapping.lawyer_requirement_id === req.id
    );

    if (byRequirement.length > 0) return byRequirement;

    if (!req.attorney_id) return [];

    return templateMappings.filter(
      (mapping) =>
        !mapping.lawyer_requirement_id &&
        mapping.attorney_id === req.attorney_id
    );
  };

  const getTemplateSummary = (reqs: LawyerRequirement[]) => {
    const mappings = reqs.flatMap((req) => getTemplateMappingsForRequirement(req));
    const uniqueTemplateIds = new Set(mappings.map((mapping) => mapping.template_id));
    return uniqueTemplateIds.size;
  };

  const groupTemplatesByState = (mappings: DocusignTemplateMapping[]) => {
    const grouped = new Map<string, DocusignTemplateMapping[]>();

    mappings.forEach((mapping) => {
      const stateKey = (mapping.state_code || "ALL").trim().toUpperCase() || "ALL";
      const existing = grouped.get(stateKey) || [];
      existing.push(mapping);
      grouped.set(stateKey, existing);
    });

    return Array.from(grouped.entries()).sort(([stateA], [stateB]) => {
      if (stateA === "ALL") return 1;
      if (stateB === "ALL") return -1;
      return stateA.localeCompare(stateB);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          <span className="text-sm">Loading lawyers criteria…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lawyers Criteria</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage lawyer criteria and routing requirements
          </p>
        </div>
        <Button onClick={openNewDialog} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Attorney
        </Button>
      </div>

      {/* ── Stats + Filter Tabs Row ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Summary pills */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">{allCount}</span>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <BriefcaseBusiness className="h-4 w-4 text-sky-600" />
            <span className="text-sm font-semibold text-sky-800">{brokerCount}</span>
            <span className="text-xs text-sky-600">Broker</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <Scale className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">{internalCount}</span>
            <span className="text-xs text-emerald-600">Internal</span>
          </div>
        </div>

        {/* Filter tabs — same pattern as Sales Map */}
        <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
          {(["all", "broker_lawyer", "internal_lawyer"] as LawyerTypeFilter[]).map((filter) => {
            const meta = FILTER_META[filter];
            const Icon = meta.icon;
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive ? meta.activeClasses : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {meta.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    isActive ? "bg-white/30 text-inherit" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {counts[filter]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Attorney Cards ── */}
      {filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Scale className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {activeFilter === "all"
                ? 'No lawyer requirements configured yet. Click "Add Attorney" to get started.'
                : `No ${FILTER_META[activeFilter].label.toLowerCase()} found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map(([attorneyName, reqs]) => {
            const isExpanded = expandedAttorney === attorneyName;
            const lawyerType = reqs[0]?.lawyer_type;
            const templateCount = getTemplateSummary(reqs);
            return (
              <Card
                key={attorneyName}
                className={`overflow-hidden transition-shadow ${
                  isExpanded ? "shadow-md" : "shadow-sm hover:shadow-md"
                }`}
              >
                {/* Card Header */}
                <CardHeader
                  className="cursor-pointer px-5 py-4"
                  onClick={() =>
                    setExpandedAttorney(isExpanded ? null : attorneyName)
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${getAvatarColor(
                          attorneyName,
                          lawyerType
                        )}`}
                      >
                        {getInitials(attorneyName)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-semibold leading-tight text-foreground">
                            {attorneyName}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getLawyerTypeClasses(lawyerType)}`}
                          >
                            {formatLawyerTypeLabel(lawyerType)}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="text-xs bg-slate-100 text-slate-600"
                          >
                            {reqs.length} config{reqs.length !== 1 ? "s" : ""}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="text-xs bg-amber-50 text-amber-700 border border-amber-200"
                          >
                            {templateCount} template{templateCount !== 1 ? "s" : ""}
                          </Badge>
                        </div>

                        {/* Quick-glance summary */}
                        <div className="mt-1 flex items-center gap-3 flex-wrap">
                          {reqs[0]?.states?.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {reqs[0].states.slice(0, 4).join(", ")}
                              {reqs[0].states.length > 4 && ` +${reqs[0].states.length - 4}`}
                            </span>
                          )}
                          {reqs[0]?.did_number && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {reqs[0].did_number}
                            </span>
                          )}
                          {reqs[0]?.sol && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <FileText className="h-3 w-3" />
                              SOL: {reqs[0].sol}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(reqs[0]);
                        }}
                      >
                        <Edit className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded Content */}
                {isExpanded && (
                  <CardContent className="border-t bg-slate-50/60 px-5 pb-5 pt-4">
                    <div className="space-y-4">
                      {reqs.map((req) => (
                        <div
                          key={req.id}
                          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                          {(() => {
                            const reqTemplateMappings = getTemplateMappingsForRequirement(req);
                            const templatesByState = groupTemplatesByState(reqTemplateMappings);

                            return (
                              <>
                          {/* Top badge row */}
                          <div className="flex flex-wrap items-center gap-2 mb-4">
                            <Badge className={getLawyerTypeClasses(req.lawyer_type)}>
                              {formatLawyerTypeLabel(req.lawyer_type)}
                            </Badge>
                            <Badge className={getRequirementBadgeClasses(req.doc_requirement)}>
                              <ShieldCheck className="mr-1 h-3 w-3" />
                              Doc Req: {formatRequirementLabel(req.doc_requirement)}
                            </Badge>
                            <Badge variant="outline" className="bg-white text-slate-600">
                              <FileText className="mr-1 h-3 w-3" />
                              SOL: {req.sol || "Not Set"}
                            </Badge>
                            <Badge variant="outline" className="bg-white text-slate-600">
                              <FileText className="mr-1 h-3 w-3" />
                              {reqTemplateMappings.length} DocuSign template{reqTemplateMappings.length !== 1 ? "s" : ""}
                            </Badge>
                          </div>

                          {/* Primary detail grid */}
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {/* Coverage States */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <div className="flex items-center gap-1.5 mb-3">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                  Coverage States
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {(req.states || []).length > 0 ? (
                                  req.states.map((state) => (
                                    <Badge
                                      key={state}
                                      variant="outline"
                                      className="bg-white text-xs font-medium"
                                    >
                                      {state}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    No states selected
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Reports & Driver ID */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <div className="flex items-center gap-1.5 mb-3">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                  Reports & Driver ID
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { label: "Police", value: req.police_report },
                                  { label: "Insurance", value: req.insurance_report },
                                  { label: "Medical", value: req.medical_report },
                                  { label: "Driver ID", value: req.driver_id },
                                ].map(({ label, value }) => (
                                  <div key={label} className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                                      {label}
                                    </span>
                                    <Badge
                                      className={`w-fit text-xs ${getRequirementBadgeClasses(value)}`}
                                    >
                                      {formatRequirementLabel(value)}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Routing Details */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <div className="flex items-center gap-1.5 mb-3">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                  Routing Details
                                </span>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                                    DID Number
                                  </div>
                                  <div className="text-sm font-semibold text-foreground">
                                    {req.did_number || (
                                      <span className="font-normal text-muted-foreground">
                                        Not Set
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                                    Submission Link
                                  </div>
                                  {req.submission_link ? (
                                    <a
                                      href={req.submission_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                                    >
                                      <Link className="h-3 w-3" />
                                      Open Link
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">Not Set</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <div className="flex items-center gap-1.5 mb-3">
                                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                  Actions
                                </span>
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground leading-snug">
                                  Remove this configuration permanently.
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                                  onClick={() => handleDelete(req.id)}
                                >
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                  Delete Config
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="flex items-center gap-1.5 mb-3">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                DocuSign Templates
                              </span>
                            </div>

                            {templatesByState.length > 0 ? (
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {templatesByState.map(([stateCode, stateMappings]) => (
                                  <div
                                    key={stateCode}
                                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                                  >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <Badge
                                        variant="outline"
                                        className="border-amber-200 bg-amber-50 text-amber-700"
                                      >
                                        {stateCode === "ALL" ? "All States" : stateCode}
                                      </Badge>
                                      <span className="text-[11px] text-muted-foreground">
                                        {stateMappings.length} template{stateMappings.length !== 1 ? "s" : ""}
                                      </span>
                                    </div>

                                    <div className="space-y-2">
                                      {stateMappings.map((mapping) => (
                                        <div
                                          key={mapping.id}
                                          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="truncate text-sm font-medium text-slate-900">
                                                {mapping.template_name || mapping.template_id}
                                              </div>
                                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                {mapping.template_type && (
                                                  <Badge variant="secondary" className="text-[10px]">
                                                    {mapping.template_type}
                                                  </Badge>
                                                )}
                                                {!mapping.is_active && (
                                                  <Badge variant="outline" className="text-[10px]">
                                                    Inactive
                                                  </Badge>
                                                )}
                                                <span className="text-[10px] text-muted-foreground">
                                                  Priority {mapping.priority}
                                                </span>
                                              </div>
                                            </div>
                                            {mapping.is_default && (
                                              <Badge className="shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                Default
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-muted-foreground">
                                No DocuSign templates mapped to this lawyer configuration yet.
                              </div>
                            )}
                          </div>
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRequirement ? "Edit Lawyer Criteria" : "Add Lawyer Criteria"}
            </DialogTitle>
            <DialogDescription>Configure criteria and routing for a lawyer</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="attorney_name">Attorney Name</Label>
                <Input
                  id="attorney_name"
                  value={formData.attorney_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, attorney_name: e.target.value }))
                  }
                  placeholder="Enter attorney name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lawyer_type">Lawyer Type</Label>
                <Select
                  value={formData.lawyer_type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, lawyer_type: value }))
                  }
                >
                  <SelectTrigger id="lawyer_type">
                    <SelectValue placeholder="Select lawyer type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal_lawyer">Internal Lawyer</SelectItem>
                    <SelectItem value="broker_lawyer">Broker Lawyer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="did_number">DID Number</Label>
                <Input
                  id="did_number"
                  value={formData.did_number}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, did_number: e.target.value }))
                  }
                  placeholder="e.g., 555-123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label>Document Requirement</Label>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="doc_requirement"
                    checked={formData.doc_requirement}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, doc_requirement: checked === true }))
                    }
                  />
                  <Label htmlFor="doc_requirement" className="cursor-pointer">
                    Required
                  </Label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sol">SOL (Statute of Limitations)</Label>
                <Select
                  value={formData.sol}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, sol: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select SOL period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6month">6 Month</SelectItem>
                    <SelectItem value="12month">12 Month</SelectItem>
                    <SelectItem value="24month">24 Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>States (select multiple)</Label>
              <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {US_STATES.map((state) => (
                  <div key={state.code} className="flex items-center space-x-2">
                    <Checkbox
                      id={`state-${state.code}`}
                      checked={formData.states.includes(state.code)}
                      onCheckedChange={() => handleStateToggle(state.code)}
                    />
                    <Label htmlFor={`state-${state.code}`} className="text-sm cursor-pointer">
                      {state.code}
                    </Label>
                  </div>
                ))}
              </div>
              {formData.states.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Selected: {formData.states.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label>Report Requirements</Label>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Police Report", key: "police_report" as const },
                  { label: "Insurance Report", key: "insurance_report" as const },
                  { label: "Medical Report", key: "medical_report" as const },
                  { label: "Driver ID", key: "driver_id" as const },
                ].map(({ label, key }) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Select
                      value={formData[key]}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, [key]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="submission_link">Submission Link</Label>
              <Input
                id="submission_link"
                value={formData.submission_link}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, submission_link: e.target.value }))
                }
                placeholder="https://..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
