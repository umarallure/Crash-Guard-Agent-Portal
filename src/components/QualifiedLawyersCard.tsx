import { useMemo } from "react";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Send,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQualifiedLawyers, QualifiedLawyer } from "@/hooks/useQualifiedLawyers";
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
  "flex items-start gap-3.5 overflow-x-auto pb-2 pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 [&::-webkit-scrollbar-track]:bg-transparent";
const railCardShellClass =
  "flex h-[19.5rem] w-[20rem] shrink-0 flex-col justify-between rounded-[22px] border p-4 shadow-sm transition-all";
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
  const { availableLawyers, partiallyMatchedLawyers, loading, error } = useQualifiedLawyers({
    state: leadState,
    accidentDate,
    policeReport,
    insuranceDocuments,
    medicalTreatmentProof,
    driverLicense,
  });

  const leadStateLabel = useMemo(() => String(leadState ?? "").trim().toUpperCase(), [leadState]);

  const isNoCoverageSelected = selectedLawyerId === "nocoverage";

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

  const handleSelectLawyer = (lawyer: QualifiedLawyer) => {
    onLawyerSelect?.({ ...lawyer, isNoCoverage: false });
    toast.success(`Selected ${lawyer.attorney_name}`);
  };

  const handleSelectNoCoverage = () => {
    onLawyerSelect?.({
      id: "nocoverage",
      attorney_name: "No Coverage",
      isNoCoverage: true,
      allRequirementsMet: false,
    } as SelectedLawyer);
    toast.info("Selected: No Coverage");
  };

  const handleDeselectLawyer = () => {
    onLawyerSelect?.(null);
  };

  const renderStatChip = (
    label: string,
    value: string,
    tone: "neutral" | "positive" | "negative" = "neutral",
  ) => {
    const toneClass =
      tone === "positive"
        ? "border-emerald-200/80 bg-emerald-50/85 text-emerald-700"
        : tone === "negative"
          ? "border-rose-200/80 bg-rose-50/90 text-rose-700"
          : "border-slate-200/80 bg-white/88 text-slate-700";

    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ${toneClass}`}
      >
        <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
    );
  };

  const renderInternalStyleChip = (label: string, value: string) => (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );

  const renderReasonRow = (label: string, positive: boolean, key: string) => {
    const Icon = positive ? CheckCircle2 : XCircle;

    return (
      <div key={key} className="flex items-start gap-2 text-sm text-slate-600">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${positive ? "text-emerald-600" : "text-rose-500"}`} />
        <span className="leading-5">{label}</span>
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
      className={`${railCardShellClass} self-start overflow-hidden border border-dashed border-slate-200/80 bg-[linear-gradient(180deg,rgba(244,246,248,0.96)_0%,rgba(255,255,255,0.98)_100%)] ${railAnimation(slotIndex).className}`}
      style={railAnimation(slotIndex).style}
    >
      <div className="min-w-0 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>

        <div className="space-y-1.5 rounded-[18px] border border-slate-200/60 bg-white/90 px-3.5 py-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>

        <div className="min-h-[5.25rem] rounded-[18px] border border-dashed border-slate-200/70 bg-white/92 px-3 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Incoming Match
          </div>
          <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
            This slot fills automatically when another qualified broker match becomes available.
          </div>
        </div>
      </div>

      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );

  const renderNoMatchCard = () => {
    const hasPartialLawyers = partiallyMatchedLawyers.length > 0;

    return (
      <div
        key="no-lawyer-match"
        className={`${railCardShellClass} overflow-hidden border border-dashed border-slate-300/80 bg-[linear-gradient(180deg,rgba(243,244,246,0.96)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_18px_36px_-28px_rgba(31,41,55,0.22)] ${railAnimation(0).className}`}
        style={railAnimation(0).style}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <Badge className="rounded-full bg-[#2c3139] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#2c3139]">
              No Exact Match
            </Badge>
            <div className="rounded-full border border-slate-200/80 bg-white/90 px-2 py-1 text-right shadow-sm">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </span>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-foreground">Waiting</span>
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-slate-200/60 bg-white/90 px-3.5 py-3 shadow-sm">
            <div className="text-base font-semibold text-foreground">
              No fully matched lawyers are available right now
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              {hasPartialLawyers
                ? "You can review the broker lawyers in this rail or mark this lead as No Coverage."
                : "There are no lawyer requirements configured for this lead yet."}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {renderStatChip("Lead State", leadStateLabel || "Unknown")}
            {renderStatChip("Matches", "0 exact")}
            {renderStatChip("Partial", String(partiallyMatchedLawyers.length))}
            {renderStatChip("Next Step", hasPartialLawyers ? "Review" : "Configure")}
          </div>
        </div>

        {hasPartialLawyers ? (
          <Button
            type="button"
            variant={isNoCoverageSelected ? "default" : "outline"}
            className={`w-full rounded-md ${
              isNoCoverageSelected
                ? "bg-red-700 text-white hover:bg-red-800"
                : "border-red-300 bg-white text-red-700 hover:bg-red-50"
            }`}
            onClick={handleSelectNoCoverage}
          >
            <Ban className="h-4 w-4" />
            {isNoCoverageSelected ? "No Coverage Selected" : "Select No Coverage"}
          </Button>
        ) : (
          <div className="rounded-md border border-slate-200/90 bg-white/88 px-3 py-2 text-sm text-slate-500">
            Add or update lawyer requirements to populate this rail.
          </div>
        )}
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

    const cardToneClass = isSelected
      ? "border-[#4b5563] bg-[linear-gradient(180deg,rgba(55,65,81,0.12)_0%,rgba(255,255,255,0.98)_100%)] ring-1 ring-[#374151]/70 shadow-[0_20px_40px_-28px_rgba(31,41,55,0.34)]"
      : tone === "available"
        ? "border-slate-200/90 bg-[linear-gradient(180deg,rgba(243,244,246,0.92)_0%,rgba(255,255,255,0.98)_100%)] hover:border-slate-300"
        : "border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.98)_100%)] hover:border-slate-300";

    const statusBadgeClass =
      tone === "available"
        ? "rounded-full bg-[#2c3139] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#2c3139]"
        : "rounded-full border border-slate-300/90 bg-slate-100 px-2 py-0 text-[10px] font-semibold text-slate-700 hover:bg-slate-100";
    const selectedBadgeClass = "rounded-full bg-[#2c3139] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#2c3139]";

    return (
      <div
        key={lawyer.id}
        className={`${railCardShellClass} border ${cardToneClass} ${railAnimation(rank - 1).className}`}
        style={railAnimation(rank - 1).style}
      >
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] font-semibold">
                  #{String(rank).padStart(2, "0")}
                </Badge>
                <Badge className={statusBadgeClass}>{tone === "available" ? "Ready" : "Needs Review"}</Badge>
                {isSelected ? (
                  <Badge className={selectedBadgeClass}>
                    Selected
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className="line-clamp-2 text-base font-semibold leading-tight text-foreground">
                  {lawyer.attorney_name}
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">DID:</span>
                  <span className="font-mono text-sm text-foreground">{lawyer.did_number || "Not listed"}</span>
                </div>
                <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Licensed States
                </div>
                <div className="text-[13px] leading-5 text-foreground">
                  {lawyer.states?.length ? lawyer.states.join(", ") : "Not listed"}
                </div>
              </div>
            </div>

            <div className={`shrink-0 rounded-full border px-2 py-1 text-right shadow-sm ${isSelected ? "border-slate-300/90 bg-white/92" : "border-slate-200/80 bg-white/88"}`}>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  SOL
                </span>
                <span className={`text-[9.5px] font-bold uppercase tracking-[0.14em] ${lawyer.isSolMatch ? "text-foreground" : "text-rose-600"}`}>
                  {getSolChipLabel(lawyer)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex min-h-[2rem] flex-wrap gap-2">
            {renderInternalStyleChip("Docs", needsDocs ? "Needs Review" : "Ready")}
          </div>

          <div className="space-y-2 px-0.5 pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Match Notes
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {notes.length ? (
                notes.map((note, index) =>
                  renderReasonRow(note.label, note.positive, `${lawyer.id}-${note.label}-${index}`),
                )
              ) : (
                <div className="text-xs leading-5 text-muted-foreground">Ready for submission review.</div>
              )}
            </div>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => (isSelected ? handleDeselectLawyer() : handleSelectLawyer(lawyer))}
          className={`mt-1 w-full rounded-md ${
            isSelected
              ? "bg-slate-700 text-white hover:bg-slate-800"
              : "bg-[#2c3139] text-white hover:bg-[#1f242b]"
          }`}
        >
          {isSelected ? (
            <>
              Selected Lawyer
              <CheckCircle2 className="h-4 w-4" />
            </>
          ) : (
            <>
              Select Lawyer
              <ArrowRight className="h-4 w-4" />
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

        {isNoCoverageSelected ? (
          <div className="flex flex-col gap-3 rounded-[20px] border border-red-200 bg-red-50/90 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <Ban className="h-4.5 w-4.5" />
              Selected: No Coverage
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDeselectLawyer}
              className="rounded-md border-red-200 bg-white text-red-700 hover:bg-red-50"
            >
              Deselect
            </Button>
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

        {availableLawyers.length === 0 && partiallyMatchedLawyers.length === 0 ? (
          <div className="rounded-[18px] border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
            No lawyer requirements are configured yet for this lead flow.
          </div>
        ) : null}
      </div>
    </div>
  );
};

type QualifiedLawyersCardPropsProps = QualifiedLawyersCardProps;
