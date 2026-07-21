import { normalizeAttorneyCoverageStates } from "./attorneyLeadFilter";
import { evaluateSol, getSolPeriodLabel, normalizeSolPeriod, type SolPeriod } from "./solPeriods";
import { matchesStateFilter, type StateFilterOption } from "./stateFilter";

export type BrokerAttorneyRequirementRule = {
  id: string;
  brokerAttorneyId?: string | null;
  attorneyName?: string | null;
  states: string[];
  sol: string | null;
  isActive?: boolean | null;
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
  rules: BrokerAttorneyRequirementRule[];
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

export const mapBrokerRequirementSolToSolPeriod = (
  value: string | null | undefined,
): SolPeriod | null => {
  const normalized = String(value ?? "").trim();
  return normalizeSolPeriod(normalized) ?? BROKER_COVERAGE_SOL_TO_SOL_PERIOD[normalized] ?? null;
};

const normalizeBrokerRequirementSolForEvaluation = (
  value: string | null | undefined,
): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  return mapBrokerRequirementSolToSolPeriod(normalized) ?? normalized;
};

export const getBrokerRequirementSolLabel = (
  value: string | null | undefined,
): string => {
  const normalized = String(value ?? "").trim();
  const solPeriod = normalizeSolPeriod(normalized);
  if (solPeriod) return getSolPeriodLabel(solPeriod);

  return BROKER_COVERAGE_SOL_LABELS[normalized] ?? "Unknown SOL";
};

const isBrokerAttorneyRuleEligible = (rule: BrokerAttorneyRequirementRule) =>
  rule.isActive !== false;

export const matchesBrokerProfileLeadFilter = (
  record: BrokerProfileLeadFilterRecord,
  brokerProfileFilter: BrokerProfileLeadFilterOption | null | undefined,
  stateOptions?: StateFilterOption[],
): boolean => {
  if (!brokerProfileFilter) return true;

  return brokerProfileFilter.rules
    .filter(isBrokerAttorneyRuleEligible)
    .some((rule) => {
      const coverageStates = normalizeAttorneyCoverageStates(rule.states);
      if (coverageStates.length === 0) return false;

      if (!matchesStateFilter(record.state, coverageStates, stateOptions)) return false;

      return evaluateSol(normalizeBrokerRequirementSolForEvaluation(rule.sol), record.accident_date).ok;
    });
};
