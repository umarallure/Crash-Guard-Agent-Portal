import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CenterInfo {
  id: string;
  center_name: string;
  lead_vendor: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active?: boolean | null;
}

export const useCenters = () => {
  const [centers, setCenters] = useState<CenterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchCenters = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const client = supabase as unknown as {
        from: (
          table: string
        ) => {
          select: (
            columns: string
          ) => {
            order: (
              column: string,
              opts: { ascending: boolean }
            ) => Promise<{ data: CenterInfo[] | null; error: unknown }>;
          };
        };
      };

      const { data, error: queryError } = await client
        .from("centers")
        .select("id, center_name, lead_vendor, contact_email, contact_phone, is_active")
        .order("center_name", { ascending: true });

      if (queryError) {
        throw queryError;
      }

      setCenters(data || []);
    } catch (e) {
      setError(e);
      setCenters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

  const leadVendors = useMemo(() => {
    const unique = new Set<string>();
    for (const c of centers) {
      if (c.lead_vendor) unique.add(c.lead_vendor);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [centers]);

  const centerNames = useMemo(() => {
    const unique = new Set<string>();
    for (const c of centers) {
      if (c.center_name) unique.add(c.center_name);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [centers]);

  return {
    centers,
    leadVendors,
    centerNames,
    loading,
    error,
    refetch: fetchCenters,
  };
};
