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
import { useToast } from "@/hooks/use-toast";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

type LeadNote = {
  id: string;
  lead_id: string | null;
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

const displayValue = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim().length === 0) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const formatDateIfPresent = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "MMM dd, yyyy");
};

const maskSsn = (ssn: string | null | undefined) => {
  if (!ssn) return "—";
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
  const { submissionId } = useParams();
  const { toast } = useToast();

  const [lead, setLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [legacyNotes, setLegacyNotes] = useState<LegacyNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!submissionId) {
        setLoading(false);
        toast({
          title: "Error",
          description: "Missing submission ID in route",
          variant: "destructive",
        });
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle();

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
          description: `No lead found for submission ID ${submissionId}`,
          variant: "destructive",
        });
        setLead(null);
        setLoading(false);
        return;
      }

      setLead(data);
      setLoading(false);

      fetchNotes(data.submission_id ?? null, data.id ?? null);
      setLegacyNotes(
        data.additional_notes
          ? [
              {
                source: "Leads",
                note: String(data.additional_notes).trim(),
                timestamp: data.updated_at || data.created_at || null,
              },
            ]
          : []
      );
    };

    run();
  }, [submissionId, toast]);

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

    setSavingNote(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const user = userData?.user;
      const createdBy = user?.id || null;
      const emailPrefix = user?.email ? user.email.split('@')[0] : null;

      let displayName: string | null = null;
      if (user?.id) {
        try {
          const { data: profileData } = await (supabase as any)
            .from('profiles')
            .select('display_name')
            .eq('user_id', user.id)
            .limit(1);

          const raw = Array.isArray(profileData) ? profileData?.[0]?.display_name : profileData?.display_name;
          displayName = typeof raw === 'string' ? raw.trim() : null;
          if (displayName && displayName.length === 0) displayName = null;
        } catch (e) {
          console.warn('Failed to fetch profile display_name', e);
        }
      }

      const authorName =
        displayName || (user?.user_metadata as any)?.full_name || emailPrefix || user?.id || null;

      const { error: insertErr } = await (supabase as any).from('lead_notes').insert({
        lead_id: lead.id,
        submission_id: lead.submission_id ?? null,
        note: trimmedNote,
        source: 'Lead Details',
        created_by: createdBy,
        author_name: authorName,
      });

      if (insertErr) throw insertErr;

      try {
        const { error: slackError } = await supabase.functions.invoke('disposition-change-slack-alert', {
          body: {
            leadId: lead.id,
            submissionId: lead.submission_id ?? null,
            leadVendor: lead.lead_vendor ?? '',
            insuredName: lead.customer_full_name ?? null,
            clientPhoneNumber: lead.phone_number ?? null,
            previousDisposition: null,
            newDisposition: null,
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
      await fetchNotes(lead.submission_id ?? null, lead.id ?? null);
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

  const fetchNotes = async (submission_id: string | null, lead_id: string | null) => {
    setNotesLoading(true);
    try {
      const query = (supabase as any)
        .from("lead_notes")
        .select("id, lead_id, submission_id, note, created_at, created_by, author_name, source")
        .order("created_at", { ascending: false });

      if (submission_id) {
        query.eq("submission_id", submission_id);
      } else if (lead_id) {
        query.eq("lead_id", lead_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Failed to fetch lead notes", error);
        setNotes([]);
        return;
      }

      setNotes((data as LeadNote[]) || []);
    } catch (e) {
      console.error("Unexpected error fetching lead notes", e);
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
              <TabsTrigger value="notes">Notes</TabsTrigger>
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
                ) : notes.length === 0 && legacyNotes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No notes found for this lead.</div>
                ) : (
                  <div className="space-y-6">
                    {notes.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-foreground">Notes</div>
                        {notes.map((n) => {
                          const author = (n.author_name || "").trim() || n.created_by || "Unknown";
                          const source = (n.source || "").trim() || "Unknown source";
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
                    )}

                    {legacyNotes.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-foreground">Legacy notes</div>
                        {legacyNotes.map((ln, idx) => {
                          const dateText = ln.timestamp ? format(new Date(ln.timestamp), "PPpp") : "";
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

export default LeadDetailsPage;
