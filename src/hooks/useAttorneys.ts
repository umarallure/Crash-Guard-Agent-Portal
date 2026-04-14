import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type AttorneyAccountType = "broker_lawyer" | "internal_lawyer";

export type AttorneyProfile = {
  id?: string;
  user_id: string;
  full_name: string | null;
  primary_email: string | null;
  availability_status: string | null;
  case_rate_per_deal: number | null;
  direct_phone?: string | null;
  licensed_states?: string[] | null;
  criteria?: string | null;
  account_type?: AttorneyAccountType | null;
};

type UseAttorneysOptions = {
  accountType?: AttorneyAccountType;
};

export const useAttorneys = (options: UseAttorneysOptions = {}) => {
  const [attorneys, setAttorneys] = useState<AttorneyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { accountType } = options;

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
            eq: (column: string, value: string) => {
              order: (
                column: string,
                opts: { ascending: boolean; nullsFirst?: boolean }
              ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
            };
            order: (
              column: string,
              opts: { ascending: boolean; nullsFirst?: boolean }
            ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
          };
        };
      };

      const buildQuery = (cols: string) => {
        const baseQuery = supabaseUntyped.from("attorney_profiles").select(cols);
        const filteredQuery = accountType ? baseQuery.eq("account_type", accountType) : baseQuery;

        return filteredQuery.order("full_name", { ascending: true, nullsFirst: false });
      };

      const extendedSelect =
        "id,user_id,full_name,primary_email,availability_status,case_rate_per_deal,direct_phone,licensed_states,criteria,account_type";
      const baseSelect = "id,user_id,full_name,primary_email,availability_status,case_rate_per_deal,account_type";

      let data: unknown[] | null = null;
      let queryError: { message?: string } | null = null;

      const extended = await buildQuery(extendedSelect);

      data = extended.data;
      queryError = extended.error;

      if (queryError) {
        const fallback = await buildQuery(baseSelect);

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
  }, [accountType]);

  return { attorneys, loading, error };
};
