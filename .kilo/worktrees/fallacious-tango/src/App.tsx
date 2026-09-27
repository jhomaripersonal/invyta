import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { EventsProvider } from "./lib/events-store";
import { GuestsProvider } from "./lib/guests-store";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/auth/Login";
import RegisterPage from "./pages/auth/Register";
import ForgotPasswordPage from "./pages/auth/ForgotPassword";
import ResetPasswordPage from "./pages/auth/ResetPassword";
import CreateEventPage from "./pages/dashboard/CreateEventPage";
import InvitationBuilderPage from "./pages/dashboard/builder/InvitationBuilderPage";
import PublicInvitationPage from "./pages/public/PublicInvitation";
import PrivacyPolicyPage from "./pages/legal/PrivacyPolicy";
import TermsPage from "./pages/legal/Terms";
import PaymentReturnPage from "./pages/PaymentReturn";

type NavTarget = "landing" | "dashboard" | "login";

function LandingRoute() {
  const navigate = useNavigate();
  const onNav = (p: NavTarget) => navigate(p === "landing" ? "/" : `/${p}`);
  return <LandingPage onNav={onNav} />;
}

function DashboardRoute() {
  const navigate = useNavigate();
  const onNav = (p: NavTarget) => navigate(p === "landing" ? "/" : `/${p}`);
  return <Dashboard onNav={onNav} />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <EventsProvider>
        <GuestsProvider>
          <BrowserRouter>
            <div className="min-h-screen" style={{ fontFamily: "var(--font-sans)" }}>
              <Routes>
                <Route path="/" element={<LandingRoute />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/i/:slug" element={<PublicInvitationPage />} />
                <Route path="/i/:slug/g/:guestId" element={<PublicInvitationPage />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardRoute />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/payment/return"
                  element={
                    <ProtectedRoute>
                      <PaymentReturnPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/events/new"
                  element={
                    <ProtectedRoute>
                      <CreateEventPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/events/:id/builder"
                  element={
                    <ProtectedRoute>
                      <InvitationBuilderPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </BrowserRouter>
        </GuestsProvider>
      </EventsProvider>
    </AuthProvider>
  );
}
