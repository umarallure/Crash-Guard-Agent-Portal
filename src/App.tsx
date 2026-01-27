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
import Leads from "./pages/Leads";
import CenterLeadPortal from "./pages/CenterLeadPortal";
import CenterCalendarView from "./pages/CenterCalendarView";
import CallbackRequestPage from "./pages/CallbackRequestPage";
import CommissionPortal from "./pages/CommissionPortal";
import CallResultUpdate from "./pages/CallResultUpdate";
import CallResultJourney from "./pages/CallResultJourney";
import NewCallback from "./pages/NewCallback";
import DailyDealFlowPage from "./pages/DailyDealFlow/DailyDealFlowPage";
import DailyDealFlowLeadDetailsPage from "./pages/DailyDealFlow/DailyDealFlowLeadDetailsPage";
import LeadDetailsPage from "./pages/LeadDetails/LeadDetailsPage";
import TransferPortalPage from "./pages/TransferPortalPage";
import SubmissionPortalPage from "./pages/SubmissionPortalPage";
import RetainersKanbanPage from "./pages/RetainersKanbanPage";
import BulkLookupPage from "./pages/BulkLookupPage";
import GHLSyncPage from "./pages/GHLSyncPage/GHLSyncPage";
import SalesMapPage from "./pages/SalesMapPage";
import OrderFulfillmentPage from "./pages/OrderFulfillmentPage";
import DealFlowLookup from "./pages/DealFlowLookup";
import AgentLicensing from "./pages/AgentLicensing";
import { AgentEligibilityPage } from "./pages/AgentEligibilityPage";
import BufferPerformanceReport from "./pages/BufferPerformanceReport";
import LicensedAgentPerformanceReport from "./pages/LicensedAgentPerformanceReport";
import LicensedAgentInbox from "./pages/LicensedAgentInbox";
import TaskDetailView from "./pages/TaskDetailView";
import RetentionTasksView from "./pages/RetentionTasksView";
import AdminAnalytics from "./pages/AdminAnalytics";
import { AgentsPage, VendorsPage, DailyPage, CarriersPage } from "./pages/AdminAnalytics/pages";
import NotFound from "./pages/NotFound";
import UserManagement from "./pages/UserManagement";
import AppShell from "@/components/layout/AppShell";
import { Navigate } from "react-router-dom";

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
                  <Navigate to="/leads" replace />
                </ProtectedRoute>
              } 
            />

            <Route 
              path="/leads" 
              element={
                <ProtectedRoute>
                  <AppShell title="Leads">
                    <Leads />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route
              path="/sales-map"
              element={
                <ProtectedRoute>
                  <AppShell title="Sales Map">
                    <SalesMapPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />

            <Route
              path="/order-fulfillment"
              element={
                <ProtectedRoute>
                  <AppShell title="Order Fulfillment">
                    <OrderFulfillmentPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />

            <Route 
              path="/retainers" 
              element={
                <ProtectedRoute>
                  <AppShell title="Retainers">
                    <RetainersKanbanPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manager-dashboard" 
              element={
                <ProtectedRoute>
                  <AppShell title="Dashboard">
                    <Dashboard />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/center-lead-portal" 
              element={
                <CenterProtectedRoute>
                  <AppShell title="My Leads">
                    <CenterLeadPortal />
                  </AppShell>
                </CenterProtectedRoute>
              } 
            />
            <Route 
              path="/center-calendar-view" 
              element={
                <CenterProtectedRoute>
                  <AppShell title="Calendar View">
                    <CenterCalendarView />
                  </AppShell>
                </CenterProtectedRoute>
              } 
            />
            <Route 
              path="/center-callback-request" 
              element={
                <CenterProtectedRoute>
                  <AppShell title="Callback Request">
                    <CallbackRequestPage />
                  </AppShell>
                </CenterProtectedRoute>
              } 
            />
            <Route 
              path="/commission-portal" 
              element={
                <LicensedAgentProtectedRoute>
                  <AppShell title="Retainers">
                    <CommissionPortal />
                  </AppShell>
                </LicensedAgentProtectedRoute>
              } 
            />
            <Route 
              path="/call-result-update" 
              element={
                <ProtectedRoute>
                  <AppShell title="Call Result Update">
                    <CallResultUpdate />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/new-callback" 
              element={
                <ProtectedRoute>
                  <AppShell title="New Callback">
                    <NewCallback />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/call-result-journey" 
              element={
                <ProtectedRoute>
                  <AppShell title="Call Result Journey">
                    <CallResultJourney />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/leads/:submissionId" 
              element={
                <ProtectedRoute>
                  <AppShell title="Lead Details">
                    <LeadDetailsPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/analytics" 
              element={
                <ProtectedRoute>
                  <AppShell title="Analytics">
                    <AgentActivityDashboard />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/daily-deal-flow" 
              element={
                <ProtectedRoute>
                  <AppShell
                    title="Daily Deal Flow"
                    defaultSidebarCollapsed
                    autoCollapseSidebarAfterMs={2000}
                  >
                    <DailyDealFlowPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/daily-deal-flow/lead/:id" 
              element={
                <ProtectedRoute>
                  <AppShell
                    title="Lead Details"
                    defaultSidebarCollapsed
                    autoCollapseSidebarAfterMs={2000}
                  >
                    <DailyDealFlowLeadDetailsPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/transfer-portal" 
              element={
                <ProtectedRoute>
                  <AppShell title="Transfer Portal">
                    <TransferPortalPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/submission-portal" 
              element={
                <ProtectedRoute>
                  <AppShell title="Submission Portal">
                    <SubmissionPortalPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route path="/reports" element={<NotFound />} />
            <Route 
              path="/bulk-lookup" 
              element={
                <ProtectedRoute>
                  <AppShell title="Bulk Lookup">
                    <BulkLookupPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/deal-flow-lookup" 
              element={
                <ProtectedRoute>
                  <AppShell title="Deal Flow Lookup">
                    <DealFlowLookup />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/ghl-sync" 
              element={
                <ProtectedRoute>
                  <AppShell title="GHL Sync">
                    <GHLSyncPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/agent-licensing" 
              element={
                <ProtectedRoute>
                  <AppShell title="Find Eligible Closers">
                    <AgentLicensing />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/agent-eligibility" 
              element={
                <ProtectedRoute>
                  <AppShell title="Agent Eligibility">
                    <AgentEligibilityPage />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/buffer-performance-report" 
              element={
                <ProtectedRoute>
                  <AppShell title="Buffer Performance">
                    <BufferPerformanceReport />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/licensed-agent-performance-report" 
              element={
                <ProtectedRoute>
                  <AppShell title="Licensed Agent Performance">
                    <LicensedAgentPerformanceReport />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/licensed-agent-inbox" 
              element={
                <ProtectedRoute>
                  <AppShell title="Inbox">
                    <LicensedAgentInbox />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/task/:taskId" 
              element={
                <ProtectedRoute>
                  <AppShell title="Task Details">
                    <TaskDetailView />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/retention-tasks" 
              element={
                <ProtectedRoute>
                  <AppShell title="Retainers">
                    <RetentionTasksView />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/user-management" 
              element={
                <ProtectedRoute>
                  <AppShell title="Users">
                    <UserManagement />
                  </AppShell>
                </ProtectedRoute>
              } 
            />
            <Route path="/admin-analytics/*" element={<NotFound />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
