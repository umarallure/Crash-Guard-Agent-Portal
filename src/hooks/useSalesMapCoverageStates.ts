import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SALES_MAP_ACTIVE_STATE_CODE_SET } from "@/lib/salesMapActiveStates";

export function useSalesMapCoverageStates() {
  const [unblockedStateCodes, setUnblockedStateCodes] = useState<Set<string>>(
    () => new Set(SALES_MAP_ACTIVE_STATE_CODE_SET)
  );

  useEffect(() => {
    let cancelled = false;

    const fetchCoverageStates = async () => {
      const { data, error } = await supabase
        .from("sales_map_states")
        .select("state_code")
        .eq("availability_status", "unblocked");

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch sales map coverage states:", error);
        return;
      }

      const next = new Set(SALES_MAP_ACTIVE_STATE_CODE_SET);
      (data ?? [])
        .map((row) => (row.state_code || "").trim().toUpperCase())
        .filter(Boolean)
        .forEach((code) => next.add(code));

      setUnblockedStateCodes(next);
    };

    fetchCoverageStates();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({ unblockedStateCodes }), [unblockedStateCodes]);
}
