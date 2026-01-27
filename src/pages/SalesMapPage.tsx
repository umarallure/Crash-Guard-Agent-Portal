import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { US_STATES } from '@/lib/us-states';

type CompetitionStatus = 'light' | 'moderate' | 'heavy';

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

type OpenOrderCountRow = {
  state_code: string;
  open_orders: number;
};

type OrderRow = {
  id: string;
  target_states: string[];
};

const MAP_PATH_SELECTOR = 'path[data-id], path[id]';

const toCompetitionStatus = (sales: number): CompetitionStatus => {
  if (sales < 10) return 'light';
  if (sales <= 20) return 'moderate';
  return 'heavy';
};

const getStatusColor = (status: CompetitionStatus) => {
  if (status === 'light') return '#22c55e';
  if (status === 'moderate') return '#eab308';
  return '#ef4444';
};

const getStatusLabel = (status: CompetitionStatus) => {
  if (status === 'light') return 'Low Sales';
  if (status === 'moderate') return 'Moderate Sales';
  return 'High Sales';
};

const SalesMapPage = () => {
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState<StateSales[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState>({ open: false, x: 0, y: 0, state: null });
  const [mapError, setMapError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const stateByCodeRef = useRef<Map<string, StateSales>>(new Map());
  const mountDoneRef = useRef(false);

  const stateByCode = useMemo(() => {
    const map = new Map<string, StateSales>();
    states.forEach((s) => map.set(s.code, s));
    return map;
  }, [states]);

  useEffect(() => {
    stateByCodeRef.current = stateByCode;
  }, [stateByCode]);

  const totalSales = useMemo(() => totalOrders, [totalOrders]);

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

  const applyStateCounts = useCallback(() => {
    const root = mapRootRef.current;
    if (!root) return;
    const svg = root.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    const old = svg.querySelector('#state-counts');
    if (old) old.remove();

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'state-counts');
    g.setAttribute('pointer-events', 'none');

    const paths = svg.querySelectorAll(MAP_PATH_SELECTOR);
    paths.forEach((p) => {
      const code = p.getAttribute('data-id') || p.getAttribute('id');
      if (!code) return;

      const state = stateByCodeRef.current.get(code);
      if (!state) return;
      if (!Number.isFinite(state.sales) || state.sales <= 0) return;

      let bbox: DOMRect;
      try {
        bbox = (p as unknown as SVGGraphicsElement).getBBox();
      } catch {
        return;
      }

      // Place badge inside the state (upper-right-ish quadrant, but still inside bbox).
      const minDim = Math.max(1, Math.min(bbox.width, bbox.height));
      const r = Math.max(7, Math.min(14, minDim / 3));

      const cx = bbox.x + bbox.width * 0.72;
      const cy = bbox.y + bbox.height * 0.30;

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = String(state.sales);
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String(cy));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');

      const fontSize = Math.max(8, Math.min(13, r * 1.05));
      text.style.setProperty('font-size', `${fontSize}px`, 'important');
      text.style.setProperty('font-weight', '800', 'important');
      text.style.setProperty(
        'font-family',
        'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        'important'
      );
      text.style.setProperty('fill', '#ffffff', 'important');
      text.style.setProperty('paint-order', 'stroke', 'important');
      text.style.setProperty('stroke', 'rgba(0,0,0,0.55)', 'important');
      text.style.setProperty('stroke-width', '3', 'important');
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
      const fill = state ? getStatusColor(state.status) : '#e5e7eb';

      // Set presentation attributes so the SVG's own styles (e.g. svg { fill: none; })
      // can't override our colors after layout/style recalculation.
      path.setAttribute('fill', fill);
      path.setAttribute('stroke', '#0b0b0b');
      path.setAttribute('stroke-width', '0.8');

      path.style.setProperty('fill', fill, 'important');
      path.style.setProperty('stroke', '#0b0b0b', 'important');
      path.style.setProperty('stroke-width', '0.8', 'important');
      path.style.cursor = state ? 'pointer' : 'default';
      path.style.opacity = '1';
    });

    applyStateLabels();
    applyStateCounts();
  }, [applyStateCounts, applyStateLabels]);

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
        .select('id,target_states')
        .order('created_at', { ascending: false });

      if (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      const rows = (data ?? []) as OrderRow[];
      setTotalOrders(rows.length);

      const counts = new Map<string, number>();
      for (const row of rows) {
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
      setStates(
        US_STATES.map((s) => ({
          code: s.code,
          name: s.name,
          sales: 0,
          status: 'light',
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (states.length === 0) return;
    applyMapColors();
  }, [applyMapColors, states]);

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

    const paths = svg.querySelectorAll(MAP_PATH_SELECTOR);
    paths.forEach((p) => {
      p.addEventListener('mouseenter', handleStateEnter);
      p.addEventListener('mouseleave', handleStateLeave);
    });
    svg.addEventListener('mousemove', handleMouseMove);

    return () => {
      paths.forEach((p) => {
        p.removeEventListener('mouseenter', handleStateEnter);
        p.removeEventListener('mouseleave', handleStateLeave);
      });
      svg.removeEventListener('mousemove', handleMouseMove);
    };
  }, [stateByCode]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Sales Map</h2>
          <p className="text-sm text-muted-foreground">Submitted orders by state</p>
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Submitted Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-semibold">{totalOrders}</div>
              <div className="mt-1 text-sm text-muted-foreground">All States</div>
            </div>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardContent className="p-4">
            <div className="text-sm font-medium">Legend</div>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                <span className="text-sm">Low (&lt; 10)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: '#eab308' }} />
                <span className="text-sm">Moderate (10–20)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-sm">High (&gt; 20)</span>
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
                      tooltip.state.status === 'light'
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
                  <div>Orders: {tooltip.state.sales}</div>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesMapPage;
