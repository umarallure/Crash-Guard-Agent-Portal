import assert from "node:assert/strict";
import test from "node:test";

import {
  mapBrokerCoverageSolCriteriaToSolPeriod,
  matchesBrokerProfileLeadFilter,
  type BrokerAttorneyCoverageRule,
  type BrokerProfileLeadFilterOption,
} from "../src/lib/brokerProfileLeadFilter.ts";

const dateMonthsAgo = (monthsAgo: number) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 15);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const brokerOption = (
  rules: BrokerAttorneyCoverageRule[],
): BrokerProfileLeadFilterOption => ({
  id: "broker:profile-1",
  label: "Broker Profile",
  sourceId: "profile-1",
  attorneyCount: rules.length,
  coverageStates: [],
  solCriteria: [],
  rules,
});

test("matches when one broker attorney covers the lead state and SOL deadline", () => {
  const option = brokerOption([
    {
      id: "attorney-1",
      coverageStates: ["CA", "TX"],
      coverageSolCriteria: "6_12_months",
      isActive: true,
      deletedAt: null,
    },
  ]);

  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(5) },
      option,
    ),
    true,
  );
});

test("does not match inactive or deleted broker attorney rules", () => {
  const option = brokerOption([
    {
      id: "inactive-attorney",
      coverageStates: ["CA"],
      coverageSolCriteria: "6_12_months",
      isActive: false,
      deletedAt: null,
    },
    {
      id: "deleted-attorney",
      coverageStates: ["CA"],
      coverageSolCriteria: "6_12_months",
      isActive: true,
      deletedAt: "2026-01-01T00:00:00Z",
    },
  ]);

  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(5) },
      option,
    ),
    false,
  );
});

test("does not match broker attorney rules without coverage states", () => {
  const option = brokerOption([
    {
      id: "attorney-1",
      coverageStates: [],
      coverageSolCriteria: "6_12_months",
      isActive: true,
      deletedAt: null,
    },
  ]);

  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(5) },
      option,
    ),
    false,
  );
});

test("uses OR behavior across multiple broker attorneys", () => {
  const option = brokerOption([
    {
      id: "attorney-1",
      coverageStates: ["NY"],
      coverageSolCriteria: "6_12_months",
      isActive: true,
      deletedAt: null,
    },
    {
      id: "attorney-2",
      coverageStates: ["CA"],
      coverageSolCriteria: "6_12_months",
      isActive: true,
      deletedAt: null,
    },
  ]);

  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(5) },
      option,
    ),
    true,
  );
});

test("maps broker SOL criteria to existing deadline periods", () => {
  assert.equal(mapBrokerCoverageSolCriteriaToSolPeriod("6_12_months"), "6month");
  assert.equal(mapBrokerCoverageSolCriteriaToSolPeriod("12_plus_months"), "12month");
  assert.equal(mapBrokerCoverageSolCriteriaToSolPeriod("unknown"), null);

  const sixMonthOption = brokerOption([
    {
      id: "attorney-1",
      coverageStates: ["CA"],
      coverageSolCriteria: "6_12_months",
      isActive: true,
      deletedAt: null,
    },
  ]);
  const twelveMonthOption = brokerOption([
    {
      id: "attorney-2",
      coverageStates: ["CA"],
      coverageSolCriteria: "12_plus_months",
      isActive: true,
      deletedAt: null,
    },
  ]);

  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(7) },
      sixMonthOption,
    ),
    false,
  );
  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(11) },
      twelveMonthOption,
    ),
    true,
  );
  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(13) },
      twelveMonthOption,
    ),
    false,
  );
});
