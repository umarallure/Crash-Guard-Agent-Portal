import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Pencil, Save, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAttorneys } from "@/hooks/useAttorneys";
import { fetchLicensedCloserOptions } from "@/lib/agentOptions";
import { OrderRecommendationsCard } from "@/components/OrderRecommendationsCard";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DailyDealFlowRecord = {
  id: string;
  submission_id: string;
  client_phone_number: string | null;
  lead_vendor: string | null;
  date: string | null;
  insured_name: string | null;
  state: string | null;
  zip_code?: string | null;
  buffer_agent: string | null;
  agent: string | null;
  licensed_agent_account: string | null;
  status: string | null;
  call_result: string | null;
  carrier: string | null;
  product_type: string | null;
  draft_date: string | null;
  monthly_premium: number | null;
  face_amount: number | null;
  from_callback: boolean | null;
  notes: string | null;
  policy_number: string | null;
  carrier_audit: string | null;
  product_type_carrier: string | null;
  level_or_gi: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_callback: boolean | null;
  is_retention_call: boolean | null;
  placement_status: string | null;
  ghl_location_id: string | null;
  ghl_opportunity_id: string | null;
  ghlcontactid: string | null;
  sync_status: string | null;
  accident_date: string | null;
  accident_last_12_months: boolean | null;
  prior_attorney_involved: boolean | null;
  prior_attorney_details: string | null;
  medical_attention: string | null;
  police_attended: boolean | null;
  accident_location: string | null;
  accident_scenario: string | null;
  insured: boolean | null;
  is_injured: boolean | null;
  received_medical_treatment: boolean | null;
  currently_represented: boolean | null;
  injuries: string | null;
  vehicle_registration: string | null;
  insurance_company: string | null;
  third_party_vehicle_registration: string | null;
  other_party_admit_fault: boolean | null;
  passengers_count: number | null;
  contact_name: string | null;
  contact_number: string | null;
  contact_address: string | null;
  carrier_attempted_1: string | null;
  carrier_attempted_2: string | null;
  carrier_attempted_3: string | null;
  assigned_attorney_id: string | null;
};

type LeadNote = {
  id: string;
  lead_id: string;
  submission_id?: string | null;
  note: string;
  created_at: string;
  created_by?: string | null;
  author_name?: string | null;
  source?: string | null;
};

type LegacyNote = {
  source: string;
  note: string;
  timestamp?: string | null;
};

const formatDateIfPresent = (value: string | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "MMM dd, yyyy");
};

const DailyDealFlowLeadDetailsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [legacyNotes, setLegacyNotes] = useState<LegacyNote[]>([]);

  const [record, setRecord] = useState<DailyDealFlowRecord | null>(null);
  const [form, setForm] = useState<DailyDealFlowRecord | null>(null);
  const { attorneys, loading: attorneysLoading } = useAttorneys();
  const [closers, setClosers] = useState<Array<{ key: string; label: string }>>([]);
  const [closersLoading, setClosersLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      setClosersLoading(true);
      try {
        const options = await fetchLicensedCloserOptions();
        setClosers(options);
      } catch (e) {
        setClosers([]);
      } finally {
        setClosersLoading(false);
      }
    };

    run();
  }, []);

  const fetchLegacyNotes = async (lead: DailyDealFlowRecord) => {
    const entries: LegacyNote[] = [];

    const legacyNote = (lead.notes || '').trim();
    if (legacyNote) {
      entries.push({
        source: 'Daily Deal Flow',
        note: legacyNote,
        timestamp: lead.updated_at || lead.created_at || null,
      });
    }

    if (lead.submission_id) {
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('additional_notes, created_at, updated_at')
          .eq('submission_id', lead.submission_id)
          .maybeSingle();

        if (!error && data?.additional_notes) {
          const noteText = (data.additional_notes as string).trim();
          if (noteText) {
            entries.push({
              source: 'Leads',
              note: noteText,
              timestamp: data.updated_at || data.created_at || null,
            });
          }
        }
      } catch (e) {
        console.error('Failed to fetch legacy leads note', e);
      }
    }

    setLegacyNotes(entries);
  };

  useEffect(() => {
    const run = async () => {
      if (!id) {
        setLoading(false);
        toast({
          title: "Error",
          description: "Missing daily deal flow record ID",
          variant: "destructive",
        });
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("daily_deal_flow")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        toast({
          title: "Failed to load record",
          description: error.message,
          variant: "destructive",
        });
        setRecord(null);
        setForm(null);
        setLoading(false);
        return;
      }

      if (!data) {
        toast({
          title: "Not found",
          description: "No record found for this ID",
          variant: "destructive",
        });
        setRecord(null);
        setForm(null);
        setLoading(false);
        return;
      }

      const typed = data as unknown as DailyDealFlowRecord;
      setRecord(typed);
      setForm(typed);
      setIsEditing(false);
      setLoading(false);

      // Fetch notes after record is known
      fetchNotes(typed.id);
      fetchLegacyNotes(typed);
    };

    run();
  }, [id, toast]);

  const fetchNotes = async (leadId: string) => {
    setNotesLoading(true);
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('id, lead_id, submission_id, note, created_at, created_by, author_name, source')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch lead notes', error);
        setNotes([]);
        return;
      }

      setNotes((data as LeadNote[]) || []);
    } catch (e) {
      console.error('Unexpected error fetching lead notes', e);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  const headerTitle = useMemo(() => {
    if (!record) return "Lead Details";
    const name = record.insured_name?.trim() || "Lead";
    return `Lead Details - ${name}`;
  }, [record]);

  const setString = (key: keyof DailyDealFlowRecord, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: value.trim().length ? value : null,
      } as DailyDealFlowRecord;
    });
  };

  const setNumber = (key: keyof DailyDealFlowRecord, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const trimmed = value.trim();
      if (!trimmed.length) {
        return { ...prev, [key]: null } as DailyDealFlowRecord;
      }
      const parsed = Number(trimmed);
      return { ...prev, [key]: Number.isFinite(parsed) ? parsed : null } as DailyDealFlowRecord;
    });
  };

  const setBool = (key: keyof DailyDealFlowRecord, value: boolean) => {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value } as DailyDealFlowRecord;
    });
  };

  const setAssignedAttorneyId = (value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assigned_attorney_id: value === "__NONE__" ? null : value,
      };
    });
  };

  const handleCancel = () => {
    setForm(record);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!form || !record) return;

    setSaving(true);
    try {
      const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...updatePayload } = form;

      const { data, error } = await supabase
        .from("daily_deal_flow")
        .update(updatePayload)
        .eq("id", record.id)
        .select("*")
        .single();

      if (error) {
        toast({
          title: "Failed to save changes",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      const typed = data as unknown as DailyDealFlowRecord;
      setRecord(typed);
      setForm(typed);
      setIsEditing(false);
      toast({
        title: "Saved",
        description: "Changes have been saved successfully",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: "An unexpected error occurred while saving",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !isEditing || saving;

  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      {children}
    </div>
  );

  const inputCls = "h-9";

  return (
    <div className="space-y-4 px-4 md:px-6 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">{headerTitle}</div>
            {record?.submission_id && (
              <div className="text-sm text-muted-foreground truncate">
                Submission ID: {record.submission_id}
              </div>
            )}
          </div>
        </div>

        {record && form && (
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save changes
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : !record || !form ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This record could not be loaded.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="notes" className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="justify-start">
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="agents">Closers</TabsTrigger>
              <TabsTrigger value="accident">Accident</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Date">
                    <Input
                      type="date"
                      className={inputCls}
                      value={form.date ?? ""}
                      onChange={(e) => setString("date", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Customer Name">
                    <Input
                      className={inputCls}
                      value={form.insured_name ?? ""}
                      onChange={(e) => setString("insured_name", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Client Phone Number">
                    <Input
                      className={inputCls}
                      value={form.client_phone_number ?? ""}
                      onChange={(e) => setString("client_phone_number", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Lead Vendor">
                    <Input
                      className={inputCls}
                      value={form.lead_vendor ?? ""}
                      onChange={(e) => setString("lead_vendor", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Status">
                    <Input
                      className={inputCls}
                      value={form.status ?? ""}
                      onChange={(e) => setString("status", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Call Result">
                    <Input
                      className={inputCls}
                      value={form.call_result ?? ""}
                      onChange={(e) => setString("call_result", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="From Callback">
                    <div className="flex items-center gap-2 h-9">
                      <Switch
                        checked={Boolean(form.from_callback)}
                        onCheckedChange={(v) => setBool("from_callback", v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{form.from_callback ? "Yes" : "No"}</span>
                    </div>
                  </Field>
                  <Field label="Callback">
                    <div className="flex items-center gap-2 h-9">
                      <Switch
                        checked={Boolean(form.is_callback)}
                        onCheckedChange={(v) => setBool("is_callback", v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{form.is_callback ? "Yes" : "No"}</span>
                    </div>
                  </Field>
                  <Field label="Retention Call">
                    <div className="flex items-center gap-2 h-9">
                      <Switch
                        checked={Boolean(form.is_retention_call)}
                        onCheckedChange={(v) => setBool("is_retention_call", v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{form.is_retention_call ? "Yes" : "No"}</span>
                    </div>
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="Notes">
                    <Textarea
                      value={form.notes ?? ""}
                      onChange={(e) => setString("notes", e.target.value)}
                      disabled={disabled}
                      className="min-h-[120px]"
                    />
                  </Field>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Created At">
                    <Input
                      className={inputCls}
                      value={formatDateIfPresent(record.created_at)}
                      disabled
                    />
                  </Field>
                  <Field label="Updated At">
                    <Input
                      className={inputCls}
                      value={formatDateIfPresent(record.updated_at)}
                      disabled
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Closer">
                    <Select
                      value={form.agent || "__NONE__"}
                      onValueChange={(value) => setString("agent", value === "__NONE__" ? "" : value)}
                      disabled={disabled}
                    >
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder={closersLoading ? "Loading closers…" : "Select closer"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">Unassigned</SelectItem>
                        {closers.map((c) => (
                          <SelectItem key={c.key} value={c.label}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Assigned Attorney">
                    <Select
                      value={form.assigned_attorney_id || "__NONE__"}
                      onValueChange={setAssignedAttorneyId}
                      disabled={disabled}
                    >
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder={attorneysLoading ? "Loading attorneys…" : "Select attorney"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">Unassigned</SelectItem>
                        {attorneys.map((attorney) => {
                          const label =
                            attorney.full_name?.trim() ||
                            attorney.primary_email?.trim() ||
                            attorney.user_id;
                          return (
                            <SelectItem key={attorney.user_id} value={attorney.user_id}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {record?.submission_id ? (
                  <div className="mt-6">
                    <OrderRecommendationsCard
                      submissionId={record.submission_id}
                      leadId={null}
                      leadOverrides={{
                        state: record.state ?? null,
                        insured: record.insured ?? null,
                        prior_attorney_involved: record.prior_attorney_involved ?? null,
                        currently_represented: record.currently_represented ?? null,
                        is_injured: record.is_injured ?? null,
                        received_medical_treatment: record.received_medical_treatment ?? null,
                        accident_last_12_months: record.accident_last_12_months ?? null,
                      }}
                      currentAssignedAttorneyId={form?.assigned_attorney_id ?? null}
                      onAssigned={({ lawyerId }) => {
                        setAssignedAttorneyId(lawyerId)
                      }}
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accident">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Accident Date">
                    <Input
                      type="date"
                      className={inputCls}
                      value={form.accident_date ?? ""}
                      onChange={(e) => setString("accident_date", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Accident Location">
                    <Input
                      className={inputCls}
                      value={form.accident_location ?? ""}
                      onChange={(e) => setString("accident_location", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Police Attended">
                    <div className="flex items-center gap-2 h-9">
                      <Switch
                        checked={Boolean(form.police_attended)}
                        onCheckedChange={(v) => setBool("police_attended", v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{form.police_attended ? "Yes" : "No"}</span>
                    </div>
                  </Field>
                  <Field label="Insured">
                    <div className="flex items-center gap-2 h-9">
                      <Switch
                        checked={Boolean(form.insured)}
                        onCheckedChange={(v) => setBool("insured", v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{form.insured ? "Yes" : "No"}</span>
                    </div>
                  </Field>
                  <Field label="Passengers Count">
                    <Input
                      type="number"
                      className={inputCls}
                      value={form.passengers_count ?? ""}
                      onChange={(e) => setNumber("passengers_count", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Other Party Admit Fault">
                    <div className="flex items-center gap-2 h-9">
                      <Switch
                        checked={Boolean(form.other_party_admit_fault)}
                        onCheckedChange={(v) => setBool("other_party_admit_fault", v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{form.other_party_admit_fault ? "Yes" : "No"}</span>
                    </div>
                  </Field>
                  <Field label="Vehicle Registration">
                    <Input
                      className={inputCls}
                      value={form.vehicle_registration ?? ""}
                      onChange={(e) => setString("vehicle_registration", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Insurance Company">
                    <Input
                      className={inputCls}
                      value={form.insurance_company ?? ""}
                      onChange={(e) => setString("insurance_company", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Third Party Vehicle Registration">
                    <Input
                      className={inputCls}
                      value={form.third_party_vehicle_registration ?? ""}
                      onChange={(e) => setString("third_party_vehicle_registration", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Prior Attorney Involved">
                    <div className="flex items-center gap-2 h-9">
                      <Switch
                        checked={Boolean(form.prior_attorney_involved)}
                        onCheckedChange={(v) => setBool("prior_attorney_involved", v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{form.prior_attorney_involved ? "Yes" : "No"}</span>
                    </div>
                  </Field>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Accident Scenario">
                    <Textarea
                      value={form.accident_scenario ?? ""}
                      onChange={(e) => setString("accident_scenario", e.target.value)}
                      disabled={disabled}
                      className="min-h-[120px]"
                    />
                  </Field>
                  <Field label="Injuries">
                    <Textarea
                      value={form.injuries ?? ""}
                      onChange={(e) => setString("injuries", e.target.value)}
                      disabled={disabled}
                      className="min-h-[120px]"
                    />
                  </Field>
                  <Field label="Medical Attention">
                    <Textarea
                      value={form.medical_attention ?? ""}
                      onChange={(e) => setString("medical_attention", e.target.value)}
                      disabled={disabled}
                      className="min-h-[120px]"
                    />
                  </Field>
                  <Field label="Prior Attorney Details">
                    <Textarea
                      value={form.prior_attorney_details ?? ""}
                      onChange={(e) => setString("prior_attorney_details", e.target.value)}
                      disabled={disabled}
                      className="min-h-[120px]"
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Contact</div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Contact Name">
                      <Input
                        className={inputCls}
                        value={form.contact_name ?? ""}
                        onChange={(e) => setString("contact_name", e.target.value)}
                        disabled={disabled}
                      />
                    </Field>
                    <Field label="Contact Number">
                      <Input
                        className={inputCls}
                        value={form.contact_number ?? ""}
                        onChange={(e) => setString("contact_number", e.target.value)}
                        disabled={disabled}
                      />
                    </Field>
                    <Field label="Contact Address">
                      <Input
                        className={inputCls}
                        value={form.contact_address ?? ""}
                        onChange={(e) => setString("contact_address", e.target.value)}
                        disabled={disabled}
                      />
                    </Field>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="GHL Location ID">
                    <Input
                      className={inputCls}
                      value={form.ghl_location_id ?? ""}
                      onChange={(e) => setString("ghl_location_id", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="GHL Opportunity ID">
                    <Input
                      className={inputCls}
                      value={form.ghl_opportunity_id ?? ""}
                      onChange={(e) => setString("ghl_opportunity_id", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="GHL Contact ID">
                    <Input
                      className={inputCls}
                      value={form.ghlcontactid ?? ""}
                      onChange={(e) => setString("ghlcontactid", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Sync Status">
                    <Input
                      className={inputCls}
                      value={form.sync_status ?? ""}
                      onChange={(e) => setString("sync_status", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Carrier Attempted 1">
                    <Input
                      className={inputCls}
                      value={form.carrier_attempted_1 ?? ""}
                      onChange={(e) => setString("carrier_attempted_1", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Carrier Attempted 2">
                    <Input
                      className={inputCls}
                      value={form.carrier_attempted_2 ?? ""}
                      onChange={(e) => setString("carrier_attempted_2", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Carrier Attempted 3">
                    <Input
                      className={inputCls}
                      value={form.carrier_attempted_3 ?? ""}
                      onChange={(e) => setString("carrier_attempted_3", e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <Card>
              <CardContent className="pt-6">
                {notesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading notes...
                  </div>
                ) : notes.length === 0 && legacyNotes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No notes found for this lead.</div>
                ) : (
                  <div className="space-y-4">
                    {notes.map((n) => {
                      const author = (n.author_name || '').trim() || (n.created_by || 'Unknown');
                      const source = (n.source || '').trim() || 'Unknown source';
                      const dateText = n.created_at ? format(new Date(n.created_at), 'PPpp') : '';
                      return (
                        <div key={n.id} className="rounded-md border p-3">
                          <div className="text-sm text-muted-foreground mb-1">
                            <span className="font-medium text-foreground">{author}</span>
                            <span className="mx-1">•</span>
                            <span>{source}</span>
                            {dateText && (
                              <>
                                <span className="mx-1">•</span>
                                <span>{dateText}</span>
                              </>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap text-sm text-foreground">{n.note}</div>
                        </div>
                      );
                    })}

                    {legacyNotes.map((ln, idx) => {
                      const dateText = ln.timestamp ? format(new Date(ln.timestamp), 'PPpp') : '';
                      return (
                        <div key={`legacy-${idx}`} className="rounded-md border p-3">
                          <div className="text-sm text-muted-foreground mb-1">
                            <span className="font-medium text-foreground">{ln.source}</span>
                            {dateText && (
                              <>
                                <span className="mx-1">•</span>
                                <span>{dateText}</span>
                              </>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap text-sm text-foreground">{ln.note}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default DailyDealFlowLeadDetailsPage;
