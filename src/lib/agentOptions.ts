import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const titleCase = (s: string) => {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const formatAgentLabelFromEmail = (email: string) => {
  const localPart = (email || "").split("@")[0] || "";
  if (!localPart) return "";

  const cleaned = localPart.replace(/[_-]+/g, ".");

  if (cleaned.includes(".")) {
    const [firstRaw, secondRaw] = cleaned.split(".");
    const first = titleCase(firstRaw || "");
    const secondInitial = (secondRaw || "").trim().charAt(0);
    const second = secondInitial ? titleCase(secondInitial) : "";
    return `${first}${second ? " " + second : ""}`.trim();
  }

  return titleCase(cleaned);
};

const getBestDisplayName = (row: { name?: string | null; display_name?: string | null; email?: string | null; fallback?: string }) => {
  const direct = (row.name || row.display_name || "").trim();
  if (direct) return direct;

  const email = (row.email || "").trim();
  if (email) {
    const formatted = formatAgentLabelFromEmail(email);
    return formatted || email;
  }

  return row.fallback || "";
};

const normalizeAgentLabel = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const pushAlias = (target: Set<string>, value: string | null | undefined) => {
  const normalized = normalizeAgentLabel(value);
  if (normalized) {
    target.add(normalized);
  }
};

const safeSelectAppUsers = async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const full = await supabase
    .from('app_users' as any)
    .select('user_id, name, display_name, email' as any);

  if (!full.error) return full;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const minimal = await supabase
    .from('app_users' as any)
    .select('user_id, display_name, email' as any);

  return minimal;
};

const safeSelectAppUsersByIds = async (ids: string[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const full = await supabase
    .from("app_users" as any)
    .select("user_id, name, display_name, email" as any)
    .in("user_id", ids as any);

  if (!full.error) return full;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const minimal = await supabase
    .from("app_users" as any)
    .select("user_id, display_name, email" as any)
    .in("user_id", ids as any);

  return minimal;
};

type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "user_id" | "display_name">;

export interface LicensedCloserDirectoryEntry {
  userId: string;
  label: string;
  aliases: string[];
}

export const fetchAgentDropdownOptions = async (): Promise<Array<{ key: string; label: string }>> => {
  const [agentsRes, appUsersRes] = await Promise.all([
    supabase.from('agents').select('id, name, email'),
    safeSelectAppUsers(),
  ]);

  const out = new Map<string, { key: string; label: string }>();

  if (!agentsRes.error) {
    (agentsRes.data || []).forEach((a) => {
      const label = getBestDisplayName({ name: a.name, email: a.email, fallback: a.id });
      if (!label) return;
      out.set(label.toLowerCase(), { key: `agents:${a.id}`, label });
    });
  }

  if (!appUsersRes.error) {
    (appUsersRes.data || []).forEach((u: any) => {
      const label = getBestDisplayName({ name: u.name, display_name: u.display_name, email: u.email, fallback: u.user_id });
      if (!label) return;
      out.set(label.toLowerCase(), { key: `app_users:${u.user_id || label}`, label });
    });
  }

  return Array.from(out.values()).sort((a, b) => a.label.localeCompare(b.label));
};

export const fetchLicensedCloserDirectory = async (): Promise<LicensedCloserDirectoryEntry[]> => {
  const { data: statusRows, error: statusError } = await supabase
    .from("agent_status")
    .select("user_id")
    .eq("agent_type", "licensed");

  if (statusError || !statusRows?.length) {
    return [];
  }

  const ids = statusRows.map((row: any) => row.user_id);

  const [appUsersRes, profilesRes] = await Promise.all([
    safeSelectAppUsersByIds(ids),
    supabase.from("profiles").select("user_id, display_name").in("user_id", ids),
  ]);

  const appUserMap = new Map<string, { name?: string | null; display_name?: string | null; email?: string | null }>();
  (appUsersRes.data || []).forEach((row: any) => {
    appUserMap.set(row.user_id, {
      name: row.name ?? null,
      display_name: row.display_name ?? null,
      email: row.email ?? null,
    });
  });

  const profileMap = new Map<string, ProfileRow>();
  (profilesRes.data || []).forEach((row) => {
    profileMap.set(row.user_id, row);
  });

  const out: LicensedCloserDirectoryEntry[] = [];

  ids.forEach((id) => {
    const appUser = appUserMap.get(id);
    const profile = profileMap.get(id);
    const label = getBestDisplayName({
      name: appUser?.name,
      display_name: appUser?.display_name || profile?.display_name,
      email: appUser?.email,
      fallback: id,
    });

    if (!label) return;

    const aliases = new Set<string>();
    pushAlias(aliases, label);
    pushAlias(aliases, appUser?.name);
    pushAlias(aliases, appUser?.display_name);
    pushAlias(aliases, profile?.display_name);
    pushAlias(aliases, appUser?.email);

    if (appUser?.email) {
      pushAlias(aliases, formatAgentLabelFromEmail(appUser.email));
    }

    out.push({
      userId: id,
      label,
      aliases: Array.from(aliases),
    });
  });

  return out.sort((a, b) => a.label.localeCompare(b.label));
};

export const fetchLicensedCloserOptions = async (): Promise<Array<{ key: string; label: string }>> => {
  const directory = await fetchLicensedCloserDirectory();
  return directory.map((entry) => ({ key: entry.userId, label: entry.label }));
};
