import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { normalizeAttorneyCoverageStates } from "@/lib/attorneyLeadFilter";
import {
  getBrokerCoverageSolCriteriaLabel,
  mapBrokerCoverageSolCriteriaToSolPeriod,
  type BrokerAttorneyCoverageRule,
  type BrokerProfileLeadFilterOption,
} from "@/lib/brokerProfileLeadFilter";

type BrokerProfileFilterRow = {
  user_id: string | null;
  company_name: string | null;
  full_name: string | null;
  primary_email: string | null;
};

type BrokerAttorneyCoverageRow = {
  id: string | null;
  broker_id: string | null;
  attorney_name: string | null;
  coverage_states: unknown;
  coverage_sol_criteria: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
};

type SupabaseErrorLike = { message?: string } | null;
type SupabaseListResponse<T> = { data: T[] | null; error: SupabaseErrorLike };
type SupabaseQueryChain<T> = PromiseLike<SupabaseListResponse<T>> & {
  eq: (column: string, value: unknown) => SupabaseQueryChain<T>;
  is: (column: string, value: unknown) => SupabaseQueryChain<T>;
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

const buildBrokerLabel = (row: BrokerProfileFilterRow) => {
  const companyName = String(row.company_name ?? "").trim();
  const fullName = String(row.full_name ?? "").trim();
  const primaryEmail = String(row.primary_email ?? "").trim();
  const userId = String(row.user_id ?? "").trim();

  return companyName || fullName || primaryEmail || userId || "Broker Profile";
};

const uniqueSorted = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

const toCoverageRule = (row: BrokerAttorneyCoverageRow): BrokerAttorneyCoverageRule | null => {
  const id = String(row.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    attorneyName: String(row.attorney_name ?? "").trim() || null,
    coverageStates: normalizeAttorneyCoverageStates(row.coverage_states),
    coverageSolCriteria: String(row.coverage_sol_criteria ?? "").trim() || null,
    isActive: row.is_active,
    deletedAt: row.deleted_at,
  };
};

const toBrokerProfileOption = (
  row: BrokerProfileFilterRow,
  rules: BrokerAttorneyCoverageRule[],
): BrokerProfileLeadFilterOption | null => {
  const userId = String(row.user_id ?? "").trim();
  if (!userId || rules.length === 0) return null;

  const label = buildBrokerLabel(row);
  const coverageStates = uniqueSorted(rules.flatMap((rule) => rule.coverageStates));
  const solCriteria = uniqueSorted(
    rules
      .map((rule) => rule.coverageSolCriteria)
      .filter((criteria) => Boolean(mapBrokerCoverageSolCriteriaToSolPeriod(criteria))),
  );
  const solSearchText = solCriteria.map(getBrokerCoverageSolCriteriaLabel).join(" ");

  return {
    id: `broker-profile:${userId}`,
    label,
    sourceId: userId,
    companyName: row.company_name,
    fullName: row.full_name,
    primaryEmail: row.primary_email,
    attorneyCount: rules.length,
    coverageStates,
    solCriteria,
    rules,
    searchText: `${label} ${row.primary_email ?? ""} ${row.full_name ?? ""} broker profile ${coverageStates.join(" ")} ${solSearchText}`,
  };
};

const sortBrokerProfileOptions = (
  left: BrokerProfileLeadFilterOption,
  right: BrokerProfileLeadFilterOption,
) => left.label.localeCompare(right.label);

export function useBrokerProfileLeadFilterOptions() {
  const [options, setOptions] = useState<BrokerProfileLeadFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchBrokerProfileOptions = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabaseClient = supabase as unknown as SupabaseFilterClient;
        const [profilesResult, attorneysResult] = await Promise.all([
          supabaseClient
            .from("broker_profiles")
            .select("user_id,company_name,full_name,primary_email")
            .order("company_name", { ascending: true, nullsFirst: false }) as SupabaseQueryChain<BrokerProfileFilterRow>,
          supabaseClient
            .from("broker_attorneys")
            .select("id,broker_id,attorney_name,coverage_states,coverage_sol_criteria,is_active,deleted_at")
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("attorney_name", { ascending: true, nullsFirst: false }) as SupabaseQueryChain<BrokerAttorneyCoverageRow>,
        ]);

        if (cancelled) return;

        if (profilesResult.error) throw profilesResult.error;
        if (attorneysResult.error) throw attorneysResult.error;

        const rulesByBrokerId = new Map<string, BrokerAttorneyCoverageRule[]>();
        for (const row of attorneysResult.data ?? []) {
          const brokerId = String(row.broker_id ?? "").trim();
          if (!brokerId) continue;

          const rule = toCoverageRule(row);
          if (!rule) continue;

          rulesByBrokerId.set(brokerId, [...(rulesByBrokerId.get(brokerId) ?? []), rule]);
        }

        const nextOptions = (profilesResult.data ?? [])
          .map((profile) => toBrokerProfileOption(profile, rulesByBrokerId.get(String(profile.user_id ?? "").trim()) ?? []))
          .filter(Boolean)
          .sort(sortBrokerProfileOptions) as BrokerProfileLeadFilterOption[];

        setOptions(nextOptions);
      } catch (fetchError) {
        console.error("Failed to fetch broker profile lead filter options:", fetchError);
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch broker profile filter options");
        setOptions([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchBrokerProfileOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({ options, loading, error }), [options, loading, error]);
}
