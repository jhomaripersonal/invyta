import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase-client";
import { deleteAllUserUploads } from "./storage";
import type { PlanTier, User } from "../types/models";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  // Returns needsEmailConfirmation: true when the project requires confirming
  // the email before a session exists (Supabase's default) — callers should
  // show a "check your email" state instead of navigating into the app.
  register: (name: string, email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  loginWithGoogle: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  // Permanently deletes the account and everything in it. Irreversible.
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function toAppUser(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown>; created_at: string }): Promise<User> {
  const { data: profile } = await supabase.from("profiles").select("plan, is_admin").eq("id", supabaseUser.id).single();
  return {
    id: supabaseUser.id,
    name: (supabaseUser.user_metadata?.name as string) || supabaseUser.email?.split("@")[0] || "Guest",
    email: supabaseUser.email ?? "",
    plan: (profile?.plan as PlanTier) ?? "free",
    isAdmin: profile?.is_admin === true,
    createdAt: supabaseUser.created_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        setUser(await toAppUser(data.session.user));
      }
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      if (session?.user) {
        setUser(await toAppUser(session.user));
      } else {
        setUser(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  // Where Supabase sends people back to after Google sign-in or the email
  // confirmation link. Must be listed under Authentication → URL
  // Configuration → Redirect URLs, or Supabase falls back to the Site URL.
  const afterSignIn = () => `${window.location.origin}/dashboard`;

  async function register(name: string, email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: afterSignIn() } });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  }

  async function loginWithGoogle() {
    // The browser leaves for Google here and comes back to redirectTo.
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: afterSignIn() } });
    if (error) throw error;
  }

  async function resendConfirmation(email: string) {
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: afterSignIn() } });
    if (error) throw error;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  // Uploads (photos, music) first, while the session can still authorize Storage deletes;
  // then the database function removes the auth user, which cascades to
  // their profile, events and guest lists. If the second step fails the
  // account survives with its photos gone — recoverable by retrying, and
  // far better than the reverse (an erased account with orphaned photos
  // nobody can delete anymore).
  async function deleteAccount() {
    if (!user) throw new Error("Not signed in.");
    await deleteAllUserUploads(user.id);
    const { error } = await supabase.rpc("delete_own_account");
    if (error) throw error;
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, loginWithGoogle, resendConfirmation, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
