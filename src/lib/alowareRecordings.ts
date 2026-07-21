import { supabase } from "@/integrations/supabase/client";

export interface AlowareCallRecording {
  id: string;
  direction: "inbound" | "outbound" | "unknown";
  status: string | null;
  durationSeconds: number;
  startedAt: string;
  agentName: string | null;
  playbackUrl: string;
}

export interface LeadCallRecordingsPage {
  recordings: AlowareCallRecording[];
  nextCursor: string | null;
}

export class LeadCallRecordingsError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "LeadCallRecordingsError";
  }
}

const errorResponse = (error: unknown): Response | null => {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: unknown }).context;
  return context instanceof Response ? context : null;
};

export const getLeadCallRecordings = async (
  submissionId: string,
  cursor: string | null = null,
  pageSize = 25,
): Promise<LeadCallRecordingsPage> => {
  const { data, error } = await supabase.functions.invoke<LeadCallRecordingsPage>(
    "get-lead-call-recordings",
    { body: { submissionId, cursor, pageSize } },
  );

  if (error) {
    const response = errorResponse(error);
    let message = "Unable to load call recordings.";
    if (response) {
      try {
        const body = await response.clone().json() as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim()) message = body.error;
      } catch {
        // Preserve the safe default message for non-JSON gateway errors.
      }
    }
    throw new LeadCallRecordingsError(message, response?.status ?? null);
  }

  if (!data || !Array.isArray(data.recordings)) {
    throw new LeadCallRecordingsError("The recordings service returned an invalid response.");
  }

  return {
    recordings: data.recordings,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
  };
};

export const formatCallDuration = (seconds: number): string => {
  const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`
    : `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const callTimeFormatters = {
  gmtPlusTwo: new Intl.DateTimeFormat("en-US", {
    timeZone: "Etc/GMT-2",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }),
  california: new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }),
};

export const formatCallTimestamps = (value: string): {
  gmtPlusTwo: string;
  california: string;
} => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { gmtPlusTwo: "Unknown time", california: "Unknown time" };
  }

  return {
    gmtPlusTwo: callTimeFormatters.gmtPlusTwo.format(parsed),
    california: callTimeFormatters.california.format(parsed),
  };
};
