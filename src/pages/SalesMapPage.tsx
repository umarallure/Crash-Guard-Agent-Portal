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
import { US_STATES } from '@/lib/us-states';

type CompetitionStatus = 'none' | 'light' | 'moderate' | 'heavy';

type StateSales = {
  code: string;
  name: string;
  sales: number;
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

type MapPalette = {
  none: string;
  light: string;
  moderate: string;
  heavy: string;
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
      light: '#22c55e',
      moderate: '#eab308',
      heavy: '#ef4444',
    },
    activeClasses: 'border-slate-300 bg-slate-50 text-slate-900',
    icon: Building2,
  },
  broker_lawyer: {
    label: 'Broker Lawyers',
    description: 'Show only orders placed by broker-lawyer profiles.',
    palette: {
      none: '#e5e7eb',
      light: '#38bdf8',
      moderate: '#6366f1',
      heavy: '#8b5cf6',
    },
    activeClasses: 'border-sky-300 bg-sky-50 text-sky-900',
    icon: BriefcaseBusiness,
  },
  internal_lawyer: {
    label: 'Internal Lawyers',
    description: 'Show only orders placed by internal-lawyer profiles.',
    palette: {
      none: '#e5e7eb',
      light: '#22c55e',
      moderate: '#f59e0b',
      heavy: '#ef4444',
    },
    activeClasses: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    icon: Building2,
  },
};

const MAP_PATH_SELECTOR = 'path[data-id], path[id]';

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

      const state = stateByCodeRef.current.get(code);
      const fill = state ? getStatusColor(state.status, mapPalette) : mapPalette.none;

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
      path.style.cursor = state ? 'pointer' : 'default';
      path.style.opacity = dimOthers && !isSelected ? '0.55' : '1';
    });

    applyStateLabels();
  }, [applyStateLabels, mapPalette]);

  const refreshCounts = useCallback(async () => {
    setLoading(true);
    try {
      setDataError(null);

      // Use the source-of-truth orders table so totals match the DB.
      // The generated Supabase types for this portal may not include orders.
      const supabaseUntyped = supabase as unknown as {
        from: (
          table: string
        ) => {
          select: (cols: string) => {
            order: (
              column: string,
              opts: { ascending: boolean }
            ) => Promise<{ data: OrderRow[] | null; error: unknown }>;
          };
        };
      };

      const { data, error } = await supabaseUntyped
        .from('orders')
        .select('id,target_states,lawyer_id,status,created_at,expires_at,quota_total,quota_filled')
        .order('created_at', { ascending: false });

      if (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      const attorneyProfileResponse = await (supabase as any)
        .from('attorney_profiles')
        .select('user_id, account_type');

      if (attorneyProfileResponse.error) {
        throw attorneyProfileResponse.error instanceof Error
          ? attorneyProfileResponse.error
          : new Error(String(attorneyProfileResponse.error));
      }

      const accountTypeByUser = new Map<string, AttorneyAccountType>();
      ((attorneyProfileResponse.data ?? []) as Array<{ user_id?: string; account_type?: AttorneyAccountType }>).forEach((profile) => {
        const userId = String(profile.user_id || '').trim();
        if (!userId) return;
        accountTypeByUser.set(userId, profile.account_type ?? null);
      });

      const rows = (data ?? []) as OrderRow[];
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

      const nextStates: StateSales[] = US_STATES.map((s) => {
        const sales = counts.get(s.code) ?? 0;
        return {
          code: s.code,
          name: s.name,
          sales,
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

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Sales Map</h2>
          <p className="text-sm text-muted-foreground">Submitted orders by state</p>
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Submitted Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-semibold">{totalOrders}</div>
              <div className="mt-1 text-sm text-muted-foreground">{selectedAccountMeta.label}</div>
            </div>
          </CardContent>
        </Card>

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
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <div ref={mapRootRef} className="w-full overflow-hidden rounded-lg bg-white" style={{ height: 520 }} />

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
                className="pointer-events-none absolute z-10 rounded-lg border bg-background px-3 py-2 shadow-lg"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <div className="font-semibold">
                  {tooltip.state.name} ({tooltip.state.code})
                </div>
                <div className="mt-1 flex items-center gap-2">
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
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div>Category: {selectedAccountMeta.label}</div>
                  <div>Orders: {tooltip.state.sales}</div>
                </div>
              </div>
            ) : null}
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
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle>
              {selectedState ? `Orders in ${selectedState.name} (${selectedState.code})` : 'Orders'}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between gap-3">
            <Badge variant="secondary">{selectedStateOrders.length} orders</Badge>
            {loading ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : null}
          </div>

          <div className="mt-4 space-y-2 overflow-auto pr-1" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            {!selectedStateCode ? (
              <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                Select a state to view orders.
              </div>
            ) : selectedStateOrders.length === 0 ? (
              <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                No submitted orders in this state.
              </div>
            ) : (
              selectedStateOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="w-full rounded-lg border bg-background px-3 py-3 text-left transition hover:bg-muted"
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
