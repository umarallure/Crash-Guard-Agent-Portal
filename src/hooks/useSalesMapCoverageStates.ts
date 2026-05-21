import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SALES_MAP_ACTIVE_STATE_OPTION_CLASS } from "@/lib/salesMapActiveStates";
import { getStateFilterOptions, type StateFilterSourceRow } from "@/lib/stateFilter";

type SalesMapStateRow = Required<Pick<StateFilterSourceRow, "state_code" | "state_name" | "availability_status">>;

type SalesMapStatesQueryClient = {
  from: (table: "sales_map_states") => {
    select: (columns: "state_code, state_name, availability_status") => {
      order: (
        column: "state_name",
        options: { ascending: boolean },
      ) => Promise<{ data: SalesMapStateRow[] | null; error: { message?: string } | null }>;
    };
  };
};

export function useSalesMapCoverageStates() {
  const [salesMapStates, setSalesMapStates] = useState<SalesMapStateRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchCoverageStates = async () => {
      const { data, error } = await (supabase as unknown as SalesMapStatesQueryClient)
        .from("sales_map_states")
        .select("state_code, state_name, availability_status")
        .order("state_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch sales map coverage states:", error);
        return;
      }

      setSalesMapStates(data ?? []);
    };

    fetchCoverageStates();

    return () => {
      cancelled = true;
    };
  }, []);

  const stateOptions = useMemo(
    () =>
      getStateFilterOptions(salesMapStates).map((option) => ({
        ...option,
        itemClassName:
          option.availabilityStatus === "unblocked"
            ? SALES_MAP_ACTIVE_STATE_OPTION_CLASS
            : undefined,
      })),
    [salesMapStates],
  );

  const unblockedStateCodes = useMemo(
    () =>
      new Set(
        salesMapStates
          .filter((state) => state.availability_status === "unblocked")
          .map((state) => state.state_code.trim().toUpperCase())
          .filter(Boolean),
      ),
    [salesMapStates],
  );

  return useMemo(
    () => ({ stateOptions, unblockedStateCodes }),
    [stateOptions, unblockedStateCodes],
  );
}
