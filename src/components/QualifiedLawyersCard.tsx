import { useEffect, useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Send,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQualifiedLawyers, QualifiedLawyer } from "@/hooks/useQualifiedLawyers";
import { formatStateFilterLabel, getStateMatchToken } from "@/lib/stateFilter";
import { toast } from "sonner";

export type SelectedLawyer =
  | (QualifiedLawyer & { isNoCoverage?: false })
  | {
      id: "nocoverage";
      attorney_name: "No Coverage";
      isNoCoverage: true;
      allRequirementsMet: false;
    };

interface QualifiedLawyersCardProps {
  leadState?: string;
  accidentDate?: Date;
  policeReport?: boolean | string;
  insuranceDocuments?: boolean | string;
  medicalTreatmentProof?: boolean | string;
  driverLicense?: boolean | string;
  selectedLawyerId?: string;
  onLawyerSelect?: (lawyer: SelectedLawyer | null) => void;
  submissionStatus?: "pending" | "submitted" | "rejected";
  hideHeader?: boolean;
}

const minimumRailCards = 4;
const railTrackClass =
  "flex items-start gap-3 overflow-x-auto pb-2 pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 [&::-webkit-scrollbar-track]:bg-transparent";
const railCardShellClass = "flex h-[17rem] w-[18rem] shrink-0 flex-col";
const railAnimation = (index: number) =>
  ({
    className: "animate-fade-in-up motion-reduce:animate-none",
    style: { animationDelay: `${Math.min(index, 5) * 70}ms` },
  }) as const;

export const QualifiedLawyersCard = ({
  leadState,
  accidentDate,
  policeReport,
  insuranceDocuments,
  medicalTreatmentProof,
  driverLicense,
  selectedLawyerId,
  onLawyerSelect,
  hideHeader = false,
}: QualifiedLawyersCardProps) => {
  const { qualifiedLawyers, loading, error } = useQualifiedLawyers({
    state: leadState,
    accidentDate,
    policeReport,
    insuranceDocuments,
    medicalTreatmentProof,
    driverLicense,
  }, {
    lawyerType: "broker_lawyer",
  });

  const leadStateLabel = useMemo(
    () => getStateMatchToken(leadState) || formatStateFilterLabel(leadState),
    [leadState],
  );

  const brokerEligibleLawyers = useMemo(
    () => qualifiedLawyers.filter((lawyer) => lawyer.isStateMatch && lawyer.isSolMatch),
    [qualifiedLawyers],
  );

  const availableLawyers = useMemo(
    () => brokerEligibleLawyers.filter((lawyer) => lawyer.allRequirementsMet),
    [brokerEligibleLawyers],
  );

  const partiallyMatchedLawyers = useMemo(
    () => brokerEligibleLawyers.filter((lawyer) => !lawyer.allRequirementsMet),
    [brokerEligibleLawyers],
  );

  const excludedLawyers = useMemo(
    () => qualifiedLawyers.filter((lawyer) => !lawyer.isStateMatch || !lawyer.isSolMatch),
    [qualifiedLawyers],
  );

  const selectedLawyer =
    selectedLawyerId && selectedLawyerId !== "nocoverage"
      ? availableLawyers.find((l) => l.id === selectedLawyerId) ||
        partiallyMatchedLawyers.find((l) => l.id === selectedLawyerId)
      : null;

  const brokerRailLawyers = useMemo(
    () => [
      ...availableLawyers.map((lawyer) => ({ lawyer, tone: "available" as const })),
      ...partiallyMatchedLawyers
        .filter((lawyer) => !availableLawyers.some((availableLawyer) => availableLawyer.id === lawyer.id))
        .map((lawyer) => ({ lawyer, tone: "partial" as const })),
    ],
    [availableLawyers, partiallyMatchedLawyers],
  );

  useEffect(() => {
    if (!selectedLawyerId || selectedLawyerId === "nocoverage") return;

    const selectedLawyerStillVisible = brokerRailLawyers.some(({ lawyer }) => lawyer.id === selectedLawyerId);
    if (!selectedLawyerStillVisible) {
      onLawyerSelect?.(null);
    }
  }, [brokerRailLawyers, onLawyerSelect, selectedLawyerId]);

  const handleSelectLawyer = (lawyer: QualifiedLawyer) => {
    onLawyerSelect?.({ ...lawyer, isNoCoverage: false });
    toast.success(`Selected ${lawyer.attorney_name}`);
  };

  const handleDeselectLawyer = () => {
    onLawyerSelect?.(null);
  };

  const renderReasonRow = (label: string, positive: boolean, key: string) => {
    const Icon = positive ? CheckCircle2 : XCircle;

    return (
      <div key={key} className="flex items-center gap-1.5">
        <Icon className={`h-3 w-3 shrink-0 ${positive ? "text-emerald-600" : "text-rose-500"}`} />
        <span className="text-xs leading-snug text-slate-600">{label}</span>
      </div>
    );
  };

  const getSolChipLabel = (lawyer: QualifiedLawyer) => {
    if (!lawyer.sol) return "Open";
    if (!lawyer.solStatus || lawyer.solStatus.monthsRemaining === undefined) {
      return lawyer.sol.replace("month", " mo");
    }
    if (lawyer.solStatus.valid) {
      return `${lawyer.solStatus.monthsRemaining} mo`;
    }
    return "Expired";
  };

  const buildLawyerNotes = (lawyer: QualifiedLawyer) => {
    const notes: Array<{ label: string; positive: boolean }> = [];

    if (leadStateLabel) {
      notes.push({
        label: `State ${lawyer.isStateMatch ? "match" : "mismatch"}: ${leadStateLabel}`,
        positive: lawyer.isStateMatch,
      });
    }

    if (lawyer.sol) {
      const monthsRemaining = lawyer.solStatus?.monthsRemaining;
      notes.push({
        label:
          lawyer.solStatus?.valid === false
            ? "SOL expired for this lead"
            : typeof monthsRemaining === "number"
              ? `SOL valid: ${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"} remaining`
              : "SOL requirement met",
        positive: lawyer.isSolMatch,
      });
    }

    if (lawyer.police_report === "yes") {
      notes.push({
        label: lawyer.isPoliceReportMatch ? "Police report ready" : "Police report required",
        positive: lawyer.isPoliceReportMatch,
      });
    }

    if (lawyer.insurance_report === "yes") {
      notes.push({
        label: lawyer.isInsuranceReportMatch ? "Insurance documents ready" : "Insurance documents required",
        positive: lawyer.isInsuranceReportMatch,
      });
    }

    if (lawyer.medical_report === "yes") {
      notes.push({
        label: lawyer.isMedicalReportMatch ? "Medical proof ready" : "Medical proof required",
        positive: lawyer.isMedicalReportMatch,
      });
    }

    if (lawyer.driver_id === "yes") {
      notes.push({
        label: lawyer.isDriverIdMatch ? "Driver ID ready" : "Driver ID required",
        positive: lawyer.isDriverIdMatch,
      });
    }

    return notes.slice(0, 3);
  };

  const renderPlaceholderCard = (slotIndex: number) => (
    <div
      key={`incoming-lawyer-${slotIndex}`}
      className={`${railCardShellClass} items-center justify-center rounded-xl border border-dashed border-slate-200/80 bg-slate-50/40 px-5 py-10 ${railAnimation(slotIndex).className}`}
      style={railAnimation(slotIndex).style}
    >
      <div className="h-8 w-8 rounded-full border-2 border-dashed border-slate-200/60" />
      <span className="mt-3 text-xs text-muted-foreground/70">Awaiting match</span>
    </div>
  );

  const renderNoMatchCard = () => {
    const hasExcludedLawyers = excludedLawyers.length > 0;

    const noMatchDescription = hasExcludedLawyers
      ? "Lawyers were hidden due to state or SOL mismatch."
      : "No fully matched lawyers for this lead yet.";

    return (
      <div
        key="no-lawyer-match"
        className={`${railCardShellClass} justify-between rounded-xl border border-dashed border-slate-300/80 bg-[linear-gradient(180deg,rgba(243,244,246,0.96)_0%,rgba(255,255,255,0.98)_100%)] p-4 ${railAnimation(0).className}`}
        style={railAnimation(0).style}
      >
        <div className="space-y-3">
          <Badge className="rounded-full bg-[#2c3139] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#2c3139]">
            No Exact Match
          </Badge>

          <div>
            <div className="text-sm font-semibold text-foreground">No fully matched lawyers</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{noMatchDescription}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.5 font-medium text-slate-600">
              {leadStateLabel || "Unknown"}
            </span>
            {hasExcludedLawyers ? (
              <span className="rounded-full border border-rose-200/80 bg-rose-50/80 px-2 py-0.5 font-medium text-rose-600">
                {excludedLawyers.length} hidden
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200/80 py-2.5">
          <div className="h-2 w-2 rounded-full border border-slate-300/80" />
          <span className="text-xs text-muted-foreground">Awaiting match</span>
        </div>
      </div>
    );
  };

  const renderLawyerCard = (lawyer: QualifiedLawyer, tone: "available" | "partial", rank: number) => {
    const isSelected = lawyer.id === selectedLawyerId;
    const notes = buildLawyerNotes(lawyer);
    const needsDocs =
      (lawyer.police_report === "yes" && !lawyer.isPoliceReportMatch) ||
      (lawyer.insurance_report === "yes" && !lawyer.isInsuranceReportMatch) ||
      (lawyer.medical_report === "yes" && !lawyer.isMedicalReportMatch) ||
      (lawyer.driver_id === "yes" && !lawyer.isDriverIdMatch);

    const borderTone = isSelected
      ? "border-[#4b5563] ring-1 ring-[#374151]/60"
      : "border-slate-200/90 hover:border-slate-300";
    const bgTone = isSelected
      ? "bg-[linear-gradient(180deg,rgba(55,65,81,0.10)_0%,rgba(255,255,255,0.98)_100%)]"
      : tone === "available"
        ? "bg-[linear-gradient(180deg,rgba(243,244,246,0.92)_0%,rgba(255,255,255,0.98)_100%)]"
        : "bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.98)_100%)]";

    return (
      <div
        key={lawyer.id}
        className={`${railCardShellClass} justify-between rounded-xl border p-4 transition-all ${borderTone} ${bgTone} ${railAnimation(rank - 1).className}`}
        style={railAnimation(rank - 1).style}
      >
        <div className="min-w-0 space-y-3">
          {/* Badges */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground">#{String(rank).padStart(2, "0")}</span>
            <Badge className={
              tone === "available"
                ? "rounded-full bg-[#2c3139] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#2c3139]"
                : "rounded-full border border-slate-300/90 bg-slate-100 px-2 py-0 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
            }>
              {tone === "available" ? "Ready" : "Needs Review"}
            </Badge>
            {isSelected ? (
              <Badge className="rounded-full bg-[#2c3139] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#2c3139]">
                Selected
              </Badge>
            ) : null}
          </div>

          {/* Attorney info */}
          <div>
            <div className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
              {lawyer.attorney_name}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{lawyer.did_number || "No DID"}</span>
              <span className="text-slate-300">|</span>
              <span className={`font-medium ${lawyer.isSolMatch ? "text-foreground" : "text-rose-600"}`}>
                SOL: {getSolChipLabel(lawyer)}
              </span>
            </div>
          </div>

          {/* States */}
          <div className="text-xs leading-snug text-foreground">
            {lawyer.states?.length ? lawyer.states.join(", ") : "No states listed"}
          </div>

          {/* Docs + match notes */}
          <div className="space-y-1.5 border-t border-slate-200/60 pt-2.5">
            <div className="flex items-center gap-1.5">
              {needsDocs ? (
                <XCircle className="h-3 w-3 shrink-0 text-rose-500" />
              ) : (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
              )}
              <span className="text-xs text-slate-600">
                Docs {needsDocs ? "need review" : "ready"}
              </span>
            </div>
            {notes.map((note, index) =>
              renderReasonRow(note.label, note.positive, `${lawyer.id}-${note.label}-${index}`),
            )}
          </div>
        </div>

        <Button
          type="button"
          onClick={() => (isSelected ? handleDeselectLawyer() : handleSelectLawyer(lawyer))}
          className={`mt-3 w-full rounded-lg ${
            isSelected
              ? "bg-slate-700 text-white hover:bg-slate-800"
              : "bg-[#2c3139] text-white hover:bg-[#1f242b]"
          }`}
        >
          {isSelected ? (
            <>
              Selected Lawyer
              <CheckCircle2 className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Select Lawyer
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>
    );
  };

  const renderRail = (
    entries: Array<{ lawyer: QualifiedLawyer; tone: "available" | "partial" }>,
    prefix: string,
    includeNoMatchCard = false,
  ) => {
    const placeholders = Math.max(0, minimumRailCards - entries.length - (includeNoMatchCard ? 1 : 0));

    return (
      <div className={railTrackClass}>
        {includeNoMatchCard ? renderNoMatchCard() : null}
        {entries.map(({ lawyer, tone }, index) => renderLawyerCard(lawyer, tone, index + 1))}
        {Array.from({ length: placeholders }, (_, index) => renderPlaceholderCard(Number(`${prefix.length}${index}`)))}
      </div>
    );
  };

  const sectionHeader = (
    <div className="flex items-start justify-between gap-4 rounded-[20px] bg-[linear-gradient(90deg,rgba(31,41,55,0.18)_0%,rgba(31,41,55,0.1)_12%,rgba(255,255,255,0)_34%)] px-4 py-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold tracking-tight text-slate-950">
          Available Lawyers
        </div>
        <div className="text-xs text-slate-600">
          Choose the best-fit submission lawyer from the current qualified matches.
        </div>
      </div>
      <Badge className="rounded-full bg-[#2c3139] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white hover:bg-[#2c3139]">
        {availableLawyers.length} exact
      </Badge>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {!hideHeader ? sectionHeader : null}
        <div className={railTrackClass}>
          {Array.from({ length: minimumRailCards }, (_, index) => renderPlaceholderCard(index))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {!hideHeader ? sectionHeader : null}
        <div className="rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
          Error loading lawyers: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideHeader ? sectionHeader : null}

      <div className="space-y-4">
        {selectedLawyer ? (
          <div className="flex flex-col gap-3 rounded-[20px] border border-slate-300 bg-[linear-gradient(180deg,rgba(51,65,85,0.12)_0%,rgba(255,255,255,0.96)_62%,rgba(255,255,255,1)_100%)] p-3.5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.26)] sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-950">
                <CheckCircle2 className="h-4.5 w-4.5 text-slate-700" />
                <span className="text-sm font-semibold">Selected: {selectedLawyer.attorney_name}</span>
              </div>
              <div className="text-sm text-slate-600">
                DID: {selectedLawyer.did_number || "Not listed"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedLawyer.submission_link ? (
                <Button size="sm" className="rounded-md bg-[#2c3139] text-white hover:bg-[#1f242b]" asChild>
                  <a href={selectedLawyer.submission_link} target="_blank" rel="noopener noreferrer">
                    <Send className="mr-1 h-4 w-4" />
                    Submission Portal
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleDeselectLawyer}
                className="rounded-md border-slate-300 bg-white/90 text-slate-700 hover:border-[#2c3139] hover:bg-[#2c3139] hover:text-white"
              >
                Deselect
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Matching Lawyers
            </div>
            <div className="text-xs text-slate-500">
              {brokerRailLawyers.length > 0
                ? `${availableLawyers.length} ready${
                    partiallyMatchedLawyers.length > 0 ? `, ${partiallyMatchedLawyers.length} need review` : ""
                  }`
                : "Waiting for broker matches"}
            </div>
          </div>

          {renderRail(
            brokerRailLawyers,
            brokerRailLawyers.length > 0 ? "broker" : "empty",
            availableLawyers.length === 0,
          )}
        </div>
      </div>
    </div>
  );
};

type QualifiedLawyersCardPropsProps = QualifiedLawyersCardProps;
