import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSolPeriodLabel, sortSolPeriods, type SolPeriod } from "@/lib/solPeriods";

type BrokerSolOption = {
  value: SolPeriod;
  label: string;
  searchText: string;
};

type LawyerRequirementSolRow = {
  sol: string | null;
};

type LawyerRequirementsSolQueryClient = {
  from: (table: "lawyer_requirements") => {
    select: (columns: "sol") => {
      eq: (
        column: "lawyer_type",
        value: "broker_lawyer",
      ) => Promise<{ data: LawyerRequirementSolRow[] | null; error: { message?: string } | null }>;
    };
  };
};

export function useBrokerSolFilterOptions() {
  const [solPeriods, setSolPeriods] = useState<SolPeriod[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchBrokerSolPeriods = async () => {
      const { data, error } = await (supabase as unknown as LawyerRequirementsSolQueryClient)
        .from("lawyer_requirements")
        .select("sol")
        .eq("lawyer_type", "broker_lawyer");

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch broker SOL filters:", error);
        setSolPeriods([]);
        return;
      }

      setSolPeriods(sortSolPeriods((data ?? []).map((row) => row.sol ?? "")));
    };

    fetchBrokerSolPeriods();

    return () => {
      cancelled = true;
    };
  }, []);

  const solOptions = useMemo<BrokerSolOption[]>(
    () =>
      solPeriods.map((period) => ({
        value: period,
        label: getSolPeriodLabel(period),
        searchText: `${period} ${getSolPeriodLabel(period)}`,
      })),
    [solPeriods],
  );

  return useMemo(() => ({ solOptions, solPeriods }), [solOptions, solPeriods]);
}
