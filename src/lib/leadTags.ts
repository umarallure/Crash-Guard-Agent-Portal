export const LEAD_TAG_OPTIONS = [
  "Call Connected",
  "Call Drop",
  "Callback",
  "Resend",
] as const;

export type LeadTag = (typeof LEAD_TAG_OPTIONS)[number];

export const ALL_LEAD_TAGS_VALUE = "__ALL__";

export function isLeadTag(value: string | null | undefined): value is LeadTag {
  return LEAD_TAG_OPTIONS.includes((value || "") as LeadTag);
}

export function getLeadTagToneClass(tag: string | null | undefined): string {
  switch ((tag || "").trim()) {
    case "Call Connected":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Call Drop":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "Callback":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Resend":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
