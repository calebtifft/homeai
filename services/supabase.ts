import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { platformHttpRequest } from "../utils/iosHttp";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
/** Prefer new dashboard key (`sb_publishable_…`); legacy `anon` JWT still works. */
const apiKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

let client: SupabaseClient | null = null;
let warnedSimulatorBypass = false;

/**
 * Whether to short-circuit Supabase on iOS Simulator in dev. Historically the simulator showed
 * repeated transport-level "Network request failed" errors against Supabase storage/auth, so we
 * disabled the client entirely. `safeSupabaseFetch` (below) now wraps every request and converts
 * those failures into structured 503 responses, so the bypass has been redundant — and harmful
 * in our case: with it on, `listHistoryItems` never reads `metadata.json` (where `roomType` /
 * `style` actually live), so cards display the generic "Staging style" / "Room" fallbacks.
 *
 * Default: bypass OFF (Supabase is used everywhere). Opt back in by setting
 * `EXPO_PUBLIC_SUPABASE_SIMULATOR_BYPASS=1` in `.env` if you ever need offline-only behavior
 * from the simulator.
 */
function simulatorBypassEnabled(): boolean {
  const v = process.env.EXPO_PUBLIC_SUPABASE_SIMULATOR_BYPASS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isNetworkFailure(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  return /network request failed|network error|aborted|timeout/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** RN `fetch` is unreliable on iOS (simulator + device); XHR matches staging/Replicate path. */
async function httpRequestAsResponse(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const href = resolveRequestUrl(input);
  const res = await platformHttpRequest(href, init);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * iPhone first-launch / Wi-Fi handoff frequently surfaces a transient
 * "Network request failed" before the radio is fully ready. One retry with a
 * short backoff resolves the vast majority of these without surfacing an error
 * to auth-js (which would otherwise `console.error` from `_emitInitialSession`).
 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  attempts: number
): Promise<Response> {
  const request = Platform.OS === "ios" ? httpRequestAsResponse : fetch;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await request(input, init);
    } catch (e) {
      lastErr = e;
      if (!isNetworkFailure(e) || i === attempts - 1) throw e;
      // iOS cold start / Wi‑Fi handoff: extra backoff before surfacing 503 to auth-js.
      await sleep(500 + i * 800);
    }
  }
  throw lastErr;
}

async function safeSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetchWithRetry(input, init, 4);
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    // Important: return a response instead of throwing so Supabase returns
    // structured errors and does not trigger React Native redbox loops.
    return new Response(
      JSON.stringify({
        message: "network request failed",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/** Returns null when URL or API key env vars are missing (uploads are skipped). */
export function getSupabase(): SupabaseClient | null {
  if (!url || !apiKey) return null;
  // Opt-in only: keep iOS Simulator on Supabase by default so history can read metadata.json.
  if (
    simulatorBypassEnabled() &&
    __DEV__ &&
    Platform.OS === "ios" &&
    !Constants.isDevice
  ) {
    if (!warnedSimulatorBypass) {
      warnedSimulatorBypass = true;
      console.warn(
        "[HomeAI] Supabase disabled on iOS Simulator dev build (using local cache; EXPO_PUBLIC_SUPABASE_SIMULATOR_BYPASS=1)."
      );
    }
    return null;
  }
  if (!client) {
    client = createClient(url, apiKey, {
      auth: {
        storage: AsyncStorage,
        // Must stay true: access JWTs expire; without refresh, signed-in users lose
        // auth mid-session and storage/RLS calls fail. Transient network issues are
        // handled by `safeSupabaseFetch`; foreground refresh is gated in
        // `AuthContext` via `startAutoRefresh` / `stopAutoRefresh` + AppState.
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: {
        fetch: safeSupabaseFetch,
      },
    });
  }
  return client;
}
