import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AttorneyProfile = {
  user_id: string;
  full_name: string | null;
  primary_email: string | null;
  availability_status: string | null;
  case_rate_per_deal: number | null;
  direct_phone?: string | null;
  licensed_states?: string[] | null;
  criteria?: string | null;
};

export const useAttorneys = () => {
  const [attorneys, setAttorneys] = useState<AttorneyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const supabaseUntyped = supabase as unknown as {
        from: (
          table: string
        ) => {
          select: (
            cols: string
          ) => {
            order: (
              column: string,
              opts: { ascending: boolean; nullsFirst?: boolean }
            ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
          };
        };
      };

      const extendedSelect =
        "user_id,full_name,primary_email,availability_status,case_rate_per_deal,direct_phone,licensed_states,criteria";
      const baseSelect = "user_id,full_name,primary_email,availability_status,case_rate_per_deal";

      let data: unknown[] | null = null;
      let queryError: { message?: string } | null = null;

      const extended = await supabaseUntyped
        .from("attorney_profiles")
        .select(extendedSelect)
        .order("full_name", { ascending: true, nullsFirst: false });

      data = extended.data;
      queryError = extended.error;

      if (queryError) {
        const fallback = await supabaseUntyped
          .from("attorney_profiles")
          .select(baseSelect)
          .order("full_name", { ascending: true, nullsFirst: false });

        data = fallback.data;
        queryError = fallback.error;
      }

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message ?? "Failed to load attorneys");
        setAttorneys([]);
        setLoading(false);
        return;
      }

      setAttorneys((data ?? []) as AttorneyProfile[]);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { attorneys, loading, error };
};
