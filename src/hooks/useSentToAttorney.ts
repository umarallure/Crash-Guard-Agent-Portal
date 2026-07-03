import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { SentToAttorney } from "@/components/portal/SentToAttorneyBadge";

export type SentToResolvableRow = {
  id: string;
  assigned_attorney_id?: string | null;
  assigned_broker_attorney_id?: string | null;
};

type UntypedSelect = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[],
      ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
    };
  };
};

const supabaseUntyped = supabase as unknown as UntypedSelect;

const uniqueTrimmed = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).sort();

/**
 * Resolves which attorney each lead was sent to.
 *
 * A lead carries either `assigned_attorney_id` (an internal lawyer, an auth.users id)
 * or `assigned_broker_attorney_id` (a broker_attorneys id) — never both. Internal names
 * come from attorney_profiles. Broker names are resolved through the RLS-readable
 * projection (broker_attorney_requirement_links -> lawyer_requirements.attorney_name),
 * because broker_attorneys itself is not readable by sales agents.
 */
export const useSentToAttorney = (
  rows: SentToResolvableRow[],
): Map<string, SentToAttorney> => {
  const [internalNames, setInternalNames] = useState<Map<string, string>>(new Map());
  const [brokerNames, setBrokerNames] = useState<Map<string, string>>(new Map());

  const internalIds = useMemo(
    () => uniqueTrimmed(rows.map((row) => row.assigned_attorney_id)),
    [rows],
  );
  const brokerAttorneyIds = useMemo(
    () => uniqueTrimmed(rows.map((row) => row.assigned_broker_attorney_id)),
    [rows],
  );

  const internalKey = internalIds.join(",");
  const brokerKey = brokerAttorneyIds.join(",");

  useEffect(() => {
    let cancelled = false;

    if (!internalIds.length) {
      setInternalNames(new Map());
      return;
    }

    void (async () => {
      const { data, error } = await supabaseUntyped
        .from("attorney_profiles")
        .select("user_id, full_name, primary_email")
        .in("user_id", internalIds);

      if (cancelled || error) return;

      const nextMap = new Map<string, string>();
      for (const entry of (data ?? []) as Array<Record<string, unknown>>) {
        const userId = String(entry.user_id ?? "").trim();
        const label =
          String(entry.full_name ?? "").trim() || String(entry.primary_email ?? "").trim();
        if (userId && label) nextMap.set(userId, label);
      }
      setInternalNames(nextMap);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internalKey]);

  useEffect(() => {
    let cancelled = false;

    if (!brokerAttorneyIds.length) {
      setBrokerNames(new Map());
      return;
    }

    void (async () => {
      const { data: links, error: linksError } = await supabaseUntyped
        .from("broker_attorney_requirement_links")
        .select("broker_attorney_id, lawyer_requirement_id")
        .in("broker_attorney_id", brokerAttorneyIds);

      if (cancelled || linksError) return;

      const linkRows = (links ?? []) as Array<Record<string, unknown>>;
      const requirementIds = uniqueTrimmed(
        linkRows.map((row) => String(row.lawyer_requirement_id ?? "")),
      );

      const nameByRequirementId = new Map<string, string>();
      if (requirementIds.length) {
        const { data: requirements, error: requirementsError } = await supabaseUntyped
          .from("lawyer_requirements")
          .select("id, attorney_name")
          .in("id", requirementIds);

        if (cancelled || requirementsError) return;

        for (const entry of (requirements ?? []) as Array<Record<string, unknown>>) {
          const id = String(entry.id ?? "").trim();
          const name = String(entry.attorney_name ?? "").trim();
          if (id && name) nameByRequirementId.set(id, name);
        }
      }

      const nextMap = new Map<string, string>();
      for (const row of linkRows) {
        const brokerAttorneyId = String(row.broker_attorney_id ?? "").trim();
        const requirementId = String(row.lawyer_requirement_id ?? "").trim();
        const name = nameByRequirementId.get(requirementId);
        if (brokerAttorneyId && name) nextMap.set(brokerAttorneyId, name);
      }
      setBrokerNames(nextMap);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerKey]);

  return useMemo(() => {
    const result = new Map<string, SentToAttorney>();

    for (const row of rows) {
      const internalId = String(row.assigned_attorney_id ?? "").trim();
      const brokerAttorneyId = String(row.assigned_broker_attorney_id ?? "").trim();

      if (internalId) {
        result.set(row.id, {
          label: internalNames.get(internalId) || "Assigned attorney",
          channel: "internal",
        });
      } else if (brokerAttorneyId) {
        result.set(row.id, {
          label: brokerNames.get(brokerAttorneyId) || "Broker attorney",
          channel: "broker",
        });
      }
    }

    return result;
  }, [rows, internalNames, brokerNames]);
};
