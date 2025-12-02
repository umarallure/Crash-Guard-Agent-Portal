import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, User, Menu, ChevronDown, Grid3X3, Eye, CheckCircle, BarChart3, Search, ArrowLeft, DollarSign, ShieldCheck, Zap, Users, Calendar, Inbox } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLicensedAgent } from '@/hooks/useLicensedAgent';
import { useCenterUser } from '@/hooks/useCenterUser';
import { canAccessNavigation, isBufferAgent as checkIsBufferAgent } from '@/lib/userPermissions';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TaskNotificationPanel } from './TaskNotificationPanel';

interface NavigationHeaderProps {
  title: string;
  showBackButton?: boolean;
  backTo?: string;
}

export const NavigationHeader = ({ title, showBackButton = false, backTo }: NavigationHeaderProps) => {
  const { user, signOut } = useAuth();
  const { isLicensedAgent, loading: licensedLoading } = useLicensedAgent();
  const { isCenterUser, loading: centerLoading } = useCenterUser();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBufferAgent, setIsBufferAgent] = useState(false);
  const [bufferLoading, setBufferLoading] = useState(true);
  
  const isBen = user?.id === '89da43d0-db34-4ffe-b6f1-8ca2453d2d76';
  const isAuthorizedUser = user?.id === '89da43d0-db34-4ffe-b6f1-8ca2453d2d76';
  const hasNavigationAccess = canAccessNavigation(user?.id);
  
  // Licensed agents, center users, buffer agents, and Ben should see navigation menu
  const shouldShowNavigation = (isAuthorizedUser && hasNavigationAccess) || (isLicensedAgent && !licensedLoading) || (isCenterUser && !centerLoading) || (isBufferAgent && !bufferLoading);
  
  // Find Eligible Agents should be visible to Ben, licensed agents, and center users
  const canAccessAgentFinder = isBen || (isLicensedAgent && !licensedLoading) || (isCenterUser && !centerLoading);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase.rpc('is_admin');
        if (!error && data) {
          setIsAdmin(true);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    const checkBufferStatus = async () => {
      if (!user) {
        setBufferLoading(false);
        return;
      }
      
      try {
        const result = await checkIsBufferAgent(user.id);
        setIsBufferAgent(result);
      } catch (error) {
        console.error('Error checking buffer agent status:', error);
      } finally {
        setBufferLoading(false);
      }
    };

    checkAdminStatus();
    checkBufferStatus();
  }, [user]);

  console.log('[NavigationHeader] Navigation visibility:', {
    userId: user?.id,
    email: user?.email,
    isLicensedAgent,
    licensedLoading,
    isCenterUser,
    centerLoading,
    isAuthorizedUser,
    hasNavigationAccess,
    shouldShowNavigation,
    canAccessAgentFinder
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="border-b bg-card">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          {showBackButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => backTo ? navigate(backTo) : navigate(-1)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <Badge variant="outline" className="flex items-center space-x-1">
            <User className="h-3 w-3" />
            <span>{user?.email}</span>
          </Badge>
        </div>
        <div className="flex items-center space-x-2">
          {/* Task Notification Panel for Licensed Agents */}
          {isLicensedAgent && !licensedLoading && <TaskNotificationPanel />}
          
          {/* Main Navigation Menu - Show for authorized users OR licensed agents */}
          {shouldShowNavigation && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Menu className="h-4 w-4" />
                  Menu
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* Only show Lead Management section for authorized users */}
                {isAuthorizedUser && hasNavigationAccess && (
                  <>
                    <DropdownMenuLabel>Lead Management</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => navigate('/daily-deal-flow')}>
                      <Grid3X3 className="mr-2 h-4 w-4" />
                      Daily Deal Flow
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/transfer-portal')}>
                      <Eye className="mr-2 h-4 w-4" />
                      Transfer Portal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/submission-portal')}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Submission Portal
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                
                {/* Commission Portal - Available for all licensed agents */}
                {isLicensedAgent && !licensedLoading && (
                  <>
                    <DropdownMenuLabel>Licensed Agent</DropdownMenuLabel>
                    
                    <DropdownMenuItem onClick={() => navigate('/licensed-agent-inbox')}>
                      <Inbox className="mr-2 h-4 w-4" />
                      Task Inbox
                    </DropdownMenuItem>
                    
      
                    <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                      <User className="mr-2 h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                
                {/* Center User - Available for center users */}
                {isCenterUser && !centerLoading && !isLicensedAgent && (
                  <>
                    <DropdownMenuLabel>Lead Vendor</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => navigate('/center-lead-portal')}>
                      <Grid3X3 className="mr-2 h-4 w-4" />
                      My Leads
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/center-calendar-view')}>
                      <Calendar className="mr-2 h-4 w-4" />
                      Calendar View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/agent-licensing')}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Find Eligible Agents
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                
                {/* Buffer/Retention Agent - Available for buffer agents */}
                {isBufferAgent && !bufferLoading && !isLicensedAgent && !isCenterUser && !isAuthorizedUser && (
                  <>
                    <DropdownMenuLabel>Retention Agent</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => navigate('/retention-tasks')}>
                      <Inbox className="mr-2 h-4 w-4" />
                      My Created Tasks
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                      <Grid3X3 className="mr-2 h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                
                {/* Reports & Analytics - Only for authorized users */}
                {isAuthorizedUser && hasNavigationAccess && (
                  <>
                    <DropdownMenuLabel>Reports & Analytics</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => navigate('/reports')}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Agent Reports & Logs
                    </DropdownMenuItem>
                    {isBen && (
                      <>
                        <DropdownMenuItem onClick={() => navigate('/admin-analytics/agents')}>
                          <BarChart3 className="mr-2 h-4 w-4" />
                          Admin Analytics
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Tools</DropdownMenuLabel>
                    
                    
                    <DropdownMenuItem onClick={() => navigate('/ghl-sync')}>
                      <Zap className="mr-2 h-4 w-4" />
                      GHL Sync Portal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                      <User className="mr-2 h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Sign Out Button */}
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};
