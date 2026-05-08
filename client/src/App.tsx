import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ui/ProtectedRoute";
import DashboardLayout from "./components/ui/DashboardLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import OAuthCallback from "./pages/OAuthCallback";
import Dashboard from "./pages/Dashboard";
import PRDetail from "./pages/PRDetail";
import Settings from "./pages/Settings";
import Repos from "./pages/Repos";
import Analytics from "./pages/Analytics";
import Pricing from "./pages/Pricing";
import CompareModels from "./pages/CompareModels";
import PublicReport from "./pages/PublicReport";
import ReviewFeed from "./pages/ReviewFeed";
import MyPRs from "./pages/MyPRs";
import MyPRDetail from "./pages/MyPRDetail";
import Docs from "./pages/Docs";
import ReviewDetail from "./pages/ReviewDetail";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Security from "./pages/Security";
import Changelog from "./pages/Changelog";
import GettingStarted from "./pages/GettingStarted";
import RepoHealth from "./pages/RepoHealth";
import CommitDiff from "./pages/CommitDiff";
import N8nReview from "./pages/N8nReview";
import LgtmSecurity from "./pages/LgtmSecurity";
import LgtmSecurityRepoDetail from "./pages/LgtmSecurityRepoDetail";
import LgtmSecurityPolicy from "./pages/LgtmSecurityPolicy";
import LgtmSecurityTokens from "./pages/LgtmSecurityTokens";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import ErrorBoundary from "./components/ui/ErrorBoundary";

function App() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<OAuthCallback />} />
              <Route path="/review/:id" element={<PublicReport />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Dashboard />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/getting-started"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <GettingStarted />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/pr/:id"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <PRDetail />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/settings"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Settings />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/repos"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Repos />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/analytics"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Analytics />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/repo-health"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <RepoHealth />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/security"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <LgtmSecurity />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/security/:repoId"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <LgtmSecurityRepoDetail />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/security/:repoId/policy"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <LgtmSecurityPolicy />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/security/tokens"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <LgtmSecurityTokens />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/commit-diff/:repoId/:commitSha"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <CommitDiff />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/pricing"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Pricing />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/models"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <CompareModels />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/reviews"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <ReviewFeed />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/reviews/:id"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <ReviewDetail />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/my-prs"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <MyPRs />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/my-prs/:id"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <MyPRDetail />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/n8n-review"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <N8nReview />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route path="/docs" element={<Docs />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/security" element={<Security />} />
              <Route path="/changelog" element={<Changelog />} />
            </Routes>
            <VercelAnalytics />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </HelmetProvider>
  );
}

export default App;
