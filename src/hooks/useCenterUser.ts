import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface CenterInfo {
  id: string;
  center_name: string;
  lead_vendor: string;
  contact_email?: string;
  contact_phone?: string;
  is_active: boolean;
}

export const useCenterUser = () => {
  const { user } = useAuth();
  const [centerInfo, setCenterInfo] = useState<CenterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCenterUser, setIsCenterUser] = useState(false);

  useEffect(() => {
    const checkCenterUser = async () => {
      if (!user) {
        setCenterInfo(null);
        setIsCenterUser(false);
        setLoading(false);
        return;
      }

      try {
        const supabaseUntyped = supabase as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: boolean) => {
                or: (filter: string) => {
                  maybeSingle: () => Promise<{ data: CenterInfo | null; error: unknown }>;
                };
              };
            };
          };
        };

        const { data, error } = await supabaseUntyped
          .from('centers')
          .select('*')
          .eq('is_active', true)
          .or(`user_id.eq.${user.id},admin_user_id.eq.${user.id}`)
          .maybeSingle();

        if (error || !data) {
          setCenterInfo(null);
          setIsCenterUser(false);
        } else {
          setCenterInfo(data);
          setIsCenterUser(true);
        }
      } catch (error) {
        console.error('Error checking center user:', error);
        setCenterInfo(null);
        setIsCenterUser(false);
      } finally {
        setLoading(false);
      }
    };

    checkCenterUser();
  }, [user]);

  return {
    centerInfo,
    isCenterUser,
    loading,
    leadVendor: centerInfo?.lead_vendor || null
  };
};
