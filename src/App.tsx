import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { EventsProvider } from "./lib/events-store";
import { GuestsProvider } from "./lib/guests-store";

// Every page is its own chunk, downloaded only when visited. Above all this
// keeps the public invitation — what guests open, often on mobile data —
// from shipping the landing page, dashboard, builder, admin portal and QR
// scanner along with it.
const LandingPage = lazy(() => import("./pages/LandingPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const LoginPage = lazy(() => import("./pages/auth/Login"));
const RegisterPage = lazy(() => import("./pages/auth/Register"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPassword"));
const CreateEventPage = lazy(() => import("./pages/dashboard/CreateEventPage"));
const InvitationBuilderPage = lazy(() => import("./pages/dashboard/builder/InvitationBuilderPage"));
const PublicInvitationPage = lazy(() => import("./pages/public/PublicInvitation"));
const SampleInvitationPage = lazy(() => import("./pages/public/SampleInvitation"));
const PrivacyPolicyPage = lazy(() => import("./pages/legal/PrivacyPolicy"));
const TermsPage = lazy(() => import("./pages/legal/Terms"));
const PaymentReturnPage = lazy(() => import("./pages/PaymentReturn"));
const ContactPage = lazy(() => import("./pages/Contact"));
const AboutPage = lazy(() => import("./pages/About"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage"));

type NavTarget = "landing" | "dashboard" | "login" | "register";

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

// Admins only. This just keeps the page out of non-admins' way — the data
// behind it is protected server-side by is_admin() on every query.
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Sign-in and sign-up are for signed-out visitors; someone already signed
// in (e.g. tapping "Get started" on the landing page) goes to the app.
function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
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
              {/* A page's chunk usually arrives in a moment; showing nothing
                  meanwhile avoids a spinner flashing on fast connections. */}
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<LandingRoute />} />
                  <Route path="/login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                  <Route path="/register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/sample" element={<SampleInvitationPage />} />
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminPage />
                      </AdminRoute>
                    }
                  />
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
              </Suspense>
            </div>
          </BrowserRouter>
        </GuestsProvider>
      </EventsProvider>
    </AuthProvider>
  );
}
