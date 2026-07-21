import { useEffect, useRef, useState } from "react";
import { Clock, Loader2, Pause, Phone, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCallDuration,
  formatCallTimestamps,
  getLeadCallRecordings,
  type AlowareCallRecording,
} from "@/lib/alowareRecordings";

interface LeadDetailsDialogProps {
  open: boolean;
  submissionId: string | null;
  phoneNumber: string | null;
  notes: string | null;
  onOpenChange: (open: boolean) => void;
}

export const LeadDetailsDialog = ({
  open,
  submissionId,
  phoneNumber,
  notes,
  onOpenChange,
}: LeadDetailsDialogProps) => {
  const [activeTab, setActiveTab] = useState("notes");
  const [recordings, setRecordings] = useState<AlowareCallRecording[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current += 1;
    setActiveTab("notes");
    setRecordings([]);
    setNextCursor(null);
    setLoaded(false);
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setPlayingId(null);
  }, [open, submissionId]);

  const loadRecordings = async (cursor: string | null = null) => {
    if (!submissionId) {
      setLoaded(true);
      setError("This scoreboard record is not linked to a lead submission.");
      return;
    }

    const version = ++requestVersion.current;
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const page = await getLeadCallRecordings(submissionId, cursor);
      if (requestVersion.current !== version) return;

      setRecordings((current) => cursor ? [...current, ...page.recordings] : page.recordings);
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (caught) {
      if (requestVersion.current !== version) return;
      setError(caught instanceof Error ? caught.message : "Unable to load call recordings.");
      setLoaded(true);
    } finally {
      if (requestVersion.current === version) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "recordings" && !loaded && !loading) void loadRecordings();
  };

  const playingRecording = recordings.find((recording) => recording.id === playingId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Details - {phoneNumber || "No phone number"}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger
              value="notes"
              className="flex-1 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900 dark:data-[state=active]:text-blue-300"
            >
              Notes
            </TabsTrigger>
            <TabsTrigger
              value="recordings"
              className="flex-1 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-900 dark:data-[state=active]:text-emerald-300"
            >
              Call Recordings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="mt-4">
            <div className="whitespace-pre-wrap text-sm">
              {notes || "No notes available for this record."}
            </div>
          </TabsContent>

          <TabsContent value="recordings" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8" role="status">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="sr-only">Loading call recordings</span>
              </div>
            ) : error && recordings.length === 0 ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-sm text-destructive">{error}</p>
                {submissionId && (
                  <Button variant="outline" size="sm" onClick={() => void loadRecordings()}>
                    Try again
                  </Button>
                )}
              </div>
            ) : recordings.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No Aloware call recordings were found for this phone number.
              </div>
            ) : (
              <div className="space-y-3">
                {recordings.map((recording) => {
                  const callTimes = formatCallTimestamps(recording.startedAt);
                  return (
                    <div
                      key={recording.id}
                      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`rounded-full p-2 ${
                          recording.direction === "inbound"
                            ? "bg-blue-100 dark:bg-blue-900"
                            : "bg-emerald-100 dark:bg-emerald-900"
                        }`}>
                          <Phone className={`h-4 w-4 ${
                            recording.direction === "inbound"
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium capitalize">
                            {recording.direction === "unknown" ? "Call" : `${recording.direction} call`}
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <Clock className="h-3 w-3" />
                              <span>GMT+2: {callTimes.gmtPlusTwo}</span>
                            </div>
                            <div className="pl-5">California: {callTimes.california}</div>
                            <div className="flex flex-wrap items-center gap-2 pl-5">
                              <span>{formatCallDuration(recording.durationSeconds)}</span>
                              <span aria-hidden="true">{"\u2022"}</span>
                              <span>{recording.agentName || "Unknown agent"}</span>
                              {recording.status && (
                                <>
                                  <span aria-hidden="true">{"\u2022"}</span>
                                  <span className="capitalize">{recording.status}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <Button
                        variant={playingId === recording.id ? "outline" : "default"}
                        size="sm"
                        onClick={() => setPlayingId((current) => current === recording.id ? null : recording.id)}
                      >
                        {playingId === recording.id ? (
                          <><Pause className="mr-1 h-4 w-4" />Stop</>
                        ) : (
                          <><Play className="mr-1 h-4 w-4" />Play</>
                        )}
                      </Button>
                    </div>
                  );
                })}

                {playingRecording && (
                  <div className="rounded-lg border bg-card p-4">
                    <audio
                      key={playingRecording.id}
                      controls
                      autoPlay
                      className="w-full"
                      src={playingRecording.playbackUrl}
                      onEnded={() => setPlayingId(null)}
                    />
                  </div>
                )}

                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                {nextCursor && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingMore}
                      onClick={() => void loadRecordings(nextCursor)}
                    >
                      {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
