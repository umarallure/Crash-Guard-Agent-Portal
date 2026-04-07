import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Sparkles,
  UserPlus,
  TrendingUp,
  ArrowLeftRight,
  MessageSquare,
  Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AppNotification, NotificationCategory } from '@/hooks/useNotifications';

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const secs = Math.floor(diff / 1_000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (secs < 60) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

const CATEGORY_CONFIG: Record<
  NotificationCategory,
  { icon: React.ElementType; bg: string; color: string; label: string }
> = {
  new_lead: {
    icon: Sparkles,
    bg: 'bg-primary/10',
    color: 'text-primary',
    label: 'New Lead',
  },
  lead_assigned: {
    icon: UserPlus,
    bg: 'bg-green-500/10',
    color: 'text-green-600',
    label: 'Lead Assigned',
  },
  stage_updated: {
    icon: TrendingUp,
    bg: 'bg-blue-500/10',
    color: 'text-blue-600',
    label: 'Status Updated',
  },
  pipeline_changed: {
    icon: ArrowLeftRight,
    bg: 'bg-amber-500/10',
    color: 'text-amber-600',
    label: 'Pipeline Changed',
  },
  note_added: {
    icon: MessageSquare,
    bg: 'bg-muted',
    color: 'text-muted-foreground',
    label: 'Note Added',
  },
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error) setNotifications((data ?? []) as AppNotification[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const markAsRead = useCallback(async (id: string) => {
    await (supabase as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setMarkingAll(true);
    try {
      await (supabase as any)
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  }, [notifications]);

  async function handleClick(notif: AppNotification) {
    if (!notif.is_read) await markAsRead(notif.id);
    if (notif.redirect_url) navigate(notif.redirect_url);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {unreadCount} unread
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Bell className="h-10 w-10 opacity-20" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((notif) => {
              const cfg =
                CATEGORY_CONFIG[notif.category] ?? CATEGORY_CONFIG.note_added;
              const Icon = cfg.icon;

              return (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left flex items-start gap-4 px-5 py-4 transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 ${
                    !notif.is_read ? 'bg-primary/[0.03]' : ''
                  }`}
                >
                  {/* Icon */}
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <p
                        className={`text-sm leading-snug ${
                          !notif.is_read
                            ? 'font-semibold text-foreground'
                            : 'font-medium text-foreground/80'
                        }`}
                      >
                        {notif.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap mt-px">
                        {timeAgo(notif.created_at)}
                      </span>
                    </div>
                    {notif.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        {notif.description}
                      </p>
                    )}
                    <span
                      className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color}`}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  {/* Unread dot */}
                  {!notif.is_read && (
                    <span
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && notifications.length > 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Showing {notifications.length} notifications
        </p>
      )}
    </div>
  );
}
