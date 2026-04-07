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
  submissionId: string;
  leadData?: {
    customer_full_name?: string | null;
    phone_number?: string | null;
    email?: string | null;
    lead_vendor?: string | null;
  } | null;
  callResult?: {
    application_submitted?: boolean | null;
    pipelineName?: string | null;
    stageName?: string | null;
    statusKey?: string | null;
    additionalNotes?: string | null;
    notes?: string | null;
    dq_reason?: string | null;
    buffer_agent?: string | null;
    agent_who_took_call?: string | null;
    lead_vendor?: string | null;
  } | null;
};

function normalizeSlackChannel(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return v || null;
}

function looksLikeChannelId(value: string) {
  const v = value.trim();
  return /^(C|G)[A-Z0-9]{8,}$/.test(v);
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
  return await resp.json();
}

async function resolveSlackChannelId(input: string): Promise<{ channelId: string | null; resolvedFrom: string }> {
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
  const match = channels.find((channel) => String(channel?.name ?? "").toLowerCase() === name.toLowerCase());
  const channelId = match ? String(match.id ?? "") : "";

  return { channelId: channelId || null, resolvedFrom: "name" };
}

async function postToSlack(channel: string, message: Record<string, unknown>) {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, ...message }),
  });

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    if (!SLACK_BOT_TOKEN) {
      throw new Error("SLACK_BOT_TOKEN not configured");
    }

    const payload = (await req.json()) as Payload;
    const submissionId = (payload.submissionId || "").trim();
    const leadVendor = (
      payload.callResult?.lead_vendor ||
      payload.leadData?.lead_vendor ||
      ""
    ).trim();

    if (!submissionId) {
      throw new Error("submissionId is required");
    }

    if (!leadVendor) {
      throw new Error("lead vendor is required");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select("slack_channel, center_name, lead_vendor")
      .eq("lead_vendor", leadVendor)
      .maybeSingle();

    if (centerError) throw centerError;

    const configuredChannel = normalizeSlackChannel(center?.slack_channel);
    if (!configuredChannel) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          message: `No slack_channel configured for lead vendor ${leadVendor}`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { channelId, resolvedFrom } = await resolveSlackChannelId(configuredChannel);
    if (!channelId) {
      throw new Error(`Unable to resolve Slack channel "${configuredChannel}" (${resolvedFrom})`);
    }

    const customerName = (payload.leadData?.customer_full_name || "").trim() || "Unknown Customer";
    const phoneNumber = (payload.leadData?.phone_number || "").trim() || "No phone number";
    const pipelineName = (payload.callResult?.pipelineName || "").trim() || "Unknown Pipeline";
    const stageName = (payload.callResult?.stageName || "").trim() || "Unknown Stage";
    const statusKey = (payload.callResult?.statusKey || "").trim() || "Unknown Status Key";
    const additionalNotes = (payload.callResult?.additionalNotes || "").trim();
    const notes = (payload.callResult?.notes || "").trim();
    const reason = (payload.callResult?.dq_reason || "").trim();
    const agentName = (payload.callResult?.agent_who_took_call || "").trim() || "N/A";
    const bufferAgent = (payload.callResult?.buffer_agent || "").trim() || "N/A";
    const isSubmitted = payload.callResult?.application_submitted === true;

    const headerText = isSubmitted
      ? `✅ Call Result Saved — ${stageName}`
      : `📋 Call Result Saved — ${stageName}`;

    const message = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: headerText,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Submission ID:*\n${submissionId}` },
            { type: "mrkdwn", text: `*Customer:*\n${customerName}` },
            { type: "mrkdwn", text: `*Phone:*\n${phoneNumber}` },
            { type: "mrkdwn", text: `*Lead Vendor:*\n${leadVendor}` },
            { type: "mrkdwn", text: `*Pipeline:*\n${pipelineName}` },
            { type: "mrkdwn", text: `*Stage:*\n${stageName}` },
            { type: "mrkdwn", text: `*Status Key:*\n${statusKey}` },
            { type: "mrkdwn", text: `*Application Submitted:*\n${isSubmitted ? "Yes" : "No"}` },
          ],
        },
        ...(reason
          ? [
              { type: "divider" },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Reason:*\n${reason}`,
                },
              },
            ]
          : []),
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Additional Notes:*\n${additionalNotes || "No additional notes"}`,
          },
        },
        ...(notes && notes !== additionalNotes
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Saved Notes Payload:*\n${notes}`,
                },
              },
            ]
          : []),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `👤 Agent: *${agentName}* | 🔄 Buffer: *${bufferAgent}* | 🏢 Center: *${center?.center_name || leadVendor}*`,
            },
          ],
        },
      ],
    };

    const slackResult = await postToSlack(channelId, message);
    if (!slackResult?.ok) {
      throw new Error(`Slack API error: ${String(slackResult?.error ?? "unknown_error")}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        channel: configuredChannel,
        channelId,
        submissionId,
        leadVendor,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in call-result-notification:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
