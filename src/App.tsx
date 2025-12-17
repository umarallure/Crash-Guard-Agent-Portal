import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import CenterProtectedRoute from "@/components/CenterProtectedRoute";
import LicensedAgentProtectedRoute from "@/components/LicensedAgentProtectedRoute";
import { AgentActivityDashboard } from "@/components/AgentActivityDashboard";
import ReportsPage from "./pages/Reports";
import Auth from "./pages/Auth";
import CenterAuth from "./pages/CenterAuth";
import Dashboard from "./pages/Dashboard";
import CenterLeadPortal from "./pages/CenterLeadPortal";
import CenterCalendarView from "./pages/CenterCalendarView";
import CallbackRequestPage from "./pages/CallbackRequestPage";
import CommissionPortal from "./pages/CommissionPortal";
import CallResultUpdate from "./pages/CallResultUpdate";
import CallResultJourney from "./pages/CallResultJourney";
import NewCallback from "./pages/NewCallback";
import DailyDealFlowPage from "./pages/DailyDealFlow/DailyDealFlowPage";
import TransferPortalPage from "./pages/TransferPortalPage";
import SubmissionPortalPage from "./pages/SubmissionPortalPage";
import BulkLookupPage from "./pages/BulkLookupPage";
import DealFlowLookup from "./pages/DealFlowLookup";
import AgentLicensing from "./pages/AgentLicensing";
import { AgentEligibilityPage } from "./pages/AgentEligibilityPage";
import GHLSyncPage from "./pages/GHLSyncPage/GHLSyncPage";
import BufferPerformanceReport from "./pages/BufferPerformanceReport";
import LicensedAgentPerformanceReport from "./pages/LicensedAgentPerformanceReport";
import LicensedAgentInbox from "./pages/LicensedAgentInbox";
import TaskDetailView from "./pages/TaskDetailView";
import RetentionTasksView from "./pages/RetentionTasksView";
import AdminAnalytics from "./pages/AdminAnalytics";
import { AgentsPage, VendorsPage, DailyPage, CarriersPage } from "./pages/AdminAnalytics/pages";
import NotFound from "./pages/NotFound";
import UserManagement from "./pages/UserManagement";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/center-auth" element={<CenterAuth />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/center-lead-portal" 
              element={
                <CenterProtectedRoute>
                  <CenterLeadPortal />
                </CenterProtectedRoute>
              } 
            />
            <Route 
              path="/center-calendar-view" 
              element={
                <CenterProtectedRoute>
                  <CenterCalendarView />
                </CenterProtectedRoute>
              } 
            />
            <Route 
              path="/center-callback-request" 
              element={
                <CenterProtectedRoute>
                  <CallbackRequestPage />
                </CenterProtectedRoute>
              } 
            />
            <Route 
              path="/commission-portal" 
              element={
                <LicensedAgentProtectedRoute>
                  <CommissionPortal />
                </LicensedAgentProtectedRoute>
              } 
            />
            <Route 
              path="/call-result-update" 
              element={
                <ProtectedRoute>
                  <CallResultUpdate />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/new-callback" 
              element={
                <ProtectedRoute>
                  <NewCallback />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/call-result-journey" 
              element={
                <ProtectedRoute>
                  <CallResultJourney />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/analytics" 
              element={
                <ProtectedRoute>
                  <AgentActivityDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/daily-deal-flow" 
              element={
                <ProtectedRoute>
                  <DailyDealFlowPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/transfer-portal" 
              element={
                <ProtectedRoute>
                  <TransferPortalPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/submission-portal" 
              element={
                <ProtectedRoute>
                  <SubmissionPortalPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/reports" 
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/bulk-lookup" 
              element={
                <ProtectedRoute>
                  <BulkLookupPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/deal-flow-lookup" 
              element={
                <ProtectedRoute>
                  <DealFlowLookup />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/ghl-sync" 
              element={
                <ProtectedRoute>
                  <GHLSyncPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/agent-licensing" 
              element={
                <ProtectedRoute>
                  <AgentLicensing />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/agent-eligibility" 
              element={
                <ProtectedRoute>
                  <AgentEligibilityPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/buffer-performance-report" 
              element={
                <ProtectedRoute>
                  <BufferPerformanceReport />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/licensed-agent-performance-report" 
              element={
                <ProtectedRoute>
                  <LicensedAgentPerformanceReport />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/licensed-agent-inbox" 
              element={
                <ProtectedRoute>
                  <LicensedAgentInbox />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/task/:taskId" 
              element={
                <ProtectedRoute>
                  <TaskDetailView />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/retention-tasks" 
              element={
                <ProtectedRoute>
                  <RetentionTasksView />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/user-management" 
              element={
                <ProtectedRoute>
                  <UserManagement />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin-analytics" 
              element={
                <ProtectedRoute>
                  <AdminAnalytics />
                </ProtectedRoute>
              }
            >
              <Route path="agents" element={<AgentsPage />} />
              <Route path="vendors" element={<VendorsPage />} />
              <Route path="daily" element={<DailyPage />} />
              <Route path="carriers" element={<CarriersPage />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
