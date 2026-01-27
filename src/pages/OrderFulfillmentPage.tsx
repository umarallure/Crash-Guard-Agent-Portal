import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, RefreshCw, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

type OrderStatus = 'OPEN' | 'FULFILLED' | 'EXPIRED';

type OrderRow = {
  id: string;
  lawyer_id: string;
  target_states: string[];
  case_type: string;
  case_subtype: string | null;
  quota_total: number;
  quota_filled: number;
  status: OrderStatus;
  expires_at: string;
  created_at: string;
};

const STATUS_OPTIONS: Array<{ label: string; value: 'all' | OrderStatus }> = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Fulfilled', value: 'FULFILLED' },
  { label: 'Expired', value: 'EXPIRED' },
];

const formatDate = (iso: string) => {
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

const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

const getOrderPercent = (order: OrderRow) => {
  const total = Number(order.quota_total) || 0;
  const filled = Number(order.quota_filled) || 0;
  if (total <= 0) return 0;
  return clampPercent((filled / total) * 100);
};

const getStatusBadgeVariant = (status: OrderStatus) => {
  if (status === 'OPEN') return 'secondary';
  if (status === 'FULFILLED') return 'default';
  return 'outline';
};

const OrderFulfillmentPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [query, setQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | OrderStatus>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);

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

      const { data, error: qError } = await supabaseUntyped
        .from('orders')
        .select(
          'id,lawyer_id,target_states,case_type,case_subtype,quota_total,quota_filled,status,expires_at,created_at'
        )
        .order('created_at', { ascending: false });

      if (qError) {
        throw qError instanceof Error ? qError : new Error(String(qError));
      }

      setOrders((data ?? []) as OrderRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();

    return orders.filter((o) => {
      if (selectedStatus !== 'all' && o.status !== selectedStatus) return false;

      if (!q) return true;
      const haystack = [
        o.id,
        o.lawyer_id,
        o.case_type,
        o.case_subtype ?? '',
        (o.target_states ?? []).join(','),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, query, selectedStatus]);

  const stats = useMemo(() => {
    const total = orders.length;
    const open = orders.filter((o) => o.status === 'OPEN').length;
    const fulfilled = orders.filter((o) => o.status === 'FULFILLED').length;
    const expired = orders.filter((o) => o.status === 'EXPIRED').length;

    const openOrders = orders.filter((o) => o.status === 'OPEN');
    const avgOpenPct = openOrders.length
      ? Math.round(
          openOrders.reduce((sum, o) => sum + getOrderPercent(o), 0) / openOrders.length
        )
      : 0;

    return { total, open, fulfilled, expired, avgOpenPct };
  }, [orders]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Order Fulfillment</h2>
          <p className="text-sm text-muted-foreground">Track progress of all orders being fulfilled</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-semibold">{stats.total}</div>
            <Package className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-semibold">{stats.open}</div>
            <Badge variant="secondary">OPEN</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fulfilled</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-semibold">{stats.fulfilled}</div>
            <Badge>FULFILLED</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Open Completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold">{stats.avgOpenPct}%</div>
              <Badge variant="outline">OPEN</Badge>
            </div>
            <Progress value={stats.avgOpenPct} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by order id, lawyer id, case type, state..."
                  className="pl-9"
                />
              </div>

              <div className="w-full sm:w-56">
                <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as 'all' | OrderStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Badge variant="secondary">{filteredOrders.length} orders</Badge>
          </div>

          {error ? (
            <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              Failed to load orders: {error}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Target States</TableHead>
                <TableHead>Filled</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((o) => {
                const pct = getOrderPercent(o);
                const filled = Number(o.quota_filled) || 0;
                const total = Number(o.quota_total) || 0;

                return (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium">{o.case_type}</div>
                        {o.case_subtype ? (
                          <div className="text-xs text-muted-foreground">{o.case_subtype}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(o.status)}>{o.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(o.target_states ?? []).slice(0, 6).map((s) => (
                          <Badge key={`${o.id}-${s}`} variant="outline">
                            {String(s).toUpperCase()}
                          </Badge>
                        ))}
                        {(o.target_states ?? []).length > 6 ? (
                          <Badge variant="secondary">+{(o.target_states ?? []).length - 6}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {filled}/{total}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="w-[220px] space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{pct}%</span>
                          <span>{filled}/{total}</span>
                        </div>
                        <Progress value={pct} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(o.expires_at)}</TableCell>
                  </TableRow>
                );
              })}

              {!loading && filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No orders found
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderFulfillmentPage;
