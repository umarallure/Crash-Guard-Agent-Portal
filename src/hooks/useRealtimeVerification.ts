import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

export type VerificationItem = Database['public']['Tables']['verification_items']['Row'];
export type VerificationSession = Database['public']['Tables']['verification_sessions']['Row'];
export type LeadData = Database['public']['Tables']['leads']['Row'];

export function useRealtimeVerification(sessionId: string) {
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>([]);
  const [leadData, setLeadData] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial session data
  const fetchSessionData = async () => {
    try {
      setLoading(true);
      
      // Fetch session
      const { data: sessionData, error: sessionError } = await supabase
        .from('verification_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        throw sessionError;
      }

      let nextSessionData = sessionData;

      // Fetch verification items
      const { data: itemsData, error: itemsError } = await supabase
        .from('verification_items')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (itemsError) {
        throw itemsError;
      }

      let nextVerificationItems = itemsData || [];

      // Fetch lead data if we have a submission_id
      if (sessionData?.submission_id) {
        const { data: leadDataResult, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .eq('submission_id', sessionData.submission_id)
          .single();

        if (leadError) {
          console.warn('Could not fetch lead data:', leadError);
        } else {
          setLeadData(leadDataResult);

          const emailValue = String(leadDataResult?.email || '').trim();
          const hasEmailVerificationItem = nextVerificationItems.some(
            (item) => item.field_name === 'email'
          );

          if (emailValue && !hasEmailVerificationItem) {
            const emailInsertPayload: Database['public']['Tables']['verification_items']['Insert'] = {
              session_id: sessionId,
              field_name: 'email',
              field_category: 'contact',
              original_value: emailValue,
              verified_value: emailValue,
              is_verified: false,
              is_modified: false,
            };

            const { data: insertedEmailItem, error: emailInsertError } = await supabase
              .from('verification_items')
              .insert(emailInsertPayload)
              .select()
              .single();

            if (emailInsertError) {
              console.warn('Could not seed email verification item:', emailInsertError);
            } else if (insertedEmailItem) {
              nextVerificationItems = [...nextVerificationItems, insertedEmailItem];

              const nextTotalFields = nextVerificationItems.length;
              if ((nextSessionData.total_fields || 0) < nextTotalFields) {
                const { data: updatedSession, error: sessionUpdateError } = await supabase
                  .from('verification_sessions')
                  .update({
                    total_fields: nextTotalFields,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', sessionId)
                  .select('*')
                  .single();

                if (sessionUpdateError) {
                  console.warn('Could not update verification session field count:', sessionUpdateError);
                  nextSessionData = {
                    ...nextSessionData,
                    total_fields: nextTotalFields,
                    updated_at: new Date().toISOString(),
                  };
                } else if (updatedSession) {
                  nextSessionData = updatedSession;
                }
              }
            }
          }
        }
      }

      setSession(nextSessionData);
      setVerificationItems(nextVerificationItems);
      setError(null);
    } catch (err) {
      console.error('Error fetching session data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch session data');
    } finally {
      setLoading(false);
    }
  };

  // Update verification item
  const updateVerificationItem = async (itemId: string, updates: Partial<VerificationItem>) => {
    try {
      const { data, error } = await supabase
        .from('verification_items')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Update local state
      setVerificationItems(prev => 
        prev.map(item => 
          item.id === itemId ? { ...item, ...updates } : item
        )
      );

      return data;
    } catch (err) {
      console.error('Error updating verification item:', err);
      throw err;
    }
  };

  // Toggle verification status
  const toggleVerification = async (itemId: string, isVerified: boolean) => {
    await updateVerificationItem(itemId, { 
      is_verified: isVerified,
      verified_at: isVerified ? new Date().toISOString() : null,
    });
  };

  // Update verified value
  const updateVerifiedValue = async (itemId: string, verifiedValue: string) => {
    const item = verificationItems.find(i => i.id === itemId);
    const isModified = item?.original_value !== verifiedValue;
    
    await updateVerificationItem(itemId, { 
      verified_value: verifiedValue,
      is_modified: isModified,
    });
  };

  // Update verification notes
  const updateVerificationNotes = async (itemId: string, notes: string) => {
    await updateVerificationItem(itemId, { notes });
  };

  // Update session status
  const updateSessionStatus = async (status: string) => {
    try {
      const updates: Partial<VerificationSession> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'in_progress' && !session?.started_at) {
        updates.started_at = new Date().toISOString();
      }

      if (status === 'completed' || status === 'transferred') {
        updates.completed_at = new Date().toISOString();
      }

      if (status === 'transferred') {
        updates.transferred_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('verification_sessions')
        .update(updates)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setSession(prev => prev ? { ...prev, ...updates } : null);
      return data;
    } catch (err) {
      console.error('Error updating session status:', err);
      throw err;
    }
  };

  // Set up real-time subscriptions
  useEffect(() => {
    // Initial fetch
    fetchSessionData();

    // Subscribe to session changes
    const sessionChannel = supabase
      .channel(`verification_session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'verification_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setSession(payload.new as VerificationSession);
          }
        }
      )
      .subscribe();

    // Subscribe to verification items changes
    const itemsChannel = supabase
      .channel(`verification_items_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'verification_items',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setVerificationItems(prev =>
              prev.map(item =>
                item.id === payload.new.id ? payload.new as VerificationItem : item
              )
            );
          } else if (payload.eventType === 'INSERT') {
            setVerificationItems(prev =>
              prev.some(item => item.id === payload.new.id)
                ? prev
                : [...prev, payload.new as VerificationItem]
            );
          } else if (payload.eventType === 'DELETE') {
            setVerificationItems(prev =>
              prev.filter(item => item.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(itemsChannel);
    };
  }, [sessionId]);

  return {
    session,
    verificationItems,
    leadData,
    loading,
    error,
    toggleVerification,
    updateVerifiedValue,
    updateVerificationNotes,
    updateSessionStatus,
    refetch: fetchSessionData,
  };
}
