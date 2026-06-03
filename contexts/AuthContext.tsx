import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "../services/supabase";
import { initRevenueCatSDK } from "../services/subscriptionBilling";
import { ensureAnonymousSession } from "../services/supabaseAuth";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  initializing: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  const supabase = useMemo<SupabaseClient | null>(() => getSupabase(), []);

  useEffect(() => {
    if (!supabase) {
      setInitializing(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const initial = await supabase.auth.getSession();
        const s = initial.data.session;
        if (!s) {
          const res = await ensureAnonymousSession();
          if (res.error && __DEV__) {
            console.warn("[HomeAI] Anonymous session unavailable:", res.error.message);
          }
          const refreshed = await supabase.auth.getSession();
          if (!cancelled) setSession(refreshed.data.session ?? null);
        } else if (!cancelled) {
          setSession(s);
        }
      } catch (e) {
        if (__DEV__) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn("[HomeAI] Auth bootstrap failed:", msg);
        }
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // React Native: Supabase only rotates access tokens in the background after
  // `startAutoRefresh()`; pause when backgrounded to avoid unnecessary traffic.
  useEffect(() => {
    if (!supabase) return;

    const syncRefresh = (state: AppStateStatus) => {
      if (state === "active") {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    };

    syncRefresh(AppState.currentState);
    const sub = AppState.addEventListener("change", syncRefresh);
    return () => {
      sub.remove();
      void supabase.auth.stopAutoRefresh();
    };
  }, [supabase]);

  useEffect(() => {
    if (initializing) return;
    void initRevenueCatSDK(session?.user?.id ?? null);
  }, [session?.user?.id, initializing]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
    }),
    [session, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
