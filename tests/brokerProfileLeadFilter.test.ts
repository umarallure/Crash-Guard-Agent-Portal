import assert from "node:assert/strict";
import test from "node:test";

import {
  mapBrokerRequirementSolToSolPeriod,
  matchesBrokerProfileLeadFilter,
  type BrokerAttorneyRequirementRule,
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
  rules: BrokerAttorneyRequirementRule[],
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
      id: "requirement-1",
      brokerAttorneyId: "attorney-1",
      states: ["CA", "TX"],
      sol: "6month",
      isActive: true,
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

test("does not match inactive broker attorney requirement rules", () => {
  const option = brokerOption([
    {
      id: "inactive-requirement",
      brokerAttorneyId: "attorney-1",
      states: ["CA"],
      sol: "6month",
      isActive: false,
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
      id: "requirement-1",
      brokerAttorneyId: "attorney-1",
      states: [],
      sol: "6month",
      isActive: true,
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

test("uses inclusive OR behavior across multiple broker attorneys", () => {
  const option = brokerOption([
    {
      id: "requirement-1",
      brokerAttorneyId: "attorney-1",
      states: ["NY"],
      sol: "12month",
      isActive: true,
    },
    {
      id: "requirement-2",
      brokerAttorneyId: "attorney-2",
      states: ["CA"],
      sol: "6month",
      isActive: true,
    },
  ]);

  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(5) },
      option,
    ),
    true,
  );
  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "NY", accident_date: dateMonthsAgo(11) },
      option,
    ),
    true,
  );
  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(11) },
      option,
    ),
    false,
  );
});

test("maps lawyer requirement SOL values to existing deadline periods", () => {
  assert.equal(mapBrokerRequirementSolToSolPeriod("6month"), "6month");
  assert.equal(mapBrokerRequirementSolToSolPeriod("12month"), "12month");
  assert.equal(mapBrokerRequirementSolToSolPeriod("6_12_months"), "6month");
  assert.equal(mapBrokerRequirementSolToSolPeriod("12_plus_months"), "12month");
  assert.equal(mapBrokerRequirementSolToSolPeriod("unknown"), null);

  const sixMonthOption = brokerOption([
    {
      id: "requirement-1",
      brokerAttorneyId: "attorney-1",
      states: ["CA"],
      sol: "6month",
      isActive: true,
    },
  ]);
  const twelveMonthOption = brokerOption([
    {
      id: "requirement-2",
      brokerAttorneyId: "attorney-2",
      states: ["CA"],
      sol: "12month",
      isActive: true,
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

test("treats missing SOL as no SOL restriction", () => {
  const option = brokerOption([
    {
      id: "requirement-1",
      brokerAttorneyId: "attorney-1",
      states: ["CA"],
      sol: null,
      isActive: true,
    },
  ]);

  assert.equal(
    matchesBrokerProfileLeadFilter(
      { state: "CA", accident_date: dateMonthsAgo(30) },
      option,
    ),
    true,
  );
});
