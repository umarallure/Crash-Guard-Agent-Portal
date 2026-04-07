import { useRef, useState, useEffect } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
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

// ─── Category icon ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  NotificationCategory,
  { icon: React.ElementType; bg: string; color: string }
> = {
  new_lead: {
    icon: Sparkles,
    bg: 'bg-primary/10',
    color: 'text-primary',
  },
  lead_assigned: {
    icon: UserPlus,
    bg: 'bg-green-500/10',
    color: 'text-green-600',
  },
  stage_updated: {
    icon: TrendingUp,
    bg: 'bg-blue-500/10',
    color: 'text-blue-600',
  },
  pipeline_changed: {
    icon: ArrowLeftRight,
    bg: 'bg-amber-500/10',
    color: 'text-amber-600',
  },
  note_added: {
    icon: MessageSquare,
    bg: 'bg-muted',
    color: 'text-muted-foreground',
  },
};

function CategoryIcon({ category }: { category: NotificationCategory }) {
  const { icon: Icon, bg, color } = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.note_added;
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
      <Icon className={`h-4 w-4 ${color}`} />
    </span>
  );
}

// ─── Notification card ───────────────────────────────────────────────────────

function NotificationCard({
  notif,
  onClick,
}: {
  notif: AppNotification;
  onClick: (n: AppNotification) => void;
}) {
  return (
    <button
      key={notif.id}
      onClick={() => onClick(notif)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 ${
        !notif.is_read ? 'bg-primary/[0.03]' : ''
      }`}
    >
      <CategoryIcon category={notif.category} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm leading-snug ${
              !notif.is_read
                ? 'font-semibold text-foreground'
                : 'font-medium text-foreground/80'
            }`}
          >
            {notif.title}
          </p>
          <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap mt-px">
            {timeAgo(notif.created_at)}
          </span>
        </div>
        {notif.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {notif.description}
          </p>
        )}
      </div>

      {!notif.is_read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      )}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications(
    user?.id
  );
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
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

  async function handleCardClick(notif: AppNotification) {
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
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <Bell className="h-9 w-9 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notif) => (
                <NotificationCard key={notif.id} notif={notif} onClick={handleCardClick} />
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
