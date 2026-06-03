import type { AuthError } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

export type AuthResult = {
  error: AuthError | Error | null;
};

/**
 * Ensures an authenticated Supabase user exists for this install.
 * Requires Supabase anonymous sign-in to be enabled in Auth settings.
 */
function isTransientAuthNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  return /network request failed|503|retryable|fetch/i.test(message);
}

export async function ensureAnonymousSession(): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: null };
  const maxAttempts = 3;
  let lastError: AuthError | Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const current = await supabase.auth.getSession();
      if (current.data.session?.user) return { error: null };

      const { error } = await supabase.auth.signInAnonymously();
      if (!error) return { error: null };
      lastError = error;
      if (!isTransientAuthNetworkError(error) || attempt === maxAttempts - 1) {
        return { error };
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e : new Error("Anonymous sign-in failed.");
      if (!isTransientAuthNetworkError(e) || attempt === maxAttempts - 1) {
        return { error: lastError };
      }
    }
    await new Promise((r) => setTimeout(r, 600 + attempt * 700));
  }
  return { error: lastError };
}
