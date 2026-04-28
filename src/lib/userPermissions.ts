export const RESTRICTED_USER_IDS = ['adda1255-2a0b-41da-9df0-3100d01b8649', 'eceb7ac0-0e4a-44ad-bb70-ba66010d0baa'];

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const TASK_AGENT_ROLES = new Set(['agent', 'admin', 'super_admin']);

export interface PortalRoleFlags {
  roles: string[];
  isAdmin: boolean;
  isAgent: boolean;
  isSuperAdmin: boolean;
  canAccessTaskManagement: boolean;
}

type AppUserRoleRow = { role?: string | null; is_super_admin?: boolean | null };

type AppUserRoleClient = {
  from: (table: 'app_users') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: AppUserRoleRow | null; error: unknown }>;
      };
    };
  };
};

const emptyRoleFlags = (): PortalRoleFlags => ({
  roles: [],
  isAdmin: false,
  isAgent: false,
  isSuperAdmin: false,
  canAccessTaskManagement: false,
});

const normalizeRole = (role: string | null | undefined) => role?.trim().toLowerCase() || '';

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
 * Resolve portal roles from both legacy app_users.role and user_roles.
 */
export const getPortalRoleFlags = async (
  userId: string | undefined,
): Promise<PortalRoleFlags> => {
  if (!userId) return emptyRoleFlags();

  const roles = new Set<string>();
  let isSuperAdmin = false;

  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const appUserClient = supabase as unknown as AppUserRoleClient;

    const { data: appUser, error: appUserError } = await appUserClient
      .from('app_users')
      .select('role, is_super_admin')
      .eq('user_id', userId)
      .maybeSingle();

    if (!appUserError && appUser) {
      const role = normalizeRole(appUser.role);
      if (role) roles.add(role);
      isSuperAdmin = appUser.is_super_admin === true || role === 'super_admin';
    }

    const { data: userRoles, error: userRolesError } = await supabase
      .from('user_roles')
      .select('role, is_active')
      .eq('user_id', userId);

    if (!userRolesError) {
      (userRoles || []).forEach((row) => {
        if (row.is_active === false) return;
        const role = normalizeRole(row.role);
        if (role) roles.add(role);
        if (role === 'super_admin') isSuperAdmin = true;
      });
    }
  } catch (error) {
    console.error('Error resolving portal role flags:', error);
  }

  const roleList = Array.from(roles);
  const isAdmin = isSuperAdmin || roleList.some((role) => ADMIN_ROLES.has(role));
  const isAgent = roleList.includes('agent');

  return {
    roles: roleList,
    isAdmin,
    isAgent,
    isSuperAdmin,
    canAccessTaskManagement: roleList.some((role) => TASK_AGENT_ROLES.has(role)) || isSuperAdmin,
  };
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
