import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  buildInternalAttorneyCoverageStates,
  normalizeAttorneyCoverageStates,
  type AttorneyLeadFilterOption,
} from "@/lib/attorneyLeadFilter";

type AttorneyProfileFilterRow = {
  id: string | null;
  user_id: string | null;
  full_name: string | null;
  firm_name: string | null;
  primary_email: string | null;
  licensed_states: unknown;
  general_coverage: unknown;
  blocked_states: unknown;
};

type LawyerRequirementFilterRow = {
  id: string | null;
  attorney_id: string | null;
  attorney_name: string | null;
  lawyer_type: string | null;
  sol: string | null;
  states: unknown;
};

type SupabaseErrorLike = { message?: string } | null;
type SupabaseListResponse<T> = { data: T[] | null; error: SupabaseErrorLike };
type SupabaseQueryChain<T> = PromiseLike<SupabaseListResponse<T>> & {
  eq: (column: string, value: unknown) => SupabaseQueryChain<T>;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => SupabaseQueryChain<T>;
};

type SupabaseFilterClient = {
  from: (table: string) => {
    select: (columns: string) => SupabaseQueryChain<unknown>;
  };
};

const buildAttorneyLabel = (...parts: Array<string | null | undefined>) => {
  const [primary, secondary, fallback] = parts.map((part) => (part || "").trim());
  if (primary && secondary) return `${primary} - ${secondary}`;
  return primary || secondary || fallback || "Attorney";
};

const normalizeSolValue = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
};

const toInternalOption = (row: AttorneyProfileFilterRow): AttorneyLeadFilterOption | null => {
  const userId = String(row.user_id ?? "").trim();
  if (!userId) return null;

  const label = buildAttorneyLabel(row.full_name, row.firm_name, row.primary_email || userId);
  const coverageStates = buildInternalAttorneyCoverageStates({
    generalCoverage: row.general_coverage,
    licensedStates: row.licensed_states,
    blockedStates: row.blocked_states,
  });

  return {
    id: `internal:${userId}`,
    type: "internal_lawyer",
    label,
    coverageStates,
    sol: null,
    sourceId: userId,
    searchText: `${label} ${row.primary_email ?? ""} internal ${coverageStates.join(" ")}`,
  };
};

const toBrokerOption = (row: LawyerRequirementFilterRow): AttorneyLeadFilterOption | null => {
  const requirementId = String(row.id ?? "").trim();
  if (!requirementId) return null;

  const attorneyId = String(row.attorney_id ?? "").trim();
  const label = buildAttorneyLabel(row.attorney_name, null, attorneyId || requirementId);
  const coverageStates = normalizeAttorneyCoverageStates(row.states);
  const sol = normalizeSolValue(row.sol);

  return {
    id: `broker:${requirementId}`,
    type: "broker_lawyer",
    label,
    coverageStates,
    sol,
    sourceId: requirementId,
    searchText: `${label} ${attorneyId} broker ${coverageStates.join(" ")} ${sol ?? ""}`,
  };
};

const sortAttorneyOptions = (left: AttorneyLeadFilterOption, right: AttorneyLeadFilterOption) => {
  if (left.type !== right.type) {
    return left.type === "internal_lawyer" ? -1 : 1;
  }

  return left.label.localeCompare(right.label);
};

export function useAttorneyLeadFilterOptions() {
  const [options, setOptions] = useState<AttorneyLeadFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAttorneyOptions = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabaseClient = supabase as unknown as SupabaseFilterClient;
        const [internalResult, brokerResult] = await Promise.all([
          supabaseClient
            .from("attorney_profiles")
            .select("id,user_id,full_name,firm_name,primary_email,licensed_states,general_coverage,blocked_states,account_type")
            .eq("account_type", "internal_lawyer")
            .order("full_name", { ascending: true, nullsFirst: false }) as SupabaseQueryChain<AttorneyProfileFilterRow>,
          supabaseClient
            .from("lawyer_requirements")
            .select("id,attorney_id,attorney_name,lawyer_type,sol,states")
            .eq("lawyer_type", "broker_lawyer")
            .order("attorney_name", { ascending: true, nullsFirst: false }) as SupabaseQueryChain<LawyerRequirementFilterRow>,
        ]);

        if (cancelled) return;

        if (internalResult.error) throw internalResult.error;
        if (brokerResult.error) throw brokerResult.error;

        const nextOptions = [
          ...((internalResult.data ?? []).map(toInternalOption).filter(Boolean) as AttorneyLeadFilterOption[]),
          ...((brokerResult.data ?? []).map(toBrokerOption).filter(Boolean) as AttorneyLeadFilterOption[]),
        ].sort(sortAttorneyOptions);

        setOptions(nextOptions);
      } catch (fetchError) {
        console.error("Failed to fetch attorney lead filter options:", fetchError);
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch attorney filter options");
        setOptions([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchAttorneyOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({ options, loading, error }), [options, loading, error]);
}
