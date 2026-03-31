import { useState } from "react";
import { Clock, Heart, FileText, Scale, Truck, Info } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CaseCategory = "consumer" | "commercial";

interface TierFeature {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}

interface Tier {
  name: string;
  price: string;
  priceColor: string;
  topBorderColor: string;
  badgeLabel: string;
  badgeColor: string;
  comingSoon?: boolean;
  features: TierFeature[];
}

const consumerTiers: Tier[] = [
  {
    name: "Tier 1 Transfer",
    price: "$2,500",
    priceColor: "text-foreground",
    topBorderColor: "#9ca3af",
    badgeLabel: "Transfer",
    badgeColor: "bg-muted text-muted-foreground",
    features: [
      { icon: Clock, label: "Accident Occurred", value: "12+ Months Ago" },
      { icon: Heart, label: "Type of Injury", value: "Minor to Moderate" },
      { icon: FileText, label: "Documentation", value: "Minor Documentation Covered", sub: "Signed Retainer" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
  {
    name: "Tier 2 Bronze",
    price: "$3,500",
    priceColor: "text-amber-600",
    topBorderColor: "#d97706",
    badgeLabel: "Bronze",
    badgeColor: "bg-amber-100 text-amber-700",
    features: [
      { icon: Clock, label: "Accident Occurred", value: "6–12 Months Ago" },
      { icon: Heart, label: "Type of Injury", value: "Moderate to Severe" },
      { icon: FileText, label: "Documentation", value: "Majority Documentation Covered", sub: "Signed Retainer, Police Report" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
  {
    name: "Tier 3 Silver",
    price: "$4,500",
    priceColor: "text-slate-500",
    topBorderColor: "#64748b",
    badgeLabel: "Silver",
    badgeColor: "bg-slate-100 text-slate-600",
    features: [
      { icon: Clock, label: "Accident Occurred", value: "3–6 Months Ago" },
      { icon: Heart, label: "Type of Injury", value: "Moderate to Severe" },
      { icon: FileText, label: "Documentation", value: "All Documentation Covered", sub: "Signed Retainer, Proof of Medical Treatment, Police Report" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
  {
    name: "Tier 4 Gold",
    price: "$6,000",
    priceColor: "text-yellow-600",
    topBorderColor: "#ca8a04",
    badgeLabel: "Gold",
    badgeColor: "bg-yellow-100 text-yellow-700",
    features: [
      { icon: Clock, label: "Accident Occurred", value: "0–3 Months Ago" },
      { icon: Heart, label: "Type of Injury", value: "Moderate to Catastrophic" },
      { icon: FileText, label: "Documentation", value: "All Documentation Covered", sub: "Insurance, Proof of Medical Treatment, Police Report" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
    ],
  },
];

const commercialTiers: Tier[] = [
  {
    name: "Commercial",
    price: "$7,500",
    priceColor: "text-primary",
    topBorderColor: "hsl(18 83% 37%)",
    badgeLabel: "Commercial",
    badgeColor: "bg-orange-100 text-primary",
    comingSoon: true,
    features: [
      { icon: Truck, label: "Case Type", value: "Commercial Vehicle Accident" },
      { icon: Scale, label: "Liability", value: "100% Accepted", sub: "Or Very Strong Proof" },
      { icon: FileText, label: "Documentation", value: "All Documentation Covered", sub: "Insurance, Proof of Medical Treatment, Police Report" },
      { icon: Heart, label: "Type of Injury", value: "Moderate to Catastrophic" },
    ],
  },
];

const ProductsPage = () => {
  const [category, setCategory] = useState<CaseCategory>("consumer");

  const tiers = category === "consumer" ? consumerTiers : commercialTiers;
  const title = category === "consumer" ? "Consumer Cases" : "Commercial Cases";

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title} — Pricing Per Case</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each tier reflects the case value based on recency, liability strength, injury severity, and documentation quality.
          </p>
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as CaseCategory)}>
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

      {/* Commercial coming-soon banner */}
      {category === "commercial" && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-700">
            Commercial case orders are temporarily closed. Order availability will open soon.
          </p>
        </div>
      )}

      {/* Tier cards */}
      <div
        className={`grid gap-5 ${
          category === "consumer"
            ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className="flex flex-col overflow-hidden"
            style={{ borderTop: `3px solid ${tier.topBorderColor}` }}
          >
            {/* Tier header */}
            <CardHeader className="border-b bg-muted/40 px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{tier.name}</h2>
                <Badge className={`text-[11px] ${tier.badgeColor}`}>{tier.badgeLabel}</Badge>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-0 p-0">
              {/* Price */}
              <div className="border-b px-5 py-5">
                <div className="flex items-end gap-1.5">
                  <span className={`text-4xl font-bold ${tier.priceColor}`}>{tier.price}</span>
                  <span className="mb-1 text-sm text-muted-foreground">/ case</span>
                </div>
              </div>

              {/* Features */}
              <div className="flex-1 space-y-4 px-5 py-5">
                {tier.features.map((feature) => (
                  <div key={feature.label} className="flex items-start gap-3">
                    <feature.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {feature.label}
                      </p>
                      <p className="text-sm font-semibold text-foreground">{feature.value}</p>
                      {feature.sub && (
                        <p className="text-xs text-muted-foreground">{feature.sub}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ProductsPage;
