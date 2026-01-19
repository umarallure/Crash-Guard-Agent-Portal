import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

type Payload = {
  leadId: string;
  submissionId?: string | null;
  leadVendor: string;
  insuredName?: string | null;
  clientPhoneNumber?: string | null;
  newDisposition: string;
  previousDisposition?: string | null;
  notes: string;
  updatedBy?: string | null;
};

function normalizeSlackChannel(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  return v;
}

async function postToSlack(channel: string, message: unknown) {
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, ...message }),
  });
  const result = await resp.json();
  return { ok: !!result?.ok, error: result?.error, raw: result };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Incoming request:", {
      url: req.url,
      method: req.method,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
      hasSlackToken: !!SLACK_BOT_TOKEN,
    });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    if (!SLACK_BOT_TOKEN) {
      throw new Error("SLACK_BOT_TOKEN not configured");
    }

    const payload = (await req.json()) as Payload;
    console.log("Payload received:", payload);

    const notes = (payload.notes ?? "").trim();
    if (!notes) {
      console.log("Skipping: no notes provided");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No notes provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!payload.leadVendor?.trim()) throw new Error("leadVendor is required");
    if (!payload.leadId?.trim()) throw new Error("leadId is required");
    if (!payload.newDisposition?.trim()) throw new Error("newDisposition is required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    console.log("Querying centers for leadVendor:", payload.leadVendor);
    const { data: center, error: centerErr } = await supabase
      .from("centers")
      .select("slack_channel, center_name, lead_vendor")
      .eq("lead_vendor", payload.leadVendor)
      .maybeSingle();

    console.log("Center lookup result:", { center, centerErr });
    if (centerErr) throw centerErr;

    const channel =
      normalizeSlackChannel(center?.slack_channel) ??
      "#crash-guard-submission-portal";
    console.log("Using Slack channel:", channel);

    const insuredName = (payload.insuredName ?? "").trim() || "N/A";
    const phone = (payload.clientPhoneNumber ?? "").trim() || "N/A";
    const updatedBy = (payload.updatedBy ?? "").trim();
    const previousDisposition = (payload.previousDisposition ?? "").trim() || "Unknown";
    const newDisposition = (payload.newDisposition ?? "").trim();

    const slackMessage = {
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `📝 Disposition Changed: ${previousDisposition} -> ${newDisposition}` },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Customer:*\n${insuredName}` },
            { type: "mrkdwn", text: `*Phone:*\n${phone}` },
            { type: "mrkdwn", text: `*Vendor:*\n${payload.leadVendor}` },
            { type: "mrkdwn", text: `*New Disposition:*\n${newDisposition}` },
            ...(updatedBy ? [{ type: "mrkdwn", text: `*Updated By:*\n${updatedBy}` }] : []),
          ],
        },
        { type: "divider" },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Notes:*\n${notes}` },
        },
      ],
    };

    const postResult = await postToSlack(channel, slackMessage);
    console.log("Slack post result:", postResult.raw);

    if (!postResult.ok) {
      throw new Error(`Slack API error: ${postResult.error || "unknown_error"}`);
    }

    return new Response(
      JSON.stringify({ success: true, channel, ts: postResult.raw?.ts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
