import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { parseAlowareRecordingPayload } from "../supabase/functions/_shared/aloware.ts";
import { isValidTimeZone } from "../supabase/functions/_shared/http.ts";
import { maskE164Phone } from "../supabase/functions/_shared/phone.ts";

type CsvRow = Record<string, string>;

const loadLocalEnv = () => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) process.env[name] = value;
  }
};

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const rowValue = (row: CsvRow, ...headers: string[]): string => {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), String(value ?? "").trim()]),
  );
  for (const header of headers) {
    const value = normalized.get(normalizeHeader(header));
    if (value) return value;
  }
  return "";
};

const stableCommunicationId = (row: CsvRow) => {
  const explicitId = rowValue(row, "Communication ID", "CommunicationID", "ID");
  if (explicitId) return explicitId;

  const recording = rowValue(row, "Recording", "Recording URL", "Direct Recording URL");
  let stableRecording = recording;
  try {
    const url = new URL(recording);
    stableRecording = `${url.origin}${url.pathname}`;
  } catch {
    // Validation later reports malformed URLs without exposing them in logs.
  }

  return `csv-${createHash("sha256").update([
    rowValue(row, "Contact Number", "Phone Number", "Lead Number"),
    rowValue(row, "Started At", "Created At", "Date"),
    stableRecording,
  ].join("|")).digest("hex").slice(0, 32)}`;
};

const payloadForRow = (row: CsvRow) => ({
  event: "RecordingSaved-HistoricalImport",
  body: {
    id: stableCommunicationId(row),
    company_id: rowValue(row, "Company ID"),
    contact_id: rowValue(row, "Contact ID"),
    direction: rowValue(row, "Direction"),
    duration: rowValue(row, "Duration", "Duration Seconds"),
    disposition_status: rowValue(row, "Disposition Status", "Status"),
    started_at: rowValue(row, "Started At", "Created At", "Date"),
    direct_recording_url: rowValue(row, "Recording", "Recording URL", "Direct Recording URL"),
    user_id: rowValue(row, "Communication Owner ID", "Owner ID", "User ID"),
    user_name: rowValue(row, "Communication Owner Name", "Owner Name", "User Name", "Agent"),
    contact: {
      phone_number: rowValue(row, "Contact Number", "Phone Number", "Lead Number"),
    },
  },
});

const getArgument = (name: string) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async () => {
  loadLocalEnv();

  const fileArgument = getArgument("file") ?? process.argv.slice(2).find((value) => !value.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  const timeZone = process.env.ALOWARE_ACCOUNT_TIMEZONE || "";
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const webhookSecret = process.env.ALOWARE_WEBHOOK_SECRET || "";

  if (!fileArgument) {
    throw new Error("Usage: npm run import:aloware-recordings -- --file <export.csv> [--dry-run]");
  }
  if (!isValidTimeZone(timeZone)) {
    throw new Error("ALOWARE_ACCOUNT_TIMEZONE must be a valid IANA timezone matching the Aloware account.");
  }
  const filePath = resolve(process.cwd(), fileArgument);
  if (!existsSync(filePath)) throw new Error(`CSV file not found: ${filePath}`);
  if (!dryRun && (!supabaseUrl || webhookSecret.length < 32 || /\s/.test(webhookSecret))) {
    throw new Error(
      "SUPABASE_URL/VITE_SUPABASE_URL and an ALOWARE_WEBHOOK_SECRET of at least 32 non-whitespace characters are required.",
    );
  }

  const rows = parse(readFileSync(filePath, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];

  const summary = { total: rows.length, valid: 0, imported: 0, skipped: 0, failed: 0 };
  const endpoint = `${supabaseUrl}/functions/v1/aloware-recording-webhook`;

  for (const [index, row] of rows.entries()) {
    const type = rowValue(row, "Type", "Communication Type").toLowerCase();
    const recordingUrl = rowValue(row, "Recording", "Recording URL", "Direct Recording URL");
    if ((type && type !== "call" && type !== "1" && type !== "phone call") || !recordingUrl) {
      summary.skipped += 1;
      continue;
    }

    const payload = payloadForRow(row);
    const parsed = parseAlowareRecordingPayload(payload, timeZone);
    if (!parsed.ok) {
      summary.failed += 1;
      console.warn(`Row ${index + 2}: ${parsed.code}`);
      continue;
    }

    summary.valid += 1;
    if (dryRun) continue;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${webhookSecret}`,
          "Content-Type": "application/json",
          ...(anonKey ? { apikey: anonKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        summary.failed += 1;
        console.warn(`Row ${index + 2} (${maskE164Phone(parsed.recording.phoneE164)}): HTTP ${response.status}`);
        continue;
      }
      summary.imported += 1;
    } catch {
      summary.failed += 1;
      console.warn(`Row ${index + 2} (${maskE164Phone(parsed.recording.phoneE164)}): request failed`);
    }
  }

  console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "import", ...summary }, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Aloware import failed");
  process.exitCode = 1;
});
