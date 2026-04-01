import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { US_STATES } from "@/lib/us-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Plus, Trash2, ChevronDown, ChevronUp, Edit, ExternalLink } from "lucide-react";
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
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
};

export default function LawyerRequirements() {
  const [requirements, setRequirements] = useState<LawyerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<LawyerRequirement | null>(null);
  const [expandedAttorney, setExpandedAttorney] = useState<string | null>(null);

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
    const { data, error } = await supabaseAny
      .from("lawyer_requirements")
      .select("*")
      .order("attorney_name");

    if (error) {
      console.error("Error loading requirements:", error);
      toast.error("Failed to load lawyer requirements");
    } else {
      setRequirements(data || []);
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

    let error;

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

  const groupedRequirements = requirements.reduce((acc, req) => {
    const key = req.attorney_name;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(req);
    return acc;
  }, {} as Record<string, LawyerRequirement[]>);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Lawyers Criteria</h1>
          <p className="text-muted-foreground">
            Manage lawyer criteria and requirements
          </p>
        </div>
        <Button onClick={openNewDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Attorney
        </Button>
      </div>

      {requirements.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No lawyer requirements configured yet. Click "Add Attorney" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedRequirements).map(([attorneyName, reqs]) => (
            <Card key={attorneyName}>
              <CardHeader
                className="cursor-pointer flex flex-row items-center justify-between"
                onClick={() =>
                  setExpandedAttorney(expandedAttorney === attorneyName ? null : attorneyName)
                }
              >
                <div className="flex items-center gap-3">
                  {expandedAttorney === attorneyName ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                  <CardTitle className="text-lg">{attorneyName}</CardTitle>
                  <Badge variant="outline">
                    {formatLawyerTypeLabel(reqs[0]?.lawyer_type)}
                  </Badge>
                  <Badge variant="secondary">{reqs.length} configuration(s)</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(reqs[0]);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </CardHeader>
              {expandedAttorney === attorneyName && (
                <CardContent>
                  <div className="space-y-4">
                    {reqs.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={getLawyerTypeClasses(req.lawyer_type)}>
                            {formatLawyerTypeLabel(req.lawyer_type)}
                          </Badge>
                          <Badge className={getRequirementBadgeClasses(req.doc_requirement)}>
                            Doc Requirement: {formatRequirementLabel(req.doc_requirement)}
                          </Badge>
                          <Badge variant="outline" className="bg-white">
                            SOL: {req.sol || "Not Set"}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Coverage States
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(req.states || []).length > 0 ? (
                                (req.states || []).map((state) => (
                                  <Badge key={state} variant="outline" className="bg-white">
                                    {state}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No states selected</span>
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl border bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Reports & Driver ID
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge className={getRequirementBadgeClasses(req.police_report)}>
                                Police: {formatRequirementLabel(req.police_report)}
                              </Badge>
                              <Badge className={getRequirementBadgeClasses(req.insurance_report)}>
                                Insurance: {formatRequirementLabel(req.insurance_report)}
                              </Badge>
                              <Badge className={getRequirementBadgeClasses(req.medical_report)}>
                                Medical: {formatRequirementLabel(req.medical_report)}
                              </Badge>
                              <Badge className={getRequirementBadgeClasses(req.driver_id)}>
                                Driver ID: {formatRequirementLabel(req.driver_id)}
                              </Badge>
                            </div>
                          </div>

                          <div className="rounded-xl border bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Routing Details
                            </div>
                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="text-xs text-muted-foreground">DID Number</div>
                                <div className="text-sm font-medium text-foreground">
                                  {req.did_number || "Not Set"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Submission Link</div>
                                {req.submission_link ? (
                                  <a
                                    href={req.submission_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                                  >
                                    Open Link
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <div className="text-sm text-muted-foreground">Not Set</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Actions
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <div className="text-sm text-muted-foreground">
                                Remove this configuration
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                onClick={() => handleDelete(req.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRequirement ? "Edit Lawyer Criteria" : "Add Lawyer Criteria"}
            </DialogTitle>
            <DialogDescription>
              Configure criteria for a lawyer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="attorney_name">Attorney Name</Label>
                <Input
                  id="attorney_name"
                  value={formData.attorney_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, attorney_name: e.target.value }))}
                  placeholder="Enter attorney name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lawyer_type">Lawyer Type</Label>
                <Select
                  value={formData.lawyer_type}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, lawyer_type: value }))}
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, did_number: e.target.value }))}
                  placeholder="e.g., 555-123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label>Document Requirement</Label>
                <div className="flex items-center space-x-2">
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
                    <Label
                      htmlFor={`state-${state.code}`}
                      className="text-sm cursor-pointer"
                    >
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
                <div className="space-y-2">
                  <Label>Police Report</Label>
                  <Select
                    value={formData.police_report}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, police_report: value }))}
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
                <div className="space-y-2">
                  <Label>Insurance Report</Label>
                  <Select
                    value={formData.insurance_report}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, insurance_report: value }))}
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
                <div className="space-y-2">
                  <Label>Medical Report</Label>
                  <Select
                    value={formData.medical_report}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, medical_report: value }))}
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
                <div className="space-y-2">
                  <Label>Driver ID</Label>
                  <Select
                    value={formData.driver_id}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, driver_id: value }))}
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
