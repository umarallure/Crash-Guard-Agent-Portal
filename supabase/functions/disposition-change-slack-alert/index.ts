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
  newDisposition?: string | null;
  previousDisposition?: string | null;
  notes: string;
  updatedBy?: string | null;
  noteOnly?: boolean;
};

function normalizeSlackChannel(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  return v;
}

async function slackApi(method: string, body?: Record<string, unknown>) {
  const resp = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const result = await resp.json();
  return result as Record<string, unknown>;
}

function looksLikeChannelId(value: string) {
  const v = value.trim();
  return /^(C|G)[A-Z0-9]{8,}$/.test(v);
}

async function resolveSlackChannelId(input: string): Promise<{ channelId: string | null; resolvedFrom: string }>
{
  const raw = input.trim();
  if (!raw) return { channelId: null, resolvedFrom: "empty" };

  if (looksLikeChannelId(raw)) {
    return { channelId: raw, resolvedFrom: "id" };
  }

  const name = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!name) return { channelId: null, resolvedFrom: "empty" };

  const listRes = await slackApi("conversations.list", {
    limit: 1000,
    types: "public_channel,private_channel",
    exclude_archived: true,
  });

  if (!listRes?.ok) {
    return { channelId: null, resolvedFrom: `list_failed:${String(listRes?.error ?? "unknown_error")}` };
  }

  const channels = (listRes.channels as Array<Record<string, unknown>> | undefined) ?? [];
  const match = channels.find((c) => String(c?.name ?? "").toLowerCase() === name.toLowerCase());
  const channelId = match ? String(match.id ?? "") : "";
  return { channelId: channelId || null, resolvedFrom: "name" };
}

async function postToSlack(channel: string, message: unknown) {
  const messageObj = (message ?? {}) as Record<string, unknown>;
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, ...messageObj }),
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
    const isNoteOnly = payload.noteOnly === true || !payload.newDisposition?.trim();

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

    const authTest = await slackApi("auth.test");
    console.log("Slack auth.test:", {
      ok: authTest?.ok,
      team: authTest?.team,
      team_id: authTest?.team_id,
      bot_id: authTest?.bot_id,
      user_id: authTest?.user_id,
      error: authTest?.error,
    });

    const { channelId, resolvedFrom } = await resolveSlackChannelId(channel);
    console.log("Resolved Slack channel:", { input: channel, channelId, resolvedFrom });

    if (!channelId) {
      throw new Error(
        `Unable to resolve Slack channel. input=${channel} resolvedFrom=${resolvedFrom}`
      );
    }

    const channelInfo = await slackApi("conversations.info", { channel: channelId });
    console.log("Slack conversations.info:", {
      ok: channelInfo?.ok,
      error: channelInfo?.error,
      channel: channelInfo?.channel,
    });

    if (!channelInfo?.ok) {
      throw new Error(
        `Slack conversations.info failed for channel=${channelId}: ${String(channelInfo?.error ?? "unknown_error")}`
      );
    }

    console.log("Using Slack channel id:", channelId);

    const insuredName = (payload.insuredName ?? "").trim() || "N/A";
    const phone = (payload.clientPhoneNumber ?? "").trim() || "N/A";
    const updatedBy = (payload.updatedBy ?? "").trim();
    const previousDisposition = (payload.previousDisposition ?? "").trim() || "Unknown";
    const newDisposition = (payload.newDisposition ?? "").trim();

    const headerText = isNoteOnly
      ? `📝 Note Added — ${newDisposition || previousDisposition}`
      : `📝 Disposition Updated: ${previousDisposition} -> ${newDisposition}`;

    const sectionFields = [
      { type: "mrkdwn", text: `*Customer:*\n${insuredName}` },
      { type: "mrkdwn", text: `*Phone:*\n${phone}` },
      { type: "mrkdwn", text: `*Vendor:*\n${payload.leadVendor}` },
      ...(isNoteOnly
        ? [{ type: "mrkdwn", text: `*Current Disposition:*\n${newDisposition || previousDisposition}` }]
        : [{ type: "mrkdwn", text: `*New Disposition:*\n${newDisposition}` }]),
      ...(updatedBy ? [{ type: "mrkdwn", text: `*Updated By:*\n${updatedBy}` }] : []),
    ];

    const slackMessage = {
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: headerText },
        },
        {
          type: "section",
          fields: sectionFields,
        },
        { type: "divider" },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Notes:*\n${notes}` },
        },
      ],
    };

    const postResult = await postToSlack(channelId, slackMessage);
    console.log("Slack post result:", postResult.raw);

    if (!postResult.ok) {
      throw new Error(`Slack API error: ${postResult.error || "unknown_error"}`);
    }

    return new Response(
      JSON.stringify({ success: true, channel: channelId, ts: postResult.raw?.ts }),
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
