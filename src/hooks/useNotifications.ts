import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type NotificationCategory =
  | 'new_lead'
  | 'lead_assigned'
  | 'stage_updated'
  | 'pipeline_changed'
  | 'note_added';

export interface AppNotification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  category: NotificationCategory;
  title: string;
  description: string | null;
  redirect_url: string | null;
  is_read: boolean;
  created_at: string;
}

const POLL_INTERVAL_MS = 15_000; // check for new notifications every 15 s

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[useNotifications] markAsRead error:', err);
    }
  }, []);

  const markAllAsRead = useCallback(
    async (currentNotifications: AppNotification[]) => {
      const unreadIds = currentNotifications.filter((n) => !n.is_read).map((n) => n.id);
      if (!userId || unreadIds.length === 0) return;

      try {
        const { error } = await (supabase as any)
          .from('notifications')
          .update({ is_read: true })
          .in('id', unreadIds);

        if (error) throw error;

        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
      } catch (err) {
        console.error('[useNotifications] markAllAsRead error:', err);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return;

    let mounted = true;
    // Tracks the most recent created_at we've already loaded so incremental
    // polls only fetch genuinely new rows — keeps network cost near-zero.
    let latestCreatedAt = '';

    async function poll(isFirst: boolean) {
      if (!mounted) return;

      try {
        const query = (supabase as any)
          .from('notifications')
          .select('*')
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false });

        if (latestCreatedAt) {
          // Only rows newer than the last one we know about
          query.gt('created_at', latestCreatedAt);
        } else {
          // First load — grab the 50 most recent
          query.limit(50);
        }

        const { data, error } = await query;
        if (!mounted || error) return;

        const rows = (data ?? []) as AppNotification[];

        if (isFirst) {
          setNotifications(rows);
          setUnreadCount(rows.filter((n) => !n.is_read).length);
        } else if (rows.length > 0) {
          // Prepend new rows and cap the list at 50
          setNotifications((prev) => [...rows, ...prev].slice(0, 50));
          setUnreadCount((prev) => prev + rows.filter((n) => !n.is_read).length);
        }

        if (rows.length > 0) {
          // rows[0] is the newest because we ordered desc
          latestCreatedAt = rows[0].created_at;
        }
      } catch (err) {
        console.error('[useNotifications] poll error:', err);
      }
    }

    setLoading(true);
    poll(true).finally(() => {
      if (mounted) setLoading(false);
    });

    const intervalId = window.setInterval(() => poll(false), POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead: (notifs: AppNotification[]) => markAllAsRead(notifs),
  };
}
