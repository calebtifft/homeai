import Constants, { ExecutionEnvironment } from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

/** Minimal fetch-shaped response used on iOS where `fetch` is unreliable in Expo Go. */
export type HttpResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

function isExpoGoClient(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function applyHeaders(
  xhr: XMLHttpRequest,
  headers?: HeadersInit
): void {
  if (!headers) return;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    return;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      xhr.setRequestHeader(key, String(value));
    }
    return;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) xhr.setRequestHeader(key, String(value));
  }
}

/** XMLHttpRequest works for multipart + JSON on iOS when `fetch` throws Network request failed. */
export function httpRequestViaXhr(
  input: string,
  init?: RequestInit
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const body = xhr.responseText ?? "";
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        text: async () => body,
        json: async () => JSON.parse(body),
      });
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Network request timed out"));

    const method = (init?.method ?? "GET").toUpperCase();
    xhr.open(method, input);
    xhr.timeout = 120_000;
    applyHeaders(xhr, init?.headers);
    xhr.send((init?.body ?? null) as XMLHttpRequestBodyInit | null);
  });
}

async function fetchViaPlatform(
  input: string,
  init?: RequestInit
): Promise<HttpResponse> {
  const fetchImpl =
    Platform.OS === "web" ? fetch.bind(globalThis) : expoFetch;
  const res = await fetchImpl(input, init ?? {});
  return {
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
    json: () => res.json(),
  };
}

/**
 * Expo Go on iOS: XHR (fetch often fails).
 * Dev client + production native: expo/fetch (NSURLSession-backed).
 */
export function platformHttpRequest(
  input: string,
  init?: RequestInit
): Promise<HttpResponse> {
  if (Platform.OS === "ios" && isExpoGoClient()) {
    return httpRequestViaXhr(input, init);
  }
  return fetchViaPlatform(input, init);
}
