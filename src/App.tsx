import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CRMLayout } from "@/components/layout/CRMLayout";
import Forbidden from "./pages/Forbidden";
import Index from "./pages/Index";
import Pipeline from "./pages/Pipeline";
import Opportunities from "./pages/Opportunities";
import PipelineAnalytics from "./pages/PipelineAnalytics";
import Activities from "./pages/Activities";
import Reports from "./pages/Reports";
import CalendarPage from "./pages/CalendarPage";
import Analytics from "./pages/Analytics";
import Contacts from "./pages/Contacts";
import Customers from "./pages/Customers";
import EndUsers from "./pages/EndUsers";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import StrategicDashboard from "./pages/StrategicDashboard";
import OperationalDashboard from "./pages/OperationalDashboard";
import PendingApproval from "./pages/PendingApproval";
import AccountManagerDashboard from "./pages/AccountManagerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Admin from "./pages/Admin";
import SalesSummary from "./pages/SalesSummary";
import SalesTarget from "./pages/SalesTarget";
import ManagerPipeline from "./pages/ManagerPipeline";
import ManagerInsights from "./pages/ManagerInsights";
import ManagerForecasting from "./pages/ManagerForecasting";
import Auth from "./pages/Auth";
import AdvancedPipeline from "./pages/AdvancedPipeline";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ManagerSalesSummary from "./pages/ManagerSalesSummary";
import HeadSalesSummary from "./pages/HeadSalesSummary";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import { RoleBasedRoute } from "./components/RoleBasedRoute";
import { ENABLE_ADVANCED_PIPELINE, ENABLE_FORECASTING } from "@/config/features";

const queryClient = new QueryClient(); // Force rebuild to clear cache

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <ProtectedRoute>
              <Index />
            </ProtectedRoute>
          } />
          <Route path="/admin-dashboard" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['admin']}>
                <CRMLayout>
                  <AdminDashboard />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/sales-dashboard" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['account_manager']}>
                <CRMLayout>
                  <AccountManagerDashboard />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          {/* Head-specific routes */}
          <Route path="/head/executive-dashboard" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['head', 'admin']}>
                <CRMLayout>
                  <StrategicDashboard />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/head/sales-target" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['head', 'admin']}>
                <CRMLayout>
                  <SalesTarget />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/head/reports" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['head', 'admin']}>
                <CRMLayout>
                  <Reports />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          {/* Redirect old executive-dashboard to new head route */}
          <Route path="/executive-dashboard" element={
            <Navigate to="/head/executive-dashboard" replace />
          } />
          <Route path="/team-dashboard" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <OperationalDashboard />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/opportunities" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['account_manager']}>
                <CRMLayout>
                  <Opportunities />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/projects" element={
            <ProtectedRoute>
              <Projects />
            </ProtectedRoute>
          } />
          <Route path="/projects/:id" element={
            <ProtectedRoute>
              <ProjectDetail />
            </ProtectedRoute>
          } />
          <Route path="/pipeline" element={
            <ProtectedRoute>
              <CRMLayout>
                <Pipeline />
              </CRMLayout>
            </ProtectedRoute>
          } />
          {/* Redirect old pipeline-management to new advanced pipeline */}
          <Route path="/pipeline-management" element={
            <Navigate to="/pipeline/advanced" replace />
          } />
          {ENABLE_ADVANCED_PIPELINE && (
            <Route path="/pipeline/advanced" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                  <CRMLayout>
                    <AdvancedPipeline />
                  </CRMLayout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
          )}
          <Route path="/advanced-pipeline" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <AdvancedPipeline />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/pipeline-analytics" element={
            <ProtectedRoute>
              <CRMLayout>
                <PipelineAnalytics />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/activities" element={
            <ProtectedRoute>
              <CRMLayout>
                <Activities />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute>
              <CRMLayout>
                <Reports />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/calendar" element={
            <ProtectedRoute>
              <CRMLayout>
                <CalendarPage />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute>
              <CRMLayout>
                <Notifications />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/analytics" element={
            <ProtectedRoute>
              <CRMLayout>
                <Analytics />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/contacts" element={
            <ProtectedRoute>
              <CRMLayout>
                <Contacts />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/customers" element={
            <ProtectedRoute>
              <CRMLayout>
                <Customers />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/end-users" element={
            <ProtectedRoute>
              <CRMLayout>
                <EndUsers />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <CRMLayout>
                <Settings />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <CRMLayout>
                <Profile />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/pending" element={
            <ProtectedRoute>
              <PendingApproval />
            </ProtectedRoute>
          } />
          <Route path="/admin/dashboard" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['admin']}>
                <CRMLayout>
                  <AdminDashboard />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['admin']}>
                <CRMLayout>
                  <Admin />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/admin/logs" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['admin']}>
                <CRMLayout>
                  <Admin />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/am/dashboard" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['account_manager']}>
                <CRMLayout>
                  <AccountManagerDashboard />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/am/sales-summary" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['account_manager']}>
                <CRMLayout>
                  <SalesSummary />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute>
               <RoleBasedRoute allowedRoles={['admin', 'manager']}>
                <CRMLayout>
                  <Admin />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          {/* Backward compatibility redirects for old dashboard routes */}
          <Route path="/dashboard/admin" element={
            <ProtectedRoute>
              <Navigate to="/admin-dashboard" replace />
            </ProtectedRoute>
          } />
          <Route path="/dashboard/account-manager" element={
            <ProtectedRoute>
              <Navigate to="/sales-dashboard" replace />
            </ProtectedRoute>
          } />
          <Route path="/dashboard/strategic" element={
            <ProtectedRoute>
              <Navigate to="/executive-dashboard" replace />
            </ProtectedRoute>
          } />
          <Route path="/dashboard/operational" element={
            <ProtectedRoute>
              <Navigate to="/team-dashboard" replace />
            </ProtectedRoute>
          } />
          <Route path="/sales-summary" element={
            <ProtectedRoute>
              <CRMLayout>
                <SalesSummary />
              </CRMLayout>
            </ProtectedRoute>
          } />
          <Route path="/sales-target" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'admin']}>
                <CRMLayout>
                  <SalesTarget />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/manager/team-dashboard" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <OperationalDashboard />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/manager/sales-target" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <SalesTarget />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/pipeline/advanced" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <AdvancedPipeline />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/pipeline/overview" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <ManagerPipeline />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          {ENABLE_FORECASTING && (
            <Route path="/pipeline/forecasting" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                  <CRMLayout>
                    <ManagerForecasting />
                  </CRMLayout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
          )}
          <Route path="/manager/pipeline" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <ManagerPipeline />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/head/manager-target" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['head', 'admin']}>
                <CRMLayout>
                  <SalesTarget />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['admin']}>
                <CRMLayout>
                  <Settings />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/manager/forecast" element={
            <Navigate to="/manager/pipeline/forecast" replace />
          } />
          <Route path="/manager/insights" element={
            <Navigate to="/manager/pipeline/insights" replace />
          } />
          <Route path="/manager/pipeline/insights" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <CRMLayout>
                  <ManagerInsights />
                </CRMLayout>
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          {ENABLE_FORECASTING && (
            <Route path="/manager/pipeline/forecast" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                  <CRMLayout>
                    <ManagerForecasting />
                  </CRMLayout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
          )}
          <Route path="/manager/sales-summary" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['manager', 'head', 'admin']}>
                <ManagerSalesSummary />
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/head/sales-summary" element={
            <ProtectedRoute>
              <RoleBasedRoute allowedRoles={['head', 'admin']}>
                <HeadSalesSummary />
              </RoleBasedRoute>
            </ProtectedRoute>
          } />
          <Route path="/auth" element={<Auth />} />
          <Route path="/403" element={<Forbidden />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
