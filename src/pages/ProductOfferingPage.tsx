import { useCallback, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileX,
  FileCheck,
  FileCheck2,
  FileBadge,
  HeartPulse,
  CalendarClock,
  Scale,
  Truck,
  Info,
} from "lucide-react";

type CaseCategory = "consumer" | "commercial";

type TierRow = {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
};

type TierCard = {
  name: string;
  headerBg: string;
  stripClass: string;
  cardBorder: string;
  btnClass: string;
  rows: TierRow[];
};

const TILT_MAX = 6;

const consumerTierCards: TierCard[] = [
  {
    name: "Tier 1 Transfer",
    headerBg: "bg-gray-100 dark:bg-gray-800",
    stripClass: "bg-gray-300 dark:bg-white/25",
    cardBorder: "hover:border-white/20 dark:hover:border-white/25",
    btnClass:
      "bg-black/5 border-black/10 text-gray-500 hover:bg-black/10 hover:border-black/20 hover:text-gray-700 dark:bg-white/6 dark:border-white/15 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:border-white/25 dark:hover:text-gray-200",
    rows: [
      { icon: FileX, label: "Documentation", value: "Minor Documentation Covered", sub: "Signed Retainer" },
      { icon: HeartPulse, label: "Type of Injury", value: "Minor to Moderate" },
      { icon: CalendarClock, label: "Accident Occurred", value: "0–12 Months Ago" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
  {
    name: "Tier 2 Bronze",
    headerBg: "bg-amber-100 dark:bg-amber-900/50",
    stripClass: "bg-[#CD7F32] dark:bg-[#b56e2a]",
    cardBorder: "hover:border-[#CD7F32]/40",
    btnClass:
      "bg-[rgba(205,127,50,0.08)] border-[rgba(205,127,50,0.25)] text-[#CD7F32] hover:bg-[rgba(205,127,50,0.18)] hover:border-[rgba(205,127,50,0.45)] hover:text-[#a0612a] dark:bg-[rgba(205,127,50,0.08)] dark:border-[rgba(205,127,50,0.2)] dark:text-[#d99a5b] dark:hover:bg-[rgba(205,127,50,0.16)] dark:hover:border-[rgba(205,127,50,0.4)] dark:hover:text-[#e0a86a]",
    rows: [
      { icon: FileCheck, label: "Documentation", value: "Majority Documentation Covered", sub: "Signed Retainer, Police Report" },
      { icon: HeartPulse, label: "Type of Injury", value: "Moderate to Severe" },
      { icon: CalendarClock, label: "Accident Occurred", value: "0–12 Months Ago" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
  {
    name: "Tier 3 Silver",
    headerBg: "bg-slate-100 dark:bg-slate-800",
    stripClass: "bg-[#94a3b8] dark:bg-[#8899aa]",
    cardBorder: "hover:border-[#94a3b8]/40",
    btnClass:
      "bg-[rgba(148,163,184,0.1)] border-[rgba(148,163,184,0.3)] text-[#7a8a9e] hover:bg-[rgba(148,163,184,0.2)] hover:border-[rgba(148,163,184,0.5)] hover:text-[#5c6b7e] dark:bg-[rgba(148,163,184,0.08)] dark:border-[rgba(148,163,184,0.2)] dark:text-[#a8b8cc] dark:hover:bg-[rgba(148,163,184,0.16)] dark:hover:border-[rgba(148,163,184,0.4)] dark:hover:text-[#c0cfe0]",
    rows: [
      { icon: FileCheck2, label: "Documentation", value: "All Documentation Covered", sub: "Signed Retainer, Proof of Medical Treatment, Police Report" },
      { icon: HeartPulse, label: "Type of Injury", value: "Moderate to Severe" },
      { icon: CalendarClock, label: "Accident Occurred", value: "0–12 Months Ago" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
  {
    name: "Tier 4 Gold",
    headerBg: "bg-yellow-100 dark:bg-yellow-900/50",
    stripClass: "bg-[#D4AF37] dark:bg-[#b8960c]",
    cardBorder: "hover:border-[#D4AF37]/40",
    btnClass:
      "bg-[rgba(212,175,55,0.08)] border-[rgba(212,175,55,0.25)] text-[#B8960C] hover:bg-[rgba(212,175,55,0.18)] hover:border-[rgba(212,175,55,0.45)] hover:text-[#8a7400] dark:bg-[rgba(212,175,55,0.08)] dark:border-[rgba(212,175,55,0.2)] dark:text-[#D4AF37] dark:hover:bg-[rgba(212,175,55,0.16)] dark:hover:border-[rgba(212,175,55,0.4)] dark:hover:text-[#e6c54a]",
    rows: [
      { icon: FileBadge, label: "Documentation", value: "All Documentation Covered", sub: "Insurance, Proof of Medical Treatment, Police Report" },
      { icon: HeartPulse, label: "Type of Injury", value: "Moderate to Catastrophic" },
      { icon: CalendarClock, label: "Accident Occurred", value: "0–12 Months Ago" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
];

const commercialTierCards: TierCard[] = [
  {
    name: "Commercial",
    headerBg: "bg-orange-100 dark:bg-orange-900/50",
    stripClass: "bg-[var(--ap-accent,#AE4010)]",
    cardBorder: "hover:border-[var(--ap-accent-border,rgba(174,64,16,0.3))]",
    btnClass:
      "bg-[rgba(174,64,16,0.08)] border-[rgba(174,64,16,0.2)] text-primary hover:bg-[rgba(174,64,16,0.18)] hover:border-[rgba(174,64,16,0.4)] dark:bg-[rgba(174,64,16,0.08)] dark:border-[rgba(174,64,16,0.18)] dark:text-primary",
    rows: [
      { icon: Truck, label: "Case Type", value: "Commercial Vehicle Accident" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
      { icon: FileBadge, label: "Documentation", value: "All Documentation Covered", sub: "Insurance, Proof of Medical Treatment, Police Report" },
      { icon: HeartPulse, label: "Type of Injury", value: "Moderate to Catastrophic" },
    ],
  },
];

const ProductOfferingPage = () => {
  const [category, setCategory] = useState<CaseCategory>("consumer");
  const [tiltReady, setTiltReady] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);

  const COMMERCIAL_ORDERS_PAUSED = true;

  const activeCards = category === "consumer" ? consumerTierCards : commercialTierCards;

  const onTiltMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!tiltReady) return;
      const el = e.currentTarget;
      el.classList.remove("ap-fade-in");
      el.style.animation = "none";

      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const ry = (x - 0.5) * TILT_MAX * 2;
      const rx = (0.5 - y) * TILT_MAX * 2;

      el.style.transition = "transform 0.15s ease-out";
      el.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02, 1.02, 1.02)`;
    },
    [tiltReady],
  );

  const onTiltLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltReady) return;
    const el = e.currentTarget;
    el.style.transition = "transform 0.5s cubic-bezier(0.03, 0.98, 0.52, 0.99)";
    el.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
  }, [tiltReady]);

  return (
    <div className="space-y-6 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-lg font-semibold text-foreground">
              {category === "consumer"
                ? "Consumer Cases — Pricing Per Case"
                : "Commercial Cases — Pricing Per Case"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Each tier reflects the case value based on liability strength, injury severity, documentation
            quality, and a shared 0–12 month accident window.
          </p>
        </div>
        <Select
          value={category}
          onValueChange={(v) => {
            setTiltReady(false);
            setCategory(v as CaseCategory);
            setTimeout(() => setTiltReady(true), 900);
          }}
        >
          <SelectTrigger className="w-48 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="consumer">Consumer Cases</SelectItem>
              <SelectItem value="commercial">Commercial Cases</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Commercial paused notice */}
      {category === "commercial" && COMMERCIAL_ORDERS_PAUSED && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-950/30">
          <Info className="size-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Commercial case orders are temporarily closed. Order availability will open soon.
          </p>
        </div>
      )}

      {/* Tier cards grid */}
      <div
        className={
          category === "consumer"
            ? "grid gap-4 sm:grid-cols-2"
            : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-sm"
        }
      >
        {activeCards.map((tier, idx) => (
          <div
            key={tier.name}
            ref={tiltRef}
            className="will-change-transform [transform-style:preserve-3d]"
            onMouseMove={onTiltMove}
            onMouseLeave={onTiltLeave}
          >
            <Card
              className={`group/card flex h-full flex-col overflow-hidden rounded-xl border border-black/[0.06] bg-white/90 shadow-lg backdrop-blur-sm transition-[box-shadow,background-color] duration-300 hover:shadow-xl hover:bg-white dark:border-white/[0.08] dark:bg-[#1a1a1a]/60 dark:hover:bg-[#1f1f1f] ${tier.cardBorder}`}
            >
              {/* Card Header */}
              <div
                className={`flex items-center justify-center overflow-hidden border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08] ${tier.headerBg}`}
              >
                <span className="text-base font-semibold text-foreground">{tier.name}</span>
              </div>

              {/* Accent Strip */}
              <div className={`h-[2px] ${tier.stripClass}`} />

              {/* Rows */}
              <div className="flex-1 space-y-1 px-4 py-4">
                {tier.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  >
                    <row.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
                        {row.label}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-foreground leading-snug">
                        {row.value}
                      </div>
                      {row.sub && (
                        <div className="text-xs text-muted-foreground leading-snug mt-0.5">{row.sub}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>


            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductOfferingPage;
