import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, Building2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAttorneys } from '@/hooks/useAttorneys';
import { supabase } from '@/integrations/supabase/client';
import { SALES_MAP_ACTIVE_STATE_COLOR } from '@/lib/salesMapActiveStates';
import { US_STATES } from '@/lib/us-states';

type CompetitionStatus = 'none' | 'light' | 'moderate' | 'heavy';

type StateSales = {
  code: string;
  name: string;
  sales: number;
  attorneyCount: number;
  isActiveCoverage: boolean;
  coverageColor: 'green' | 'yellow' | 'temporarily_unavailable' | 'inactive';
  status: CompetitionStatus;
};

type TooltipState = {
  open: boolean;
  x: number;
  y: number;
  state: StateSales | null;
};

type OrderRow = {
  id: string;
  target_states: string[];
  lawyer_id?: string;
  status?: string;
  created_at?: string;
  expires_at?: string;
  quota_total?: number;
  quota_filled?: number;
};

type AttorneyAccountType = 'broker_lawyer' | 'internal_lawyer' | null;
type AccountCategoryFilter = 'all' | 'broker_lawyer' | 'internal_lawyer';

type AttorneyProfileRow = {
  user_id?: string | null;
  full_name?: string | null;
  firm_name?: string | null;
  primary_email?: string | null;
  personal_email?: string | null;
  licensed_states?: unknown;
  blocked_states?: unknown;
  account_type?: AttorneyAccountType;
};

type LawyerRequirementRow = {
  attorney_id?: string | null;
  attorney_name?: string | null;
  states?: unknown;
  lawyer_type?: AttorneyAccountType;
};

type MapPalette = {
  none: string;
  active: string;
  light: string;
  moderate: string;
  heavy: string;
  unavailable: string;
};

const ACCOUNT_CATEGORY_META: Record<
  AccountCategoryFilter,
  {
    label: string;
    description: string;
    palette: MapPalette;
    activeClasses: string;
    icon: typeof Building2;
  }
> = {
  all: {
    label: 'All Accounts',
    description: 'Show orders from every attorney profile, regardless of account category.',
    palette: {
      none: '#e5e7eb',
      active: SALES_MAP_ACTIVE_STATE_COLOR,
      light: '#22c55e',
      moderate: '#eab308',
      heavy: '#ef4444',
      unavailable: '#f97316',
    },
    activeClasses: 'border-slate-300 bg-slate-50 text-slate-900',
    icon: Building2,
  },
  broker_lawyer: {
    label: 'Broker Lawyers',
    description: 'Show only orders placed by broker-lawyer profiles.',
    palette: {
      none: '#e5e7eb',
      active: SALES_MAP_ACTIVE_STATE_COLOR,
      light: '#22c55e',
      moderate: '#eab308',
      heavy: '#ef4444',
      unavailable: '#f97316',
    },
    activeClasses: 'border-sky-300 bg-sky-50 text-sky-900',
    icon: BriefcaseBusiness,
  },
  internal_lawyer: {
    label: 'Internal Lawyers',
    description: 'Show only orders placed by internal-lawyer profiles.',
    palette: {
      none: '#e5e7eb',
      active: SALES_MAP_ACTIVE_STATE_COLOR,
      light: '#22c55e',
      moderate: '#eab308',
      heavy: '#ef4444',
      unavailable: '#f97316',
    },
    activeClasses: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    icon: Building2,
  },
};

const MAP_PATH_SELECTOR = 'path[data-id], path[id]';
const BLOCKED_STATE_CODES = new Set(['NC']);
const GREEN_ACTIVE_STATE_CODES = new Set(['WY', 'AZ', 'TX', 'GA', 'FL', 'NY']);
const TEMPORARILY_UNAVAILABLE_STATE_CODES = new Set(['CA']);
const US_STATE_CODE_SET = new Set(US_STATES.map((state) => state.code));

const toStateCodes = (value: unknown): string[] => {
  const asArray = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : value.split(',');
          } catch {
            return value.split(',');
          }
        })()
      : [];

  return [
    ...new Set(
      asArray
        .map((item) => String(item || '').trim().toUpperCase())
        .filter((code) => US_STATE_CODE_SET.has(code))
    ),
  ];
};

const isTestAttorney = (...values: unknown[]) =>
  values.some((value) => String(value ?? '').trim().toLowerCase().includes('test'));

const toCompetitionStatus = (sales: number): CompetitionStatus => {
  if (sales <= 0) return 'none';
  if (sales <= 5) return 'light';
  if (sales <= 10) return 'moderate';
  return 'heavy';
};

const getStatusColor = (status: CompetitionStatus, palette: MapPalette) => {
  if (status === 'none') return palette.none;
  if (status === 'light') return palette.light;
  if (status === 'moderate') return palette.moderate;
  return palette.heavy;
};

const getStatusLabel = (status: CompetitionStatus) => {
  if (status === 'none') return 'No orders';
  if (status === 'light') return 'Low (1–5)';
  if (status === 'moderate') return 'Moderate (6–10)';
  return 'High (11+)';
};

const getCoverageLabel = (state: StateSales) => {
  if (state.coverageColor === 'temporarily_unavailable') return 'Temporarily unavailable';
  if (state.coverageColor === 'green') return 'Low volume';
  if (state.coverageColor === 'yellow') return 'Medium volume';
  return 'Inactive';
};

const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

const getOrderProgressPercent = (order: OrderRow) => {
  const total = Number(order.quota_total) || 0;
  const filled = Number(order.quota_filled) || 0;
  if (total <= 0) return 0;
  return clampPercent((filled / total) * 100);
};

const formatShortDate = (iso?: string) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const SalesMapPage = () => {
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState<StateSales[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState>({ open: false, x: 0, y: 0, state: null });
  const [mapError, setMapError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [selectedStateCode, setSelectedStateCode] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccountCategory, setSelectedAccountCategory] = useState<AccountCategoryFilter>('all');

  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const stateByCodeRef = useRef<Map<string, StateSales>>(new Map());
  const mountDoneRef = useRef(false);

  const selectedStateCodeRef = useRef<string | null>(null);

  const navigate = useNavigate();
  const selectedAccountMeta = ACCOUNT_CATEGORY_META[selectedAccountCategory];
  const mapPalette = selectedAccountMeta.palette;

  const { attorneys } = useAttorneys();
  const attorneyLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attorneys) {
      const label = (a.full_name || '').trim() || (a.primary_email || '').trim() || a.user_id;
      map.set(a.user_id, label);
    }
    return map;
  }, [attorneys]);

  const stateByCode = useMemo(() => {
    const map = new Map<string, StateSales>();
    states.forEach((s) => map.set(s.code, s));
    return map;
  }, [states]);

  useEffect(() => {
    stateByCodeRef.current = stateByCode;
  }, [stateByCode]);

  useEffect(() => {
    selectedStateCodeRef.current = selectedStateCode;
  }, [selectedStateCode]);

  const mountSvg = useCallback(async () => {
    const root = mapRootRef.current;
    if (!root) return;

    try {
      setMapError(null);

      const res = await fetch('/assets/us.svg');
      if (!res.ok) {
        throw new Error(`Failed to load us.svg (HTTP ${res.status})`);
      }

      const svgMarkup = await res.text();
      root.innerHTML = svgMarkup;

      const svg = root.querySelector('svg') as SVGSVGElement | null;
      if (!svg) {
        throw new Error('SVG mounted but <svg> root not found');
      }

      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMapError(msg);
    }
  }, []);

  const applyStateLabels = useCallback(() => {
    const root = mapRootRef.current;
    if (!root) return;
    const svg = root.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    const old = svg.querySelector('#state-labels');
    if (old) old.remove();

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'state-labels');
    g.setAttribute('pointer-events', 'none');

    const paths = svg.querySelectorAll(MAP_PATH_SELECTOR);
    paths.forEach((p) => {
      const code = p.getAttribute('data-id') || p.getAttribute('id');
      if (!code) return;

      let bbox: DOMRect;
      try {
        bbox = (p as unknown as SVGGraphicsElement).getBBox();
      } catch {
        return;
      }

      const cx = bbox.x + bbox.width / 2;
      const cy = bbox.y + bbox.height / 2;

      const state = stateByCodeRef.current.get(code);
      if (!state) return;

      const fontSize = Math.max(7, Math.min(14, Math.min(bbox.width, bbox.height) / 4));
      const fill = '#111827';

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = code;
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String(cy));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.style.setProperty('font-size', `${fontSize}px`, 'important');
      text.style.setProperty('font-weight', '700', 'important');
      text.style.setProperty(
        'font-family',
        'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        'important'
      );
      text.style.setProperty('fill', fill, 'important');
      text.style.setProperty('paint-order', 'stroke', 'important');
      text.style.setProperty('stroke', 'rgba(255,255,255,0.9)', 'important');
      text.style.setProperty('stroke-width', '2', 'important');
      text.style.setProperty('stroke-linejoin', 'round', 'important');

      g.appendChild(text);
    });

    svg.appendChild(g);
  }, []);

  const applyMapColors = useCallback(() => {
    const root = mapRootRef.current;
    if (!root) return;

    const svg = root.querySelector('svg');
    if (!svg) return;

    const paths = svg.querySelectorAll(MAP_PATH_SELECTOR);
    paths.forEach((p) => {
      const path = p as SVGPathElement;
      const code = p.getAttribute('data-id') || p.getAttribute('id');
      if (!code) return;

      const normalizedCode = code.trim().toUpperCase();
      const state = stateByCodeRef.current.get(normalizedCode);
      let fill = mapPalette.none;
      if (state?.coverageColor === 'temporarily_unavailable') {
        fill = mapPalette.unavailable;
      } else if (BLOCKED_STATE_CODES.has(normalizedCode)) {
        fill = mapPalette.none;
      } else if (state?.coverageColor === 'green') {
        fill = mapPalette.light;
      } else if (state?.coverageColor === 'yellow') {
        fill = mapPalette.moderate;
      }

      const selected = selectedStateCodeRef.current;
      const isSelected = selected ? selected === code : false;
      const dimOthers = Boolean(selected);

      // Set presentation attributes so the SVG's own styles (e.g. svg { fill: none; })
      // can't override our colors after layout/style recalculation.
      path.setAttribute('fill', fill);
      path.setAttribute('stroke', isSelected ? '#111827' : '#0b0b0b');
      path.setAttribute('stroke-width', isSelected ? '2' : '0.8');

      path.style.setProperty('fill', fill, 'important');
      path.style.setProperty('stroke', isSelected ? '#111827' : '#0b0b0b', 'important');
      path.style.setProperty('stroke-width', isSelected ? '2' : '0.8', 'important');
      path.style.setProperty('transition', 'transform 0.2s ease, opacity 0.3s ease', 'important');
      path.style.setProperty('transform-origin', 'center', 'important');
      path.style.setProperty('transform-box', 'fill-box', 'important');
      path.style.cursor = state ? 'pointer' : 'default';
      path.style.opacity = dimOthers && !isSelected ? '0.55' : '1';
    });

    applyStateLabels();
  }, [applyStateLabels, mapPalette]);

  const refreshCounts = useCallback(async () => {
    setLoading(true);
    try {
      setDataError(null);

      const [ordersResponse, attorneyProfileResponse, lawyerRequirementResponse] = await Promise.all([
        (supabase as any)
          .from('orders')
          .select('id,target_states,lawyer_id,status,created_at,expires_at,quota_total,quota_filled')
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('attorney_profiles')
          .select('user_id,full_name,firm_name,primary_email,personal_email,licensed_states,blocked_states,account_type')
          .in('account_type', ['broker_lawyer', 'internal_lawyer']),
        (supabase as any)
          .from('lawyer_requirements')
          .select('attorney_id,attorney_name,states,lawyer_type')
          .eq('lawyer_type', 'broker_lawyer'),
      ]);

      if (ordersResponse.error) {
        throw ordersResponse.error instanceof Error ? ordersResponse.error : new Error(String(ordersResponse.error));
      }

      if (attorneyProfileResponse.error) {
        throw attorneyProfileResponse.error instanceof Error
          ? attorneyProfileResponse.error
          : new Error(String(attorneyProfileResponse.error));
      }

      if (lawyerRequirementResponse.error) {
        throw lawyerRequirementResponse.error instanceof Error
          ? lawyerRequirementResponse.error
          : new Error(String(lawyerRequirementResponse.error));
      }

      const accountTypeByUser = new Map<string, AttorneyAccountType>();
      const attorneyProfiles = (attorneyProfileResponse.data ?? []) as AttorneyProfileRow[];
      attorneyProfiles.forEach((profile) => {
        const userId = String(profile.user_id || '').trim();
        if (!userId) return;
        accountTypeByUser.set(userId, profile.account_type ?? null);
      });

      const rows = (ordersResponse.data ?? []) as OrderRow[];
      const filteredRows = rows.filter((row) => {
        if (selectedAccountCategory === 'all') return true;
        const lawyerId = String(row.lawyer_id || '').trim();
        if (!lawyerId) return false;
        return accountTypeByUser.get(lawyerId) === selectedAccountCategory;
      });

      setAllOrders(filteredRows);
      setTotalOrders(filteredRows.length);

      const counts = new Map<string, number>();
      for (const row of filteredRows) {
        const targets = Array.isArray(row.target_states) ? row.target_states : [];
        for (const s of targets) {
          const code = String(s || '').trim().toUpperCase();
          if (!code) continue;
          counts.set(code, (counts.get(code) ?? 0) + 1);
        }
      }

      const coverageByState = new Map<string, Set<string>>();
      const addAttorneyCoverage = (attorneyKey: string, licensedStates: string[], blockedStates: string[]) => {
        const blocked = new Set(blockedStates);
        for (const code of licensedStates) {
          if (blocked.has(code)) continue;
          const existing = coverageByState.get(code) ?? new Set<string>();
          existing.add(attorneyKey);
          coverageByState.set(code, existing);
        }
      };

      if (selectedAccountCategory === 'all' || selectedAccountCategory === 'broker_lawyer') {
        for (const row of (lawyerRequirementResponse.data ?? []) as LawyerRequirementRow[]) {
          if (isTestAttorney(row.attorney_name)) continue;

          const licensedStates = toStateCodes(row.states);
          if (!licensedStates.length) continue;

          const attorneyId = String(row.attorney_id || '').trim();
          const attorneyName = String(row.attorney_name || '').trim();
          if (!attorneyId && !attorneyName) continue;

          addAttorneyCoverage(`broker:${attorneyId || attorneyName}`, licensedStates, []);
        }
      }

      for (const profile of attorneyProfiles) {
        if (profile.account_type !== 'internal_lawyer') continue;
        if (selectedAccountCategory !== 'all' && selectedAccountCategory !== 'internal_lawyer') continue;
        if (isTestAttorney(profile.full_name, profile.firm_name, profile.primary_email, profile.personal_email)) continue;

        const licensedStates = toStateCodes(profile.licensed_states);
        if (!licensedStates.length) continue;

        const userId = String(profile.user_id || '').trim();
        const fallbackName = String(profile.full_name || profile.primary_email || profile.personal_email || '').trim();
        if (!userId && !fallbackName) continue;

        addAttorneyCoverage(
          `${profile.account_type || 'attorney'}:${userId || fallbackName}`,
          licensedStates,
          toStateCodes(profile.blocked_states)
        );
      }

      const nextStates: StateSales[] = US_STATES.map((s) => {
        const sales = counts.get(s.code) ?? 0;
        const attorneyCount = coverageByState.get(s.code)?.size ?? 0;
        const isActiveCoverage = attorneyCount > 0;
        const coverageColor: StateSales['coverageColor'] = TEMPORARILY_UNAVAILABLE_STATE_CODES.has(s.code)
          ? 'temporarily_unavailable'
          : isActiveCoverage
            ? GREEN_ACTIVE_STATE_CODES.has(s.code)
              ? 'green'
              : 'yellow'
            : 'inactive';

        return {
          code: s.code,
          name: s.name,
          sales,
          attorneyCount,
          isActiveCoverage,
          coverageColor,
          status: toCompetitionStatus(sales),
        };
      });

      setStates(nextStates);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDataError(msg);
      setTotalOrders(0);
      setAllOrders([]);
      setStates(
        US_STATES.map((s) => ({
          code: s.code,
          name: s.name,
          sales: 0,
          attorneyCount: 0,
          isActiveCoverage: false,
          coverageColor: TEMPORARILY_UNAVAILABLE_STATE_CODES.has(s.code)
            ? 'temporarily_unavailable'
            : 'inactive',
          status: 'none',
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [selectedAccountCategory]);

  useEffect(() => {
    const run = async () => {
      if (mountDoneRef.current) return;
      mountDoneRef.current = true;

      await mountSvg();
      await refreshCounts();
    };

    void run();
  }, [mountSvg, refreshCounts]);

  useEffect(() => {
    if (!mountDoneRef.current) return;
    void refreshCounts();
  }, [selectedAccountCategory, refreshCounts]);

  useEffect(() => {
    if (states.length === 0) return;
    applyMapColors();
  }, [applyMapColors, states]);

  useEffect(() => {
    if (states.length === 0) return;
    applyMapColors();
  }, [applyMapColors, selectedStateCode, states.length]);

  useEffect(() => {
    const root = mapRootRef.current;
    if (!root) return;
    const svg = root.querySelector('svg');
    if (!svg) return;

    const handleStateEnter = (evt: Event) => {
      const target = evt.target as HTMLElement | null;
      if (!target) return;
      const code = target.getAttribute('data-id') || target.getAttribute('id');
      if (!code) return;
      const state = stateByCode.get(code) ?? null;
      if (!state) return;

      setTooltip((prev) => ({ ...prev, open: true, state }));
    };

    const handleStateLeave = () => {
      setTooltip((prev) => ({ ...prev, open: false, state: null }));
    };

    const handleMouseMove = (evt: MouseEvent) => {
      setTooltip((prev) => {
        if (!prev.open) return prev;
        const rect = root.getBoundingClientRect();
        const offset = 6;
        const rawX = evt.clientX - rect.left + offset;
        const rawY = evt.clientY - rect.top + offset;

        const w = tooltipRef.current?.offsetWidth ?? 0;
        const h = tooltipRef.current?.offsetHeight ?? 0;

        const maxX = Math.max(0, rect.width - w - 4);
        const maxY = Math.max(0, rect.height - h - 4);

        return {
          ...prev,
          x: Math.max(4, Math.min(rawX, maxX)),
          y: Math.max(4, Math.min(rawY, maxY)),
        };
      });
    };

    const handleStateClick = (evt: Event) => {
      const target = evt.target as HTMLElement | null;
      if (!target) return;
      const code = (target.getAttribute('data-id') || target.getAttribute('id') || '').trim().toUpperCase();
      if (!code) return;

      const state = stateByCode.get(code) ?? null;
      if (!state) return;

      setSelectedStateCode(code);
      setDrawerOpen(true);
    };

    const paths = svg.querySelectorAll(MAP_PATH_SELECTOR);
    paths.forEach((p) => {
      p.addEventListener('mouseenter', handleStateEnter);
      p.addEventListener('mouseleave', handleStateLeave);
      p.addEventListener('click', handleStateClick);
    });
    svg.addEventListener('mousemove', handleMouseMove);

    return () => {
      paths.forEach((p) => {
        p.removeEventListener('mouseenter', handleStateEnter);
        p.removeEventListener('mouseleave', handleStateLeave);
        p.removeEventListener('click', handleStateClick);
      });
      svg.removeEventListener('mousemove', handleMouseMove);
    };
  }, [stateByCode]);

  const selectedState = useMemo(() => {
    if (!selectedStateCode) return null;
    return stateByCode.get(selectedStateCode) ?? null;
  }, [selectedStateCode, stateByCode]);

  const selectedStateOrders = useMemo(() => {
    if (!selectedStateCode) return [];
    const code = selectedStateCode;
    return allOrders.filter((o) => Array.isArray(o.target_states) && o.target_states.map(String).map((s) => s.toUpperCase()).includes(code));
  }, [allOrders, selectedStateCode]);

  const statsCards = useMemo(
    () => [
      { label: 'Orders', value: totalOrders, accent: '#ae4010' },
      { label: 'Active', value: states.filter((s) => s.isActiveCoverage).length, accent: '#3f6eb3' },
      { label: 'With Orders', value: states.filter((s) => s.sales > 0).length, accent: '#9ca3af' },
    ],
    [states, totalOrders]
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Sales Map</h2>
          <p className="text-sm text-muted-foreground">Open orders and licensed lawyer coverage by state</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            {(['all', 'broker_lawyer', 'internal_lawyer'] as AccountCategoryFilter[]).map((category) => {
              const meta = ACCOUNT_CATEGORY_META[category];
              const Icon = meta.icon;
              const isActive = selectedAccountCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedAccountCategory(category)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? meta.activeClasses
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void (async () => {
                await refreshCounts();
                applyMapColors();
              })();
            }}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </div>
      {false && (
        <Card className="sm:col-span-2">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium">Legend</div>
              <div className="text-xs text-muted-foreground">{selectedAccountMeta.description}</div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-4 w-4 rounded-full" style={{ backgroundColor: mapPalette.none }} />
                <div className="leading-tight">
                  <div className="text-sm font-medium">No orders</div>
                  <div className="text-xs text-muted-foreground">0 submitted orders</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-4 w-4 rounded-full" style={{ backgroundColor: mapPalette.active }} />
                <div className="leading-tight">
                  <div className="text-sm font-medium">Active state</div>
                  <div className="text-xs text-muted-foreground">Configured active coverage</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-4 w-4 rounded-full" style={{ backgroundColor: mapPalette.light }} />
                <div className="leading-tight">
                  <div className="text-sm font-medium">Low volume</div>
                  <div className="text-xs text-muted-foreground">1–5 submitted orders</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-4 w-4 rounded-full" style={{ backgroundColor: mapPalette.moderate }} />
                <div className="leading-tight">
                  <div className="text-sm font-medium">Moderate volume</div>
                  <div className="text-xs text-muted-foreground">6–10 submitted orders</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-4 w-4 rounded-full" style={{ backgroundColor: mapPalette.heavy }} />
                <div className="leading-tight">
                  <div className="text-sm font-medium">High volume</div>
                  <div className="text-xs text-muted-foreground">11+ submitted orders</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden rounded-2xl border-black/[0.08] bg-transparent dark:border-white/[0.06] dark:bg-transparent">
        <CardContent className="p-4">
          <div className="relative">
            <div
              ref={mapRootRef}
              className="w-full overflow-hidden rounded-xl bg-transparent [&_svg_path[data-id]:hover]:scale-[1.08] [&_svg_path[id]:hover]:scale-[1.08]"
              style={{ height: 520 }}
            />

            <div className="absolute left-3 top-3 z-10 hidden md:block">
              <div className="w-32 overflow-hidden rounded-xl border border-black/[0.06] bg-white/90 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
                {statsCards.map((stat, index) => (
                  <div
                    key={stat.label}
                    className={`px-4 py-3 ${index > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.06]' : ''}`}
                  >
                    <div className="relative pl-3">
                      <div
                        className="absolute bottom-0.5 left-0 top-0.5 w-[3px] rounded-full"
                        style={{ backgroundColor: stat.accent }}
                      />
                      <div className="text-xs leading-tight text-gray-500 dark:text-gray-400">{stat.label}</div>
                      <div className="text-lg font-bold" style={{ color: stat.accent }}>
                        {stat.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute bottom-0 left-1/2 z-10 max-w-[calc(100%-1.5rem)] -translate-x-1/2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-black/[0.06] bg-white/90 px-2.5 py-2 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60 md:max-w-none md:flex-nowrap md:gap-x-4 md:whitespace-nowrap md:px-4 md:py-2.5">
                <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mapPalette.none }} />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Inactive</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mapPalette.light }} />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Low volume</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mapPalette.moderate }} />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Medium volume</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mapPalette.heavy }} />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">High volume</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mapPalette.unavailable }} />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Temporarily unavailable</span>
                  </div>
                </div>

                <div className="hidden h-5 w-px bg-black/[0.08] dark:bg-white/[0.08] md:block" />

                <div className="inline-flex items-center gap-1 rounded-md border border-black/[0.06] bg-black/[0.04] px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-gray-400">
                  {selectedAccountMeta.label}
                </div>
              </div>
            </div>

            {mapError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="max-w-xl rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                  Failed to load map asset: {mapError}
                </div>
              </div>
            ) : null}

            {dataError ? (
              <div className="absolute left-3 top-3 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground shadow">
                Failed to load order counts: {dataError}
              </div>
            ) : null}

            {tooltip.open && tooltip.state ? (
              <div
                ref={tooltipRef}
                className="pointer-events-none absolute z-20 rounded-xl border border-black/[0.08] bg-white px-4 py-3 shadow-xl dark:border-white/[0.06] dark:bg-[#1a1a1a]"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <div className="text-sm font-semibold">
                  {tooltip.state.name} ({tooltip.state.code})
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={
                      tooltip.state.status === 'none'
                        ? 'bg-gray-100 text-gray-800'
                        : selectedAccountCategory === 'broker_lawyer'
                          ? tooltip.state.status === 'light'
                            ? 'bg-sky-100 text-sky-800'
                            : tooltip.state.status === 'moderate'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-violet-100 text-violet-800'
                          : tooltip.state.status === 'light'
                            ? 'bg-green-100 text-green-800'
                            : tooltip.state.status === 'moderate'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                    }
                  >
                    {getStatusLabel(tooltip.state.status)}
                  </Badge>
                </div>
                <div className="mt-1 space-y-1 text-xs text-gray-400 dark:text-gray-500">
                  <div>Category: {selectedAccountMeta.label}</div>
                  <div>Coverage: {getCoverageLabel(tooltip.state)}</div>
                  <div>Licensed lawyers: {tooltip.state.attorneyCount}</div>
                  <div>Orders: {tooltip.state.sales}</div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2 md:hidden">
            {statsCards.map((stat) => (
              <div
                key={stat.label}
                className="relative flex-1 overflow-hidden rounded-xl border border-black/[0.06] bg-white/90 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60"
              >
                <div
                  className="absolute bottom-0 left-0 top-0 w-1 rounded-r-full"
                  style={{ backgroundColor: stat.accent }}
                />
                <div className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">{stat.label}</div>
                <div className="text-base font-bold" style={{ color: stat.accent }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedStateCode(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full border-l border-black/[0.08] bg-white/95 p-0 backdrop-blur dark:border-white/[0.06] dark:bg-[#1a1a1a]/95 sm:max-w-md"
        >
          <SheetHeader className="border-b border-black/[0.06] px-5 py-4 text-left dark:border-white/[0.06]">
            <SheetTitle>
              {selectedState ? `Orders in ${selectedState.name} (${selectedState.code})` : 'Orders'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <Badge variant="secondary">{selectedStateOrders.length} orders</Badge>
            {loading ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : null}
          </div>

          <div className="space-y-2 overflow-auto px-5 pb-5" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            {!selectedStateCode ? (
              <div className="rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2 text-sm text-muted-foreground shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
                Select a state to view orders.
              </div>
            ) : selectedStateOrders.length === 0 ? (
              <div className="rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2 text-sm text-muted-foreground shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
                No submitted orders in this state.
              </div>
            ) : (
              selectedStateOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="w-full rounded-xl border border-black/[0.06] bg-white/80 px-3 py-3 text-left shadow-sm transition hover:bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                  onClick={() => {
                    const base = `/order-fulfillment/${encodeURIComponent(o.id)}/fulfill`;
                    const lawyerId = (o.lawyer_id || '').trim();
                    const url = lawyerId ? `${base}?lawyerId=${encodeURIComponent(lawyerId)}` : base;
                    navigate(url);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {o.lawyer_id ? attorneyLabelById.get(o.lawyer_id) || o.lawyer_id : 'Unassigned attorney'}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {(o.status || 'OPEN').toString()}
                        {o.created_at ? ` • ${new Date(o.created_at).toLocaleDateString('en-US')}` : ''}
                      </div>

                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progress</span>
                          <span>{Math.round(getOrderProgressPercent(o))}%</span>
                        </div>
                        <Progress value={getOrderProgressPercent(o)} />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border bg-background px-2 py-1">
                          <div className="text-muted-foreground">Quota</div>
                          <div className="font-medium">
                            {Number(o.quota_filled) || 0}/{Number(o.quota_total) || 0}
                          </div>
                        </div>
                        <div className="rounded-md border bg-background px-2 py-1">
                          <div className="text-muted-foreground">Expires</div>
                          <div className="font-medium">{formatShortDate(o.expires_at) ?? '—'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Badge variant="outline">Fulfill</Badge>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SalesMapPage;
