export const SALES_MAP_ACTIVE_STATE_CODES = [
  'WI',
  'AK',
  'AR',
  'CO',
  'CT',
  'DE',
  'FL',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'LA',
  'ME',
  'MA',
  'MI',
  'MS',
  'MN',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'ND',
  'OH',
  'OK',
  'PA',
  'OR',
  'PR',
  'RI',
  'SC',
  'SD',
  'UT',
  'VT',
  'WA',
] as const;

export const SALES_MAP_ACTIVE_STATE_CODE_SET = new Set<string>(SALES_MAP_ACTIVE_STATE_CODES);

export const SALES_MAP_ACTIVE_STATE_COLOR = '#facc15';

export const SALES_MAP_ACTIVE_STATE_OPTION_CLASS =
  'bg-yellow-50 text-yellow-950 hover:bg-yellow-100 hover:text-yellow-950';
