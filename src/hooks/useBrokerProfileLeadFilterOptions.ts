import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { normalizeAttorneyCoverageStates } from "@/lib/attorneyLeadFilter";
import {
  getBrokerRequirementSolLabel,
  mapBrokerRequirementSolToSolPeriod,
  type BrokerAttorneyRequirementRule,
  type BrokerProfileLeadFilterOption,
} from "@/lib/brokerProfileLeadFilter";

type BrokerProfileFilterRow = {
  user_id: string | null;
  company_name: string | null;
  full_name: string | null;
  primary_email: string | null;
};

type BrokerAttorneyRequirementLinkRow = {
  broker_id: string | null;
  broker_attorney_id: string | null;
  lawyer_requirement_id: string | null;
};

type LawyerRequirementFilterRow = {
  id: string | null;
  attorney_id: string | null;
  attorney_name: string | null;
  lawyer_type: string | null;
  states: unknown;
  sol: string | null;
  is_active: boolean | null;
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

const toRequirementRule = (
  row: LawyerRequirementFilterRow,
  link: BrokerAttorneyRequirementLinkRow,
): BrokerAttorneyRequirementRule | null => {
  const id = String(row.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    brokerAttorneyId: String(link.broker_attorney_id ?? "").trim() || null,
    attorneyName: String(row.attorney_name ?? "").trim() || null,
    states: normalizeAttorneyCoverageStates(row.states),
    sol: String(row.sol ?? "").trim() || null,
    isActive: row.is_active,
  };
};

const toBrokerProfileOption = (
  row: BrokerProfileFilterRow,
  rules: BrokerAttorneyRequirementRule[],
): BrokerProfileLeadFilterOption | null => {
  const userId = String(row.user_id ?? "").trim();
  if (!userId || rules.length === 0) return null;

  const label = buildBrokerLabel(row);
  const coverageStates = uniqueSorted(rules.flatMap((rule) => rule.states));
  const solCriteria = uniqueSorted(
    rules
      .map((rule) => rule.sol)
      .filter((criteria) => Boolean(mapBrokerRequirementSolToSolPeriod(criteria))),
  );
  const solSearchText = solCriteria.map(getBrokerRequirementSolLabel).join(" ");
  const attorneyCount = new Set(
    rules.map((rule) => rule.brokerAttorneyId || rule.id).filter(Boolean),
  ).size;

  return {
    id: `broker-profile:${userId}`,
    label,
    sourceId: userId,
    companyName: row.company_name,
    fullName: row.full_name,
    primaryEmail: row.primary_email,
    attorneyCount,
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
        const [profilesResult, linksResult, requirementsResult] = await Promise.all([
          supabaseClient
            .from("broker_profiles")
            .select("user_id,company_name,full_name,primary_email")
            .order("company_name", { ascending: true, nullsFirst: false }) as SupabaseQueryChain<BrokerProfileFilterRow>,
          supabaseClient
            .from("broker_attorney_requirement_links")
            .select("broker_id,broker_attorney_id,lawyer_requirement_id")
            .order("broker_id", { ascending: true, nullsFirst: false }) as SupabaseQueryChain<BrokerAttorneyRequirementLinkRow>,
          supabaseClient
            .from("lawyer_requirements")
            .select("id,attorney_id,attorney_name,lawyer_type,states,sol,is_active")
            .eq("lawyer_type", "broker_lawyer")
            .eq("is_active", true)
            .order("attorney_name", { ascending: true, nullsFirst: false }) as SupabaseQueryChain<LawyerRequirementFilterRow>,
        ]);

        if (cancelled) return;

        if (profilesResult.error) throw profilesResult.error;
        if (linksResult.error) throw linksResult.error;
        if (requirementsResult.error) throw requirementsResult.error;

        const requirementById = new Map(
          (requirementsResult.data ?? [])
            .map((requirement) => [String(requirement.id ?? "").trim(), requirement] as const)
            .filter(([requirementId]) => Boolean(requirementId)),
        );
        const rulesByBrokerId = new Map<string, BrokerAttorneyRequirementRule[]>();
        for (const link of linksResult.data ?? []) {
          const brokerId = String(link.broker_id ?? "").trim();
          if (!brokerId) continue;

          const requirementId = String(link.lawyer_requirement_id ?? "").trim();
          const requirement = requirementById.get(requirementId);
          if (!requirement) continue;

          const rule = toRequirementRule(requirement, link);
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
