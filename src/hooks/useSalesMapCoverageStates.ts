import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSalesMapCoverageStates() {
  const [unblockedStateCodes, setUnblockedStateCodes] = useState<Set<string>>(new Set());

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

      const next = new Set(
        (data ?? [])
          .map((row) => (row.state_code || "").trim().toUpperCase())
          .filter(Boolean)
      );

      setUnblockedStateCodes(next);
    };

    fetchCoverageStates();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({ unblockedStateCodes }), [unblockedStateCodes]);
}
