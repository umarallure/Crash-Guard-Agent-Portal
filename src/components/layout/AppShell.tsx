import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Grid3X3,
  LayoutDashboard,
  Map,
  Package,
  Users,
  LogOut,
  Zap,
  Eye,
  CheckCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  TrendingUp,
  Scale,
  Phone,
  MessageSquare,
  Tag,
  Award,
  CalendarDays,
  Sun,
  Moon,
  Landmark,
  DollarSign,
  Search,
} from 'lucide-react';

import { TbUserShield } from "react-icons/tb";

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useCenterUser } from '@/hooks/useCenterUser';
import { useTheme } from '@/hooks/useTheme';
import { getPortalRoleFlags, isRestrictedUser } from '@/lib/userPermissions';
import { NotificationBell } from '@/components/NotificationBell';

type NavItem = {
  label: string;
  to: string;
  icon: ReactNode;
  end?: boolean;
  show?: boolean;
};

const linkBaseClass =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

interface AppShellProps {
  title: string;
  children: ReactNode;
  collapseSidebar?: boolean;
  defaultSidebarCollapsed?: boolean;
  autoCollapseSidebarAfterMs?: number;
}

const AppShell = ({
  title,
  children,
  collapseSidebar = false,
  defaultSidebarCollapsed,
  autoCollapseSidebarAfterMs,
}: AppShellProps) => {
  const { user, signOut } = useAuth();
  const { isCenterUser } = useCenterUser();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { activeNav?: string } | null) || null;
  const activeNavOverride = locationState?.activeNav;

  const isDailyDealFlowRoute = location.pathname.startsWith('/daily-deal-flow');
  const isCallUpdateRoute = location.pathname.startsWith('/call-result-update');
  const isScoreboardRoute = location.pathname.startsWith('/scoreboard-dashboard');
  const forceCollapsedSidebar = isCallUpdateRoute;
  const hideSidebarOnMobile = isScoreboardRoute;

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (forceCollapsedSidebar) return true;

    // Outside Daily Deal Flow, keep sidebar open.
    if (!isDailyDealFlowRoute) return false;

    // If the route provides an explicit default (e.g., Daily Deal Flow), honor it.
    if (defaultSidebarCollapsed !== undefined) return defaultSidebarCollapsed;

    // Otherwise, persist the last choice for Daily Deal Flow.
    try {
      const stored = window.localStorage.getItem('app_shell_sidebar_collapsed');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch (error) {
      console.warn('Failed to read sidebar collapsed state from localStorage', error);
    }

    return collapseSidebar;
  });

  useEffect(() => {
    // Keep the persisted state aligned for Daily Deal Flow routes that don't force a default.
    if (!isDailyDealFlowRoute) return;
    if (defaultSidebarCollapsed !== undefined) return;
    try {
      window.localStorage.setItem('app_shell_sidebar_collapsed', String(sidebarCollapsed));
    } catch (error) {
      console.warn('Failed to persist sidebar collapsed state to localStorage', error);
    }
  }, [sidebarCollapsed, defaultSidebarCollapsed, isDailyDealFlowRoute]);

  useEffect(() => {
    if (forceCollapsedSidebar) {
      setSidebarCollapsed(true);
      return;
    }

    // Whenever we arrive on a non–Daily Deal Flow route, default the sidebar to open.
    if (isDailyDealFlowRoute) return;
    setSidebarCollapsed(false);
  }, [forceCollapsedSidebar, isDailyDealFlowRoute, location.pathname]);

  useEffect(() => {
    // If a route forces a default (e.g., Daily Deal Flow), apply it immediately.
    if (defaultSidebarCollapsed === undefined) return;
    if (!isDailyDealFlowRoute) return;
    setSidebarCollapsed(defaultSidebarCollapsed);
  }, [defaultSidebarCollapsed, isDailyDealFlowRoute]);

  const isSidebarCollapsed = forceCollapsedSidebar ? true : sidebarCollapsed;

  const autoCollapseTimeoutRef = useRef<number | null>(null);

  const clearAutoCollapseTimer = () => {
    if (autoCollapseTimeoutRef.current !== null) {
      window.clearTimeout(autoCollapseTimeoutRef.current);
      autoCollapseTimeoutRef.current = null;
    }
  };

  const startAutoCollapseTimer = () => {
    if (!autoCollapseSidebarAfterMs) return;
    clearAutoCollapseTimer();
    autoCollapseTimeoutRef.current = window.setTimeout(() => {
      setSidebarCollapsed(true);
    }, autoCollapseSidebarAfterMs);
  };

  const handleSidebarActivity = () => {
    if (!autoCollapseSidebarAfterMs) return;
    if (isSidebarCollapsed) return;
    startAutoCollapseTimer();
  };

  useEffect(() => {
    if (!autoCollapseSidebarAfterMs) return;

    // Only run the timer when the sidebar is opened.
    if (!isSidebarCollapsed) startAutoCollapseTimer();
    else clearAutoCollapseTimer();

    return () => {
      clearAutoCollapseTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCollapseSidebarAfterMs, isSidebarCollapsed]);

  const [isAdmin, setIsAdmin] = useState(() => {
    if (!user?.id) return false;
    try {
      return localStorage.getItem(`cg_is_admin:${user.id}`) === '1';
    } catch {
      return false;
    }
  });
  const [isAgentRole, setIsAgentRole] = useState(false);

  useEffect(() => {
    const checkRoleStatus = async () => {
      if (!user) return;

      try {
        const cached = localStorage.getItem(`cg_is_admin:${user.id}`);
        if (cached === '1') setIsAdmin(true);
      } catch {
        // ignore
      }
      
      try {
        const roleFlags = await getPortalRoleFlags(user.id);
        setIsAdmin(roleFlags.isAdmin);
        setIsAgentRole(roleFlags.isAgent);
        try {
          localStorage.setItem(`cg_is_admin:${user.id}`, roleFlags.isAdmin ? '1' : '0');
        } catch {
          // ignore
        }
      } catch (error) {
        console.error('Error checking role status:', error);
      }
    };

    checkRoleStatus();
  }, [user]);

  const navItems = useMemo<NavItem[]>(() => {
    const restricted = isRestrictedUser(user?.id);
    const canAccessAgentPages = !isCenterUser && !restricted;
    const canAccessTaskManagement = (isAdmin || isAgentRole) && canAccessAgentPages;

    // Keep nav aligned with existing access rules.
    const items: NavItem[] = [
      {
        label: 'Dashboard',
        to: '/scoreboard-dashboard',
        icon: <TrendingUp className="h-4 w-4 text-current" />,
        show: isAdmin && canAccessAgentPages,
      },
      {
        label: 'Closer Scoreboard',
        to: '/closer-scoreboard',
        icon: <Award className="h-4 w-4 text-current" />,
        show: isAdmin && canAccessAgentPages,
      },
      {
        label: 'Task Management',
        to: '/task-management',
        icon: <CalendarDays className="h-4 w-4 text-current" />,
        show: canAccessTaskManagement,
      },
      {
        label: 'Closer Portal',
        to: '/closer-portal',
        icon: <Users className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Transfer Pipeline',
        to: '/transfer-portal',
        icon: <Eye className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Submission Pipeline',
        to: '/submission-portal',
        icon: <CheckCircle className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Daily Deal Flow',
        to: '/daily-deal-flow',
        icon: <Grid3X3 className="h-4 w-4 text-current" />,
        show: canAccessAgentPages || restricted,
      },
      {
        label: 'Sales Map',
        to: '/sales-map',
        icon: <Map className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Order Fulfillment',
        to: '/order-fulfillment',
        icon: <Package className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'All Leads',
        to: '/leads',
        icon: <Users className="h-4 w-4 text-current" />,
        end: true,
        show: false,
      },
      {
        label: 'Dialer',
        to: '/aloware-dialer',
        icon: <Phone className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Slack',
        to: '/slack',
        icon: <MessageSquare className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Products',
        to: '/products',
        icon: <Tag className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Product Offering',
        to: '/product-offering',
        icon: <Tag className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Lawyers Criteria',
        to: '/lawyer-requirements',
        icon: <Scale className="h-4 w-4 text-current" />,
        show: isAdmin && canAccessAgentPages,
      },
      {
        label: 'Commission',
        to: '/commission-portal',
        icon: <DollarSign className="h-4 w-4 text-current" />,
        show: canAccessAgentPages,
      },
      {
        label: 'Transfer Checker',
        to: '/internal-transfer-checker',
        icon: <Search className="h-4 w-4 text-current" />,
        show: true,
      },
      {
        label: 'Deel',
        to: '/deel',
        icon: <Landmark className="h-4 w-4 text-current" />,
      },
    ];

    return items.filter((i) => i.show !== false);
  }, [
    user?.id,
    isCenterUser,
    isAdmin,
    isAgentRole,
  ]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const avatarFallback = useMemo(() => {
    const email = user?.email;
    if (!email) return '?';
    return email.trim().charAt(0).toUpperCase();
  }, [user?.email]);

  return (
    <div className="h-screen w-full bg-background overflow-hidden">
      <div className="flex h-full w-full">
        <aside
          onMouseMove={handleSidebarActivity}
          onMouseDown={handleSidebarActivity}
          onKeyDown={handleSidebarActivity}
          onFocus={handleSidebarActivity}
          onTouchStart={handleSidebarActivity}
          className={
            `${hideSidebarOnMobile ? 'hidden md:flex' : 'flex'} ${
              isSidebarCollapsed
                ? 'w-16 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col'
                : 'w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col'
            }`
          }
        >
          <div
            className={
              isSidebarCollapsed
                ? "h-14 px-2 flex items-center justify-center border-b border-sidebar-border"
                : "h-14 px-4 flex items-center border-b border-sidebar-border"
            }
          >
            <img
              src={isSidebarCollapsed ? '/assets/logo-collapse.png' : '/assets/logo.png'}
              alt="Crash Guard"
              className={isSidebarCollapsed ? "h-10 w-auto max-w-full" : "h-7 w-auto"}
            />
          </div>

          <nav
            className="px-2 py-3 space-y-1 flex-1 overflow-y-auto"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `${linkBaseClass} ${
                    isSidebarCollapsed ? "justify-center px-0" : ""
                  } ${
                    (activeNavOverride ? activeNavOverride === item.to : isActive)
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20"
                  }`
                }
                title={isSidebarCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!isSidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 min-h-0 flex-col">
          <header className="h-14 border-b bg-card">
            <div className="h-full px-3 sm:px-6 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {hideSidebarOnMobile ? (
                  <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 md:hidden"
                        aria-label="Open navigation"
                      >
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="left"
                      className="p-0 w-64 bg-sidebar text-sidebar-foreground border-sidebar-border !bg-sidebar [&>button]:top-3 [&>button]:right-3 [&>button]:text-muted-foreground [&>button]:hover:text-foreground [&>button]:hover:bg-primary/10"
                    >
                      <div className="h-14 px-4 flex items-center border-b border-sidebar-border">
                        <img src="/assets/logo.png" alt="Crash Guard" className="h-7 w-auto" />
                      </div>
                      <nav className="px-2 py-3 space-y-1.5 overflow-y-auto">
                        {navItems.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            onClick={() => setMobileNavOpen(false)}
                            className={({ isActive }) =>
                              `${linkBaseClass} ${
                                (activeNavOverride ? activeNavOverride === item.to : isActive)
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : "text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20"
                              }`
                            }
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </NavLink>
                        ))}
                      </nav>
                    </SheetContent>
                  </Sheet>
                ) : !isCallUpdateRoute ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={isSidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}
                    onClick={() => {
                      setSidebarCollapsed((prev) => !prev);
                    }}
                  >
                    {isSidebarCollapsed ? (
                      <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                  </Button>
                ) : null}

                {hideSidebarOnMobile && (
                  <img src="/assets/logo.png" alt="Crash Guard" className="h-6 w-auto md:hidden" />
                )}

                <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                  title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                  onClick={toggleTheme}
                >
                  {theme === 'dark'
                    ? <Sun className="h-4 w-4" />
                    : <Moon className="h-4 w-4" />}
                </Button>
                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      aria-label="Account menu"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src="" alt={user?.email || 'User'} />
                        <AvatarFallback className="text-foreground">{avatarFallback}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground truncate">
                      {user?.email || 'Signed in'}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleSignOut();
                      }}
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <main className="app-main min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      {/* Keep route changes from forcing scroll lock in some pages */}
      <div className="sr-only">{location.pathname}</div>
    </div>
  );
};

export default AppShell;
