export const RESTRICTED_USER_IDS = ['adda1255-2a0b-41da-9df0-3100d01b8649', 'eceb7ac0-0e4a-44ad-bb70-ba66010d0baa'];

/**
 * Check if the current user has restricted access (read-only view)
 * @param userId - The current user's ID
 * @returns boolean indicating if user has restricted access
 */
export const isRestrictedUser = (userId: string | undefined): boolean => {
  return userId ? RESTRICTED_USER_IDS.includes(userId) : false;
};

/**
 * Check if the current user can perform write operations (create, edit, delete)
 * @param userId - The current user's ID
 * @returns boolean indicating if user can perform write operations
 */
export const canPerformWriteOperations = (userId: string | undefined): boolean => {
  return !isRestrictedUser(userId);
};

/**
 * Check if the current user can access navigation menu
 * @param userId - The current user's ID
 * @returns boolean indicating if user can access navigation menu
 */
export const canAccessNavigation = (userId: string | undefined): boolean => {
  return !isRestrictedUser(userId);
};

/**
 * Check if the current user is a center user (lead vendor)
 * @param userId - The current user's ID
 * @returns boolean indicating if user is a center user
 */
export const isCenterUser = async (userId: string | undefined): Promise<boolean> => {
  if (!userId) return false;

  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const supabaseUntyped = supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: boolean) => {
            or: (filter: string) => {
              maybeSingle: () => Promise<{ data: { id?: string | null } | null; error: unknown }>;
            };
          };
        };
      };
    };
    const { data, error } = await supabaseUntyped
      .from('centers')
      .select('id')
      .eq('is_active', true)
      .or(`user_id.eq.${userId},admin_user_id.eq.${userId}`)
      .maybeSingle();

    return !error && !!data;
  } catch (error) {
    console.error('Error checking center user:', error);
    return false;
  }
};

/**
 * Check if the current user is a buffer agent
 * @param userId - The current user's ID
 * @returns boolean indicating if user is a buffer agent
 */
export const isBufferAgent = async (userId: string | undefined): Promise<boolean> => {
  if (!userId) return false;

  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', userId)
      .single();

    if (error || !data) return false;

    // Buffer agent names list
    const bufferAgentNames = [
      'Ira', 'Kyla', 'Syed Kazmi', 'Justine', 'Kaye', 'Viez', 
      'Lourd', 'Mary', 'Nicole Mejia', 'Angelica', 'Laiza Batain'
    ];

    return bufferAgentNames.includes(data.display_name);
  } catch (error) {
    console.error('Error checking buffer agent:', error);
    return false;
  }
};
