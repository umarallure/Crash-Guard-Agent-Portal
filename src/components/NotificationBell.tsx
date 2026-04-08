import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Sparkles,
  UserPlus,
  TrendingUp,
  ArrowLeftRight,
  MessageSquare,
  Check,
  FolderOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification, NotificationCategory } from '@/hooks/useNotifications';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  NotificationCategory,
  { icon: React.ElementType; bg: string; color: string }
> = {
  new_lead:         { icon: Sparkles,       bg: 'bg-primary/10',    color: 'text-primary' },
  lead_assigned:    { icon: UserPlus,       bg: 'bg-green-500/10',  color: 'text-green-600' },
  stage_updated:    { icon: TrendingUp,     bg: 'bg-blue-500/10',   color: 'text-blue-600' },
  pipeline_changed: { icon: ArrowLeftRight, bg: 'bg-amber-500/10',  color: 'text-amber-600' },
  note_added:       { icon: MessageSquare,  bg: 'bg-muted',         color: 'text-muted-foreground' },
};

function CategoryIcon({ category }: { category: NotificationCategory }) {
  const { icon: Icon, bg, color } = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.note_added;
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bg}`}>
      <Icon className={`h-3.5 w-3.5 ${color}`} />
    </span>
  );
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

interface NotificationGroup {
  key: string;
  lead_id: string | null;
  lead_name: string | null;
  items: AppNotification[];
  groupUnreadCount: number;
  latestAt: string;
}

function buildGroups(notifications: AppNotification[]): NotificationGroup[] {
  const map = new Map<string, NotificationGroup>();

  for (const n of notifications) {
    const key = n.lead_id ?? `_ungrouped_${n.id}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        lead_id: n.lead_id,
        lead_name: n.lead_name ?? null,
        items: [],
        groupUnreadCount: 0,
        latestAt: n.created_at,
      });
    }

    const group = map.get(key)!;
    group.items.push(n);
    if (!n.is_read) group.groupUnreadCount++;
    if (n.created_at > group.latestAt) group.latestAt = n.created_at;
  }

  return Array.from(map.values())
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
    .slice(0, 8);
}

// ─── Individual notification row ──────────────────────────────────────────────

function NotificationRow({
  notif,
  onClick,
}: {
  notif: AppNotification;
  onClick: (n: AppNotification) => void;
}) {
  return (
    <button
      onClick={() => onClick(notif)}
      className={`relative w-full text-left flex items-start gap-2.5 pl-8 pr-4 py-2.5 transition-colors hover:bg-primary/5 focus-visible:outline-none border-t border-border/50 ${
        !notif.is_read ? 'bg-primary/[0.03]' : ''
      }`}
    >
      {!notif.is_read && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
      )}

      <CategoryIcon category={notif.category} />

      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug truncate ${!notif.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
          {notif.title}
        </p>
        {notif.description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
            {notif.description}
          </p>
        )}
        <time className="mt-0.5 block text-[11px] text-muted-foreground/70">
          {timeAgo(notif.created_at)}
        </time>
      </div>
    </button>
  );
}

// ─── Group header row ─────────────────────────────────────────────────────────

function GroupHeader({
  group,
  expanded,
  onToggle,
}: {
  group: NotificationGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-full text-left flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-primary/5 focus-visible:outline-none ${
        group.groupUnreadCount > 0 ? 'bg-primary/[0.03]' : ''
      }`}
    >
      {group.groupUnreadCount > 0 && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
      )}

      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">
          {group.lead_name ? `Opportunity: ${group.lead_name}` : 'General'}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {group.items.length} notification{group.items.length !== 1 ? 's' : ''}
        </p>
      </div>

      {group.groupUnreadCount > 0 && (
        <span className="shrink-0 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1 leading-none">
          {group.groupUnreadCount}
        </span>
      )}

      {expanded
        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      }
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const grouped = useMemo(() => buildGroups(notifications), [notifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function toggleGroup(key: string) {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleNotificationClick(notif: AppNotification) {
    if (!notif.is_read) await markAsRead(notif.id);
    setOpen(false);
    if (notif.redirect_url) navigate(notif.redirect_url);
  }

  return (
    <div className="relative">
      {/* Bell trigger */}
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-fade-in"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary leading-none">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead(notifications)}
                className="flex items-center gap-1 rounded text-xs text-primary hover:text-primary/70 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[440px] overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <Bell className="h-9 w-9 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.key}>
                  <GroupHeader
                    group={group}
                    expanded={expandedKeys.includes(group.key)}
                    onToggle={() => toggleGroup(group.key)}
                  />
                  {expandedKeys.includes(group.key) && (
                    <div>
                      {group.items.map((notif) => (
                        <NotificationRow
                          key={notif.id}
                          notif={notif}
                          onClick={handleNotificationClick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5 text-center">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              className="text-xs font-medium text-primary hover:text-primary/70 transition-colors"
            >
              Show all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
