import { normalizeAttorneyCoverageStates } from "./attorneyLeadFilter";
import { matchesSolPeriodFilter, type SolPeriod } from "./solPeriods";
import { matchesStateFilter, type StateFilterOption } from "./stateFilter";

export type BrokerAttorneyCoverageRule = {
  id: string;
  attorneyName?: string | null;
  coverageStates: string[];
  coverageSolCriteria: string | null;
  isActive?: boolean | null;
  deletedAt?: string | null;
};

export type BrokerProfileLeadFilterOption = {
  id: string;
  label: string;
  sourceId: string;
  companyName?: string | null;
  fullName?: string | null;
  primaryEmail?: string | null;
  attorneyCount: number;
  coverageStates: string[];
  solCriteria: string[];
  rules: BrokerAttorneyCoverageRule[];
  searchText?: string;
};

export type BrokerProfileLeadFilterRecord = {
  state?: string | null;
  accident_date?: string | Date | null;
};

const BROKER_COVERAGE_SOL_TO_SOL_PERIOD: Record<string, SolPeriod> = {
  "6_12_months": "6month",
  "12_plus_months": "12month",
};

const BROKER_COVERAGE_SOL_LABELS: Record<string, string> = {
  "6_12_months": "6 Month SOL",
  "12_plus_months": "12 Month SOL",
};

export const mapBrokerCoverageSolCriteriaToSolPeriod = (
  value: string | null | undefined,
): SolPeriod | null => {
  const normalized = String(value ?? "").trim();
  return BROKER_COVERAGE_SOL_TO_SOL_PERIOD[normalized] ?? null;
};

export const getBrokerCoverageSolCriteriaLabel = (
  value: string | null | undefined,
): string => {
  const normalized = String(value ?? "").trim();
  return BROKER_COVERAGE_SOL_LABELS[normalized] ?? "Unknown SOL";
};

const isBrokerAttorneyRuleEligible = (rule: BrokerAttorneyCoverageRule) =>
  rule.isActive !== false && !rule.deletedAt;

export const matchesBrokerProfileLeadFilter = (
  record: BrokerProfileLeadFilterRecord,
  brokerProfileFilter: BrokerProfileLeadFilterOption | null | undefined,
  stateOptions?: StateFilterOption[],
): boolean => {
  if (!brokerProfileFilter) return true;

  return brokerProfileFilter.rules
    .filter(isBrokerAttorneyRuleEligible)
    .some((rule) => {
      const coverageStates = normalizeAttorneyCoverageStates(rule.coverageStates);
      if (coverageStates.length === 0) return false;

      if (!matchesStateFilter(record.state, coverageStates, stateOptions)) return false;

      const solPeriod = mapBrokerCoverageSolCriteriaToSolPeriod(rule.coverageSolCriteria);
      if (!solPeriod) return false;

      return matchesSolPeriodFilter(record.accident_date, solPeriod);
    });
};
