import { supabase } from "@/integrations/supabase/client";

export interface LinkedLeadSummary {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  status: string | null;
  lead_vendor: string | null;
  linked_lead_id: string | null;
  linked_relationship: string | null;
  /**
   * "child"  = that lead points at the current lead (e.g. a passenger created from it)
   * "parent" = the current lead points at that lead (the original/driver lead)
   */
  direction: "child" | "parent";
}

export const linkedRelationshipLabel = (relationship: string | null | undefined) => {
  if (relationship === "driver") return "Driver";
  if (relationship === "passenger") return "Passenger";
  return "Linked";
};

export const fetchLinkedLeads = async (lead: {
  id: string;
  linked_lead_id?: string | null;
}): Promise<LinkedLeadSummary[]> => {
  const parentId = (lead.linked_lead_id || "").trim();

  let query = supabase
    .from("leads")
    .select("id, submission_id, customer_full_name, status, lead_vendor, linked_lead_id, linked_relationship");

  query = parentId
    ? query.or(`linked_lead_id.eq.${lead.id},id.eq.${parentId}`)
    : query.eq("linked_lead_id", lead.id);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.id !== lead.id)
    .map((row) => ({
      id: row.id,
      submission_id: row.submission_id ?? null,
      customer_full_name: row.customer_full_name ?? null,
      status: row.status ?? null,
      lead_vendor: row.lead_vendor ?? null,
      linked_lead_id: row.linked_lead_id ?? null,
      linked_relationship: row.linked_relationship ?? null,
      direction: row.linked_lead_id === lead.id ? ("child" as const) : ("parent" as const),
    }));
};
