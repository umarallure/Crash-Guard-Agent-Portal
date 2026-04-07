import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeadDocumentsTab } from "@/components/LeadDocumentsTab";
import { useToast } from "@/hooks/use-toast";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

type DailyDealFlowNote = {
  id: string;
  note: string;
  created_at: string;
  author_name?: string | null;
  source?: string | null;
  status?: string | null;
  call_result?: string | null;
};

type CallUpdate = {
  [key: string]: unknown;
};

const EMPTY_VALUE_LABEL = "N/A";

const displayValue = (value: unknown) => {
  if (value === null || value === undefined) return EMPTY_VALUE_LABEL;
  if (typeof value === "string" && value.trim().length === 0) return EMPTY_VALUE_LABEL;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const formatColumnLabel = (key: string) => {
  const labels: Record<string, string> = {
    insured_name: 'Insured Name',
    client_phone_number: 'Phone Number',
    lead_vendor: 'Lead Vendor',
    state: 'State',
    status: 'Status',
    call_result: 'Call Result',
    agent: 'Agent',
    notes: 'Notes',
    accident_date: 'Accident Date',
  };

  if (labels[key]) return labels[key];

  return key
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'dob') return 'DOB';
      if (lower === 'ssn') return 'SSN';
      if (lower === 'zip') return 'ZIP';
      if (lower === 'usa') return 'USA';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

const formatDateIfPresent = (value: string | null | undefined) => {
  if (!value) return EMPTY_VALUE_LABEL;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "MMM dd, yyyy");
};

const maskSsn = (ssn: string | null | undefined) => {
  if (!ssn) return EMPTY_VALUE_LABEL;
  const cleaned = ssn.replace(/\D/g, "");
  if (cleaned.length < 4) return ssn;
  return `***-**-${cleaned.slice(-4)}`;
};

const FieldGrid = ({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="text-sm text-muted-foreground">{item.label}</div>
          <div className="text-sm font-medium break-words">{item.value}</div>
        </div>
      ))}
    </div>
  );
};

const LeadDetailsPage = () => {
  const navigate = useNavigate();
  const { leadId } = useParams();
  const { toast } = useToast();

  const [lead, setLead] = useState<LeadRow | null>(null);
  const [dailyDealFlowId, setDailyDealFlowId] = useState<string | null>(null);
  const [dailyDealFlowStatus, setDailyDealFlowStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState<DailyDealFlowNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [callUpdatesLoading, setCallUpdatesLoading] = useState(false);
  const [callUpdates, setCallUpdates] = useState<CallUpdate[]>([]);
  const routeLeadId = (leadId ?? "").trim();

  const fetchCallUpdates = async (targetSubmissionId: string | null | undefined) => {
    if (!targetSubmissionId) {
      setCallUpdates([]);
      return;
    }

    setCallUpdatesLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_deal_flow')
        .select('*')
        .eq('submission_id', targetSubmissionId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        setCallUpdates([]);
        return;
      }

      setCallUpdates((data as unknown as CallUpdate[]) || []);
    } catch {
      setCallUpdates([]);
    } finally {
      setCallUpdatesLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!routeLeadId) {
        setLoading(false);
        toast({
          title: "Error",
          description: "Missing lead ID in route",
          variant: "destructive",
        });
        return;
      }

      setLoading(true);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(routeLeadId);

      // New links use the lead record id. Keep a submission_id fallback so older
      // links still open without throwing a UUID parsing error.
      let data: LeadRow | null = null;
      let error: { message: string } | null = null;

      if (isUuid) {
        const response = await supabase
          .from("leads")
          .select("*")
          .eq("id", routeLeadId)
          .maybeSingle();

        data = (response.data as LeadRow | null) ?? null;
        error = response.error ? { message: response.error.message } : null;
      }

      if (!data && !error) {
        const response = await supabase
          .from("leads")
          .select("*")
          .eq("submission_id", routeLeadId)
          .maybeSingle();

        data = (response.data as LeadRow | null) ?? null;
        error = response.error ? { message: response.error.message } : null;
      }

      if (error) {
        toast({
          title: "Failed to load lead",
          description: error.message,
          variant: "destructive",
        });
        setLead(null);
        setLoading(false);
        return;
      }

      if (!data) {
        toast({
          title: "Lead not found",
          description: `No lead found for ID ${routeLeadId}`,
          variant: "destructive",
        });
        setLead(null);
        setLoading(false);
        return;
      }

      setLead(data);
      setLoading(false);

      try {
        const { data: ddfRow, error: ddfErr } = await supabase
          .from("daily_deal_flow")
          .select("id,status")
          .eq("submission_id", data.submission_id)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!ddfErr) {
          const typed = ddfRow as unknown as { id?: string; status?: string | null } | null;
          const id = typed?.id ?? null;
          setDailyDealFlowId(id);
          setDailyDealFlowStatus(typed?.status ?? null);
        } else {
          setDailyDealFlowId(null);
          setDailyDealFlowStatus(null);
        }
      } catch (e) {
        setDailyDealFlowId(null);
        setDailyDealFlowStatus(null);
      }

      void fetchNotes(data.submission_id ?? null);
      void fetchCallUpdates(data.submission_id ?? null);
    };

    run();
  }, [routeLeadId, toast]);

  const handleSaveNote = async () => {
    const trimmedNote = newNote.trim();
    if (!trimmedNote || !lead) {
      toast({
        title: "Error",
        description: "Please enter a note",
        variant: "destructive",
      });
      return;
    }

    if (!dailyDealFlowId) {
      toast({
        title: "Error",
        description: "Unable to resolve Daily Deal Flow record for this submission.",
        variant: "destructive",
      });
      return;
    }

    setSavingNote(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const user = userData?.user;
      const emailPrefix = user?.email ? user.email.split('@')[0] : null;

      const supabaseUntyped = supabase as unknown as {
        from: (
          table: string
        ) => {
          select: (
            cols: string
          ) => {
            eq: (col: string, value: unknown) => {
              limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
            };
          };
        };
      };

      let displayName: string | null = null;
      if (user?.id) {
        try {
          const { data: profileData } = await supabaseUntyped
            .from('profiles')
            .select('display_name')
            .eq('user_id', user.id)
            .limit(1);

          const typedProfile = profileData as
            | Array<{ display_name?: unknown }>
            | { display_name?: unknown }
            | null
            | undefined;
          const raw = Array.isArray(typedProfile) ? typedProfile?.[0]?.display_name : typedProfile?.display_name;
          displayName = typeof raw === 'string' ? raw.trim() : null;
          if (displayName && displayName.length === 0) displayName = null;
        } catch (e) {
          console.warn('Failed to fetch profile display_name', e);
        }
      }

      const meta = user?.user_metadata as unknown as { full_name?: unknown } | null;
      const metaFullName = typeof meta?.full_name === 'string' ? meta.full_name : null;

      const authorName =
        displayName || metaFullName || emailPrefix || user?.id || null;

      const { data: existingRow, error: existingErr } = await supabase
        .from('daily_deal_flow')
        .select('notes')
        .eq('id', dailyDealFlowId)
        .maybeSingle();

      if (existingErr) throw existingErr;

      const timestamp = format(new Date(), "PPpp");
      const notePrefix = authorName ? `[${timestamp}] ${authorName}:` : `[${timestamp}]`;
      const existingNotes = ((existingRow as { notes?: string | null } | null)?.notes || '').trim();
      const nextNotes = existingNotes
        ? `${existingNotes}\n\n${notePrefix} ${trimmedNote}`
        : `${notePrefix} ${trimmedNote}`;

      const { error: updateErr } = await supabase
        .from('daily_deal_flow')
        .update({ notes: nextNotes })
        .eq('id', dailyDealFlowId);

      if (updateErr) throw updateErr;

      try {
        let dispositionLabel: string | null = null;
        const statusRaw = (dailyDealFlowStatus ?? "").trim();
        if (statusRaw) {
          try {
            const { data: stageRow, error: stageErr } = await supabase
              .from("portal_stages")
              .select("label")
              .eq("is_active", true)
              .or(`key.eq.${statusRaw},label.eq.${statusRaw}`)
              .limit(1)
              .maybeSingle();

            if (!stageErr) {
              const raw = (stageRow as unknown as { label?: unknown } | null)?.label;
              const lbl = typeof raw === "string" ? raw.trim() : "";
              dispositionLabel = lbl || null;
            }
          } catch {
            dispositionLabel = null;
          }
        }

        const dispositionToSend = dispositionLabel || (statusRaw || null);

        const { error: slackError } = await supabase.functions.invoke('disposition-change-slack-alert', {
          body: {
            leadId: dailyDealFlowId,
            submissionId: lead.submission_id ?? null,
            leadVendor: lead.lead_vendor ?? '',
            insuredName: lead.customer_full_name ?? null,
            clientPhoneNumber: lead.phone_number ?? null,
            previousDisposition: dispositionToSend,
            newDisposition: dispositionToSend,
            notes: trimmedNote,
            noteOnly: true,
          },
        });
        if (slackError) {
          console.warn('Slack alert invoke failed:', slackError);
        }
      } catch (e) {
        console.warn('Slack alert invoke threw:', e);
      }

      toast({
        title: "Success",
        description: "Note added successfully",
      });

      setNewNote("");
      setNoteDialogOpen(false);
      await Promise.all([
        fetchNotes(lead.submission_id ?? null),
        fetchCallUpdates(lead.submission_id ?? null),
      ]);
    } catch (error) {
      console.error("Error saving note:", error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive",
      });
    } finally {
      setSavingNote(false);
    }
  };

  const fetchNotes = async (submission_id: string | null) => {
    setNotesLoading(true);
    try {
      if (!submission_id) {
        setNotes([]);
        return;
      }

      const { data, error } = await supabase
        .from("daily_deal_flow")
        .select("id, notes, created_at, updated_at, status, call_result, agent, buffer_agent, licensed_agent_account")
        .eq("submission_id", submission_id)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch daily deal flow notes", error);
        setNotes([]);
        return;
      }

      const mappedNotes = ((data as Array<Record<string, unknown>> | null) || [])
        .filter((row) => typeof row.notes === "string" && row.notes.trim().length > 0)
        .map((row) => {
          const authorName =
            (typeof row.agent === "string" && row.agent.trim()) ||
            (typeof row.licensed_agent_account === "string" && row.licensed_agent_account.trim()) ||
            (typeof row.buffer_agent === "string" && row.buffer_agent.trim()) ||
            null;

          const sourceParts = [
            typeof row.status === "string" ? row.status.trim() : "",
            typeof row.call_result === "string" ? row.call_result.trim() : "",
          ].filter(Boolean);

          return {
            id: String(row.id || ""),
            note: String(row.notes || "").trim(),
            created_at: String(row.updated_at || row.created_at || ""),
            author_name: authorName,
            source: sourceParts.length > 0 ? sourceParts.join(" • ") : "Daily Deal Flow",
            status: typeof row.status === "string" ? row.status : null,
            call_result: typeof row.call_result === "string" ? row.call_result : null,
          } satisfies DailyDealFlowNote;
        });

      setNotes(mappedNotes);
    } catch (e) {
      console.error("Unexpected error fetching daily deal flow notes", e);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  const headerTitle = useMemo(() => {
    if (!lead) return "Lead Details";
    const name = lead.customer_full_name ? String(lead.customer_full_name) : "Lead";
    const vendor = lead.lead_vendor ? ` - ${lead.lead_vendor}` : "";
    return `${name}${vendor}`;
  }, [lead]);

  return (
    <div className="space-y-4 px-4 md:px-6 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">{headerTitle}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading lead…
        </div>
      ) : !lead ? (
        <Card>
          <CardHeader>
            <CardTitle>Lead not available</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This lead could not be loaded. Please go back and try again.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="accident">Accident</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="call-updates">Call Updates</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <FieldGrid
                  items={[
                    { label: "Customer Name", value: displayValue(lead.customer_full_name) },
                    { label: "Phone", value: displayValue(lead.phone_number) },
                    { label: "Email", value: displayValue(lead.email) },
                    { label: "State", value: displayValue(lead.state) },
                    {
                      label: "Address",
                      value:
                        lead.street_address || lead.city || lead.state || lead.zip_code
                          ? `${lead.street_address ?? ""}${lead.street_address ? ", " : ""}${
                              lead.city ?? ""
                            }${lead.city ? ", " : ""}${lead.state ?? ""}${
                              lead.zip_code ? ` ${lead.zip_code}` : ""
                            }`
                          : "—",
                    },
                    { label: "Submission Date", value: formatDateIfPresent(lead.submission_date) },
                    { label: "Lead Vendor", value: displayValue(lead.lead_vendor) },
                    { label: "Buffer Agent", value: displayValue(lead.buffer_agent) },
                    { label: "Agent", value: displayValue(lead.agent) },
                    { label: "Callback", value: displayValue(lead.is_callback) },
                    { label: "Retention Call", value: displayValue(lead.is_retention_call) },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="personal">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <FieldGrid
                  items={[
                    { label: "Date of Birth", value: formatDateIfPresent(lead.date_of_birth) },
                    { label: "Age", value: displayValue(lead.age) },
                    { label: "Birth State", value: displayValue(lead.birth_state) },
                    { label: "Driver License", value: displayValue(lead.driver_license) },
                    { label: "Social Security", value: maskSsn(lead.social_security) },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accident">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <FieldGrid
                  items={[
                    { label: "Accident Date", value: formatDateIfPresent(lead.accident_date) },
                    { label: "Accident Location", value: displayValue(lead.accident_location) },
                    { label: "Accident Scenario", value: displayValue(lead.accident_scenario) },
                    { label: "Police Attended", value: displayValue(lead.police_attended) },
                    { label: "Passengers Count", value: displayValue(lead.passengers_count) },
                    { label: "Injuries", value: displayValue(lead.injuries) },
                    { label: "Medical Attention", value: displayValue(lead.medical_attention) },
                    { label: "Prior Attorney Involved", value: displayValue(lead.prior_attorney_involved) },
                    { label: "Prior Attorney Details", value: displayValue(lead.prior_attorney_details) },
                    { label: "Contact Name", value: displayValue(lead.contact_name) },
                    { label: "Contact Number", value: displayValue(lead.contact_number) },
                    { label: "Contact Address", value: displayValue(lead.contact_address) },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            {lead.submission_id ? (
              <LeadDocumentsTab
                submissionId={lead.submission_id}
                allowDirectUpload
                includeOtherCategory
              />
            ) : (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No submission ID available to load documents.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="notes">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-4">
                  <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Note
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Note</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <Textarea
                          placeholder="Enter your note..."
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          rows={6}
                          disabled={savingNote}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setNoteDialogOpen(false);
                              setNewNote("");
                            }}
                            disabled={savingNote}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveNote}
                            disabled={savingNote || !newNote.trim()}
                          >
                            {savingNote ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save Note"
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                {notesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading notes...
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No notes found for this lead.</div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-foreground">Daily Deal Flow Notes</div>
                      {notes.map((n) => {
                        const author = (n.author_name || "").trim() || "Daily Deal Flow";
                        const source = (n.source || "").trim() || "Daily Deal Flow";
                        const dateText = n.created_at ? format(new Date(n.created_at), "PPpp") : "";
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
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="call-updates">
            <Card>
              <CardContent className="pt-6">
                {callUpdatesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading call updates...
                  </div>
                ) : callUpdates.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No call updates found for this lead.</div>
                ) : (
                  (() => {
                    const first = (callUpdates[0] || {}) as Record<string, unknown>;
                    const preferred = [
                      'date',
                      'created_at',
                      'updated_at',
                      'insured_name',
                      'client_phone_number',
                      'lead_vendor',
                      'state',
                      'status',
                      'call_result',
                      'buffer_agent',
                      'licensed_agent_account',
                      'agent',
                      'notes',
                    ];
                    const allKeys = Array.from(new Set(Object.keys(first)));
                    const shouldHideKey = (key: string) => {
                      const k = key.toLowerCase();
                      if (k === 'id') return true;
                      if (k === 'submission_id') return true;
                      if (k.endsWith('_id')) return true;
                      if (k.includes(' id')) return true;
                      if (k.startsWith('id_')) return true;
                      return false;
                    };

                    const visibleKeys = allKeys.filter((k) => !shouldHideKey(k));
                    const hiddenCallUpdateKeys = new Set([
                      'carrier',
                      'carrier_attempted_1',
                      'carrier_attempted_2',
                      'carrier_attempted_3',
                      'carrier_audit',
                      'product_type_carrier',
                    ]);
                    const preferredKeys = preferred.filter((k) => visibleKeys.includes(k));
                    const remaining = visibleKeys
                      .filter((k) => !preferred.includes(k))
                      .filter((k) => !hiddenCallUpdateKeys.has(k))
                      .sort();
                    const columns = preferredKeys.filter((k) => !hiddenCallUpdateKeys.has(k)).concat(remaining);

                    return (
                      <div className="w-full overflow-x-auto">
                        <div className="min-w-[1200px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {columns.map((col) => (
                                  <TableHead key={col} className="whitespace-nowrap">
                                    {formatColumnLabel(col)}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {callUpdates.map((u, idx) => {
                                const row = (u || {}) as Record<string, unknown>;
                                const key = typeof row.id === 'string' ? row.id : String(idx);
                                return (
                                  <TableRow key={key}>
                                    {columns.map((col) => (
                                      <TableCell
                                        key={col}
                                        className={
                                          col === 'notes'
                                            ? 'min-w-[320px] max-w-[640px] whitespace-pre-wrap break-words'
                                            : 'whitespace-nowrap'
                                        }
                                      >
                                        {displayValue(row[col])}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default LeadDetailsPage;
