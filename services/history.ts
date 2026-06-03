import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EXTERIOR_SCENE_TYPES,
  EXTERIOR_STYLES,
} from "../constants/exteriorDesign";
import type { StagingPaletteId } from "../constants/colorPalettes";
import type {
  WallStylePresetId,
  WallTreatmentType,
} from "../constants/wallsDesign";
import type {
  DesignMode,
  ExteriorSceneType,
  ExteriorStyleType,
  RoomType,
  StyleType,
} from "../types";
import { withTimeout } from "../utils/withTimeout";
import { getInstallationId } from "./identity";
import { getSupabase } from "./supabase";
import { ensureAnonymousSession } from "./supabaseAuth";

const HISTORY_SIGNED_URL_TTL_SECONDS = 60 * 60;
const HISTORY_PAGE_SIZE = 50;
/** Limits concurrent storage ops — full parallel was slower on mobile (connection saturation). */
const HISTORY_FOLDER_RESOLVE_CONCURRENCY = 11;
/** Bound remote list + signed-URL work so History/Gallery cannot spin forever on stalled Supabase (504, TLS hang). */
const HISTORY_REMOTE_SYNC_TIMEOUT_MS = 28_000;
/** `metadata.json` fetch can hang on iOS if the signed URL never completes. */
const HISTORY_METADATA_FETCH_MS = 9_000;
const DEFAULT_BUCKET = "homeai-uploads";
const LOCAL_HISTORY_KEY = "homeai.local_history.v1";
const LEGACY_LOCAL_HISTORY_KEY = "stageai.local_history.v1";
const LOCAL_HISTORY_MAX = 200;
const REMOTE_HISTORY_RETRY_COOLDOWN_MS = 30 * 1000;
/** Reuse last merged list for a few minutes — avoids full remote sync on every Gallery tab visit. */
export const HISTORY_LIST_MEMORY_CACHE_MS = 4 * 60 * 1000;
let remoteHistoryRetryAt = 0;
let memoryHistoryListCache: { items: HistoryItem[]; cachedAt: number } | null = null;
/** Attempt key → ProcessingScreen effect generation (Strict Mode safe). */
const activeStagingPipelines = new Map<string, number>();

export function invalidateHistoryListCache(): void {
  memoryHistoryListCache = null;
}

function readMemoryHistoryListCache(force?: boolean): HistoryItem[] | null {
  if (force) return null;
  if (!memoryHistoryListCache) return null;
  if (Date.now() - memoryHistoryListCache.cachedAt > HISTORY_LIST_MEMORY_CACHE_MS) {
    return null;
  }
  return memoryHistoryListCache.items;
}

function commitHistoryListCache(items: HistoryItem[]): HistoryItem[] {
  memoryHistoryListCache = { items, cachedAt: Date.now() };
  return items;
}

type SessionMetaRow = {
  id: string;
  folder: string | null;
  original_path: string | null;
  /** Bucket-relative staged object path — avoids per-folder `storage.list` when present. */
  staged_path: string | null;
  original_source_uri: string | null;
  staged_source_uri: string | null;
  design_mode: string | null;
  room_type: string | null;
  style: string | null;
  exterior_scene_type: string | null;
  exterior_style: string | null;
  wall_treatment: string | null;
  wall_style: string | null;
  wall_color_hex: string | null;
  wall_custom_prompt: string | null;
  palette_id: string | null;
  created_at: string | null;
};

/** When `design_mode` is null, infer from populated taxonomy columns. */
function inferDesignModeFromSessionsRow(meta: SessionMetaRow | undefined): DesignMode | undefined {
  if (!meta) return undefined;
  const explicit = asDesignMode(meta.design_mode);
  if (explicit) return explicit;
  if (meta.wall_treatment?.trim() || meta.wall_style?.trim()) return "walls";
  if (meta.exterior_scene_type?.trim() || meta.exterior_style?.trim()) return "exterior";
  if (meta.room_type?.trim() || meta.style?.trim()) return "interior";
  return undefined;
}

/**
 * If `staging_sessions` already has paths + taxonomy, skip downloading `metadata.json`
 * (one signed URL + fetch per folder — largest win on History/Gallery load).
 */
function shouldSkipStorageMetadataFetch(meta: SessionMetaRow | undefined): boolean {
  if (!meta?.staged_path?.trim()) return false;
  const mode = inferDesignModeFromSessionsRow(meta);
  if (!mode) return false;
  if (mode === "walls") {
    return Boolean(meta.wall_treatment?.trim() && meta.wall_style?.trim());
  }
  if (mode === "exterior") {
    return Boolean(meta.exterior_scene_type?.trim() && meta.exterior_style?.trim());
  }
  return Boolean(meta.room_type?.trim() && meta.style?.trim());
}

/**
 * Pending rows may not have a `staging_sessions` row yet (upload runs after generation).
 * Keep in sync with ProcessingScreen timeout (~3 min) plus a small buffer.
 */
const ACTIVE_PENDING_MAX_MS = 6 * 60 * 1000;
/** Allow local-only pending before `staging_sessions` / `sessionFolder` exist (see ProcessingScreen). */
const PENDING_IN_FLIGHT_GRACE_MS = 3 * 60 * 1000 + 60_000;

function metaSessionIndex(metaRows: SessionMetaRow[]) {
  const folders = new Set<string>();
  const ids = new Set<string>();
  const originalKeys = new Set<string>();
  const stagedKeys = new Set<string>();
  for (const r of metaRows) {
    if (r.folder) folders.add(r.folder);
    if (r.id) ids.add(r.id);
    const o = canonicalUriKey(r.original_source_uri ?? undefined);
    if (o) originalKeys.add(o);
    const s = canonicalUriKey(r.staged_source_uri ?? undefined);
    if (s) stagedKeys.add(s);
  }
  return { folders, ids, originalKeys, stagedKeys };
}

function historyItemMatchesServerSessions(
  item: HistoryItem,
  meta: ReturnType<typeof metaSessionIndex>,
  remoteUriKeys: Set<string>,
  remoteSessionFolders: Set<string>,
  nowMs: number
): boolean {
  if (item.sessionFolder && remoteSessionFolders.has(item.sessionFolder)) return true;

  for (const k of historyItemUriKeys(item)) {
    if (remoteUriKeys.has(k)) return true;
  }

  const uriKey = canonicalUriKey(item.sourceUri || item.imageUrl);
  const imgKey = canonicalUriKey(item.imageUrl);

  if (item.id && meta.ids.has(item.id)) return true;
  if (item.sessionFolder && meta.folders.has(item.sessionFolder)) return true;
  if (uriKey && remoteUriKeys.has(uriKey)) return true;
  if (uriKey && meta.stagedKeys.has(uriKey)) return true;
  if (imgKey && meta.stagedKeys.has(imgKey)) return true;

  const origKey = canonicalUriKey(item.originalUri);
  if (origKey && meta.originalKeys.has(origKey)) return true;

  const candidates = [
    canonicalUriKey(item.originalUri),
    canonicalUriKey(item.sourceUri),
    canonicalUriKey(item.imageUrl),
  ];
  for (const k of candidates) {
    if (k && meta.originalKeys.has(k)) return true;
  }

  if (item.status === "pending") {
    if (!isActivePendingHistoryItem(item, nowMs)) return false;

    if (item.sessionFolder && meta.folders.has(item.sessionFolder)) return true;
    if (item.id && meta.ids.has(item.id)) return true;

    for (const k of historyItemUriKeys(item)) {
      if (meta.stagedKeys.has(k) || meta.originalKeys.has(k)) return true;
    }

    const ts = item.createdAt ? Date.parse(item.createdAt) : 0;
    if (ts > 0 && !Number.isNaN(ts) && nowMs - ts < PENDING_IN_FLIGHT_GRACE_MS) {
      return true;
    }

    return false;
  }

  return false;
}

function isActivePendingHistoryItem(item: HistoryItem, nowMs: number): boolean {
  if (item.status !== "pending") return false;
  const ts = item.createdAt ? Date.parse(item.createdAt) : 0;
  if (ts <= 0 || Number.isNaN(ts)) return false;
  return nowMs - ts < ACTIVE_PENDING_MAX_MS;
}

/** Drop stale/duplicate pending rows; keep at most one active pending per staging attempt. */
function sanitizePendingHistoryItems(
  items: HistoryItem[],
  nowMs: number
): HistoryItem[] {
  const completedAttemptKeys = new Set<string>();
  for (const item of items) {
    if (item.status === "pending") continue;
    completedAttemptKeys.add(stagingAttemptKey(item));
  }

  const pendingByKey = new Map<string, HistoryItem>();
  const rest: HistoryItem[] = [];

  for (const item of items) {
    if (item.status !== "pending") {
      rest.push(item);
      continue;
    }
    if (!isActivePendingHistoryItem(item, nowMs)) continue;

    if (completedAttemptKeys.has(stagingAttemptKey(item))) continue;

    const dedupeKey = pendingPhotoDedupeKey(item);
    const prev = pendingByKey.get(dedupeKey);
    if (!prev) {
      pendingByKey.set(dedupeKey, item);
      continue;
    }
    const prevTs = prev.createdAt ? Date.parse(prev.createdAt) : 0;
    const itemTs = item.createdAt ? Date.parse(item.createdAt) : 0;
    const prevRenderable = isRenderableImageUri(prev.imageUrl);
    const itemRenderable = isRenderableImageUri(item.imageUrl);
    if (itemRenderable && !prevRenderable) {
      pendingByKey.set(dedupeKey, item);
      continue;
    }
    if (!itemRenderable && prevRenderable) continue;
    if (itemTs >= prevTs) pendingByKey.set(dedupeKey, item);
  }

  return [...rest, ...pendingByKey.values()];
}

type StorageMetadata = {
  /** Replicate CDN or other remote URL for staged output — aligns local AsyncStorage dedupe keys. */
  stagedSourceUri?: string | null;
  originalUri?: string | null;
  designMode?: string | null;
  roomType?: string | null;
  /** Snake_case keys from legacy JSON payloads. */
  room_type?: string | null;
  style?: string | null;
  exteriorSceneType?: string | null;
  exterior_scene_type?: string | null;
  exteriorStyle?: string | null;
  exterior_style?: string | null;
  wallTreatment?: string | null;
  wall_treatment?: string | null;
  wallStyle?: string | null;
  wall_style?: string | null;
  wallColorHex?: string | null;
  wall_color_hex?: string | null;
  wallCustomPrompt?: string | null;
  wall_custom_prompt?: string | null;
  paletteId?: string | null;
  palette_id?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

/**
 * Downloads and parses `metadata.json` from a session folder.
 * Holds client-authoritative taxonomy (room, style, design mode, replicate URL) merged with DB rows.
 * Returns null on any failure — callers must tolerate missing meta.
 */
async function tryReadStorageMetadata(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  bucket: string,
  folderPath: string
): Promise<StorageMetadata | null> {
  const metaPath = `${folderPath}/metadata.json`;
  // React Native's Blob polyfill makes `supabase.storage.download(...).data.text()` resolve to ""
  // for binary/JSON payloads (known RN issue). We bypass it entirely by signing the object URL and
  // using the global `fetch` (which RN handles correctly with `.text()`).
  let text = "";
  try {
    const signed = await supabase.storage
      .from(bucket)
      .createSignedUrl(metaPath, 60);
    if (signed.error || !signed.data?.signedUrl) {
      if (__DEV__) {
        console.warn(
          "[HomeAI] metadata.json sign failed",
          metaPath,
          signed.error?.message ?? "no signed URL"
        );
      }
      return null;
    }
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), HISTORY_METADATA_FETCH_MS);
    let res: Response;
    try {
      res = await fetch(signed.data.signedUrl, { signal: ac.signal });
    } finally {
      clearTimeout(tid);
    }
    if (!res.ok) {
      if (__DEV__) {
        console.warn(
          "[HomeAI] metadata.json fetch failed",
          metaPath,
          `HTTP ${res.status}`
        );
      }
      return null;
    }
    text = await res.text();
  } catch (e) {
    if (__DEV__) {
      console.warn(
        "[HomeAI] metadata.json fetch threw",
        metaPath,
        e instanceof Error ? e.message : e
      );
    }
    return null;
  }
  if (!text) {
    if (__DEV__) {
      console.warn("[HomeAI] metadata.json fetched empty body", metaPath);
    }
    return null;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch (parseErr) {
    if (__DEV__) {
      console.warn(
        "[HomeAI] metadata.json JSON.parse failed",
        metaPath,
        parseErr instanceof Error ? parseErr.message : parseErr,
        text.slice(0, 200)
      );
    }
    return null;
  }
  try {
    if (!parsed || typeof parsed !== "object") return null;
    const s = (k: string): string | null =>
      typeof parsed[k] === "string" ? (parsed[k] as string) : null;

    /* Flatten camelCase vs snake_case from different writer versions into one blob. */
    const out: StorageMetadata = {
      stagedSourceUri: s("stagedSourceUri"),
      originalUri: s("originalUri"),
      designMode: s("designMode"),
      roomType: s("roomType") ?? s("room_type"),
      style: s("style"),
      exteriorSceneType: s("exteriorSceneType") ?? s("exterior_scene_type"),
      exteriorStyle: s("exteriorStyle") ?? s("exterior_style"),
      wallTreatment: s("wallTreatment") ?? s("wall_treatment"),
      wallStyle: s("wallStyle") ?? s("wall_style"),
      wallColorHex: s("wallColorHex") ?? s("wall_color_hex"),
      wallCustomPrompt: s("wallCustomPrompt") ?? s("wall_custom_prompt"),
      paletteId: s("paletteId") ?? s("palette_id"),
      createdAt: s("createdAt") ?? s("created_at"),
    };
    if (__DEV__) {
      const hasTaxonomy = Boolean(
        out.roomType ||
          out.style ||
          out.exteriorSceneType ||
          out.exteriorStyle ||
          out.wallTreatment ||
          out.wallStyle
      );
      if (!hasTaxonomy) {
        console.warn(
          "[HomeAI] metadata.json had no room/style/wall taxonomy",
          metaPath,
          parsed
        );
      }
    }
    return out;
  } catch (e) {
    if (__DEV__) {
      console.warn("[HomeAI] metadata.json parse failed", metaPath, e);
    }
    return null;
  }
}

export type HistoryItem = {
  id: string;
  imageUrl: string;
  originalUri?: string;
  sourceUri?: string;
  sessionFolder?: string;
  status?: "pending" | "completed";
  designMode?: DesignMode;
  roomType?: RoomType;
  style?: StyleType;
  exteriorSceneType?: ExteriorSceneType;
  exteriorStyle?: ExteriorStyleType;
  wallTreatment?: WallTreatmentType;
  wallStyle?: WallStylePresetId;
  wallColorHex?: string;
  wallCustomPrompt?: string;
  paletteId?: StagingPaletteId;
  createdAt?: string;
};

export function isHistoryItemPending(item: HistoryItem): boolean {
  return item.status === "pending";
}

function canonicalUriKey(uri: string | undefined): string {
  if (!uri) return "";
  const trimmed = uri.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[?#].*$/, "");
}

function localPhotoSignature(uri: string | undefined): string {
  const c = canonicalUriKey(uri);
  if (!c) return "";
  if (!/^(file|content|ph|assets-library):/i.test(c)) {
    return c;
  }
  const withoutScheme = c.replace(/^[a-z+]+:\/\/\/?/i, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  if (parts.length === 0) return `local:${c}`;
  const mediaId = parts.find((p) => /^\d{4,}$/.test(p));
  if (mediaId) return `local:media:${mediaId}`;
  const tail = parts.slice(-4).join("/").toLowerCase();
  return `local:${tail}`;
}

function stagingAttemptKey(item: HistoryItem): string {
  const orig =
    canonicalUriKey(item.originalUri) ||
    canonicalUriKey(item.sourceUri) ||
    canonicalUriKey(item.imageUrl);
  if (!orig) return `id:${item.id}`;
  return [
    orig,
    item.designMode ?? "",
    item.roomType ?? "",
    item.style ?? "",
    item.exteriorSceneType ?? "",
    item.exteriorStyle ?? "",
    item.wallTreatment ?? "",
    item.wallStyle ?? "",
    item.paletteId ?? "",
  ].join("|");
}

/** One in-flight pending card per source photo (file/content/https variants collapse). */
function pendingPhotoDedupeKey(item: HistoryItem): string {
  const signatures = [item.originalUri, item.sourceUri, item.imageUrl]
    .map((uri) => localPhotoSignature(uri))
    .filter(Boolean)
    .sort();
  if (signatures.length > 0) {
    return signatures[signatures.length - 1]!;
  }
  return `attempt:${stagingAttemptKey(item)}`;
}

function historyMergeIdentityKey(item: HistoryItem): string {
  if (item.status === "pending") {
    return `pending:${pendingPhotoDedupeKey(item)}`;
  }
  return stagingAttemptKey(item);
}

/** Drop duplicate pending rows before rendering (last line of defense). */
export function dedupePendingForDisplay(items: HistoryItem[]): HistoryItem[] {
  const seenPending = new Set<string>();
  const out: HistoryItem[] = [];
  for (const item of items) {
    if (item.status !== "pending") {
      out.push(item);
      continue;
    }
    const key = pendingPhotoDedupeKey(item);
    if (seenPending.has(key)) continue;
    seenPending.add(key);
    out.push(item);
  }
  return out;
}

/** Stable compare key — ignores rotating Supabase signed URL query strings. */
export function historyItemStableFingerprint(item: HistoryItem): string {
  const rowId =
    item.status === "pending" ? pendingPhotoDedupeKey(item) : item.id;
  return [
    rowId,
    item.sessionFolder ?? "",
    item.status ?? "completed",
    item.createdAt ?? "",
    canonicalUriKey(item.originalUri),
    canonicalUriKey(item.sourceUri),
    item.designMode ?? "",
    item.roomType ?? "",
    item.style ?? "",
    item.exteriorSceneType ?? "",
    item.exteriorStyle ?? "",
    item.wallTreatment ?? "",
    item.wallStyle ?? "",
    item.paletteId ?? "",
  ].join("\x1f");
}

function sortedHistoryFingerprints(items: HistoryItem[]): string[] {
  return items.map((item) => historyItemStableFingerprint(item)).sort();
}

export function areHistoryListsEquivalent(a: HistoryItem[], b: HistoryItem[]): boolean {
  if (a.length !== b.length) return false;
  const fa = sortedHistoryFingerprints(a);
  const fb = sortedHistoryFingerprints(b);
  for (let i = 0; i < fa.length; i++) {
    if (fa[i] !== fb[i]) return false;
  }
  return true;
}

function hashStringFNV1a(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Stable AsyncStorage row id for an in-flight staging attempt (idempotent append). */
export function pendingHistoryIdForAttemptKey(attemptKey: string): string {
  return `pending-${hashStringFNV1a(attemptKey)}`;
}

/** Prefer photo-based id so content:// vs file:// duplicates share one row. */
export function stablePendingHistoryId(item: HistoryItem): string {
  return pendingHistoryIdForAttemptKey(pendingPhotoDedupeKey(item));
}

/**
 * Claim the pipeline for this effect generation.
 * Returns false when another generation still owns the attempt.
 */
export function claimStagingPipeline(attemptKey: string, generation: number): boolean {
  if (!attemptKey) return true;
  const owner = activeStagingPipelines.get(attemptKey);
  if (owner != null && owner !== generation) {
    // Prior effect was interrupted (navigation, crash, Strict Mode) — allow retry.
    activeStagingPipelines.delete(attemptKey);
  }
  activeStagingPipelines.set(attemptKey, generation);
  return true;
}

export function releaseStagingPipeline(attemptKey: string, generation: number): void {
  if (!attemptKey) return;
  if (activeStagingPipelines.get(attemptKey) === generation) {
    activeStagingPipelines.delete(attemptKey);
  }
}

export function isStagingPipelineActive(attemptKey: string): boolean {
  return attemptKey ? activeStagingPipelines.has(attemptKey) : false;
}

/** Apply a fetched list without re-rendering when rows are logically unchanged. */
export function mergeHistoryListState(
  prev: HistoryItem[],
  next: HistoryItem[]
): HistoryItem[] {
  if (areHistoryListsEquivalent(prev, next)) return prev;
  return reconcileHistoryListSnapshot(prev, next);
}

export async function findActivePendingHistoryItemByAttemptKey(
  attemptKey: string
): Promise<HistoryItem | null> {
  if (!attemptKey) return null;
  const local = await finalizeLocalHistoryForDisplay(await readLocalHistoryItems());
  const nowMs = Date.now();
  const stableId = pendingHistoryIdForAttemptKey(attemptKey);
  for (const item of local) {
    if (item.status !== "pending") continue;
    if (item.id === stableId || stagingAttemptKey(item) === attemptKey) {
      if (isActivePendingHistoryItem(item, nowMs)) return item;
    }
  }
  return null;
}

export function reconcileHistoryListSnapshot(
  prev: HistoryItem[],
  next: HistoryItem[]
): HistoryItem[] {
  if (!areHistoryListsEquivalent(prev, next)) return next;
  return prev.map((item, i) => {
    const incoming = next[i];
    if (!incoming) return item;
    if (
      item.imageUrl === incoming.imageUrl &&
      item.sourceUri === incoming.sourceUri &&
      item.originalUri === incoming.originalUri
    ) {
      return item;
    }
    return {
      ...item,
      imageUrl: incoming.imageUrl,
      sourceUri: incoming.sourceUri,
      originalUri: incoming.originalUri,
    };
  });
}

type LocalHistoryItem = HistoryItem;

/** React list key — pending rows key by source photo so duplicate ids do not remount the grid. */
export function historyItemReactKey(item: HistoryItem): string {
  if (item.status === "pending") {
    return `pending:${pendingPhotoDedupeKey(item)}`;
  }
  return item.id;
}

/** Same source photo + design settings = one history slot (regenerate replaces, does not duplicate). */
export function historyStagingAttemptKey(item: HistoryItem): string {
  return stagingAttemptKey(item);
}

function pickPreferredHistoryItem(
  existing: HistoryItem,
  incoming: HistoryItem
): HistoryItem {
  const existingPending = existing.status === "pending";
  const incomingPending = incoming.status === "pending";

  let picked: HistoryItem;
  if (existingPending !== incomingPending) {
    picked = incomingPending ? incoming : existing;
  } else {
    const existingTs = existing.createdAt ? Date.parse(existing.createdAt) : 0;
    const incomingTs = incoming.createdAt ? Date.parse(incoming.createdAt) : 0;
    if (incomingTs > existingTs) picked = incoming;
    else if (existingTs > incomingTs) picked = existing;
    else {
      const existingSigned = existing.imageUrl.includes("/storage/v1/");
      const incomingSigned = incoming.imageUrl.includes("/storage/v1/");
      if (incomingSigned && !existingSigned) picked = incoming;
      else if (existingSigned && !incomingSigned) picked = existing;
      else if (!existing.originalUri && incoming.originalUri) picked = incoming;
      else picked = existing;
    }
  }

  return {
    ...picked,
    originalUri: pickBestOriginalUri(
      existing.originalUri,
      incoming.originalUri,
      picked.originalUri
    ),
    sessionFolder:
      picked.sessionFolder ?? existing.sessionFolder ?? incoming.sessionFolder,
  };
}

/** Canonical keys for matching a history row to remote session truth (any hit counts). */
function historyItemUriKeys(item: HistoryItem): string[] {
  const keys = new Set<string>();
  addHistoryStagingAliasKeys(keys, item);
  return [...keys];
}

function addUriToKeySet(set: Set<string>, uri: string | null | undefined): void {
  const k = canonicalUriKey(uri ?? undefined);
  if (k) set.add(k);
}

/** Superset of URIs that still exist under storage + staging_sessions (used for prune + RLS alignment). */
function buildRemoteSessionUriKeySet(
  items: HistoryItem[],
  metaRows: SessionMetaRow[]
): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    addHistoryStagingAliasKeys(set, item);
  }
  for (const r of metaRows) {
    addUriToKeySet(set, r.staged_source_uri);
    addUriToKeySet(set, r.original_source_uri);
    addBucketPathAliases(set, r.staged_path ?? undefined);
    addBucketPathAliases(set, r.original_path ?? undefined);
  }
  return set;
}

function buildRemoteSessionFolderSet(items: HistoryItem[]): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    const f = item.sessionFolder?.trim();
    if (f) set.add(f);
  }
  return set;
}

function isSupabaseStorageUrl(uri: string | undefined): boolean {
  const key = canonicalUriKey(uri);
  return key.includes("/storage/v1/");
}

function isStorageBackedHistoryItem(item: HistoryItem): boolean {
  return (
    isSupabaseStorageUrl(item.imageUrl) ||
    isSupabaseStorageUrl(item.sourceUri) ||
    Boolean(item.sessionFolder?.trim())
  );
}

/** Keep in-flight pending when the server list is empty (avoid wiping active staging). */
function shouldKeepPendingWhenRemoteEmpty(item: HistoryItem, nowMs: number): boolean {
  if (item.status !== "pending") return true;
  return isActivePendingHistoryItem(item, nowMs);
}

/**
 * When the server has sessions, only drop local rows that look like orphan *storage*
 * placeholders. Keep Replicate / file:// completions that may not have a DB row yet.
 */
function passesStrictServerAlignment(
  item: HistoryItem,
  meta: ReturnType<typeof metaSessionIndex>,
  remoteUriKeys: Set<string>,
  remoteSessionFolders: Set<string>,
  nowMs: number
): boolean {
  if (item.status === "pending") {
    return historyItemMatchesServerSessions(
      item,
      meta,
      remoteUriKeys,
      remoteSessionFolders,
      nowMs
    );
  }
  if (!isStorageBackedHistoryItem(item)) {
    return true;
  }
  return historyItemMatchesServerSessions(
    item,
    meta,
    remoteUriKeys,
    remoteSessionFolders,
    nowMs
  );
}

function isRenderableImageUri(uri: string | undefined): boolean {
  const value = uri?.trim();
  if (!value) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/)/i.test(value);
}

function isDeviceLocalImageUri(uri: string | undefined): boolean {
  const value = uri?.trim();
  if (!value) return false;
  return /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:)/i.test(value);
}

/** Higher = better for before/after compare (fresh Supabase signed URLs beat stale device paths). */
function originalUriTier(uri: string | undefined): number {
  const value = uri?.trim() ?? "";
  if (!value || !isRenderableImageUri(value)) return 0;
  if (isDeviceLocalImageUri(value)) return 1;
  if (/^https?:\/\//i.test(value) && /\/storage\/v1\/object\//i.test(value)) return 4;
  if (/^https?:\/\//i.test(value)) return 3;
  return 2;
}

function pickBestOriginalUri(
  ...candidates: (string | undefined | null)[]
): string | undefined {
  let best: string | undefined;
  let bestTier = 0;
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value || !isRenderableImageUri(value)) continue;
    const tier = originalUriTier(value);
    if (tier > bestTier) {
      bestTier = tier;
      best = value;
    }
  }
  return best;
}

function isNetworkFailure(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  return (
    /network request failed/i.test(message) ||
    /history sync timed out/i.test(message) ||
    /aborted|ECONNRESET|ETIMEDOUT|timed out|504|503|502/i.test(message)
  );
}

function storageObjectPathFromSignedUrl(
  uri: string | undefined,
  bucket: string
): string | undefined {
  if (!uri) return undefined;
  const value = uri.trim();
  if (!value) return undefined;
  const marker = `/storage/v1/object/sign/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx < 0) return undefined;
  const rest = value.slice(idx + marker.length);
  const rawPath = rest.split("?")[0];
  if (!rawPath) return undefined;
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

/** Works even when env bucket name does not match the bucket segment embedded in the URL. */
function storageObjectPathFromAnySupabaseUrl(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  const value = uri.trim();
  if (!value) return undefined;
  const noQuery = value.split("?")[0];
  const m = noQuery.match(/\/storage\/v1\/object\/(?:sign|public)\/[^/]+\/(.+)$/i);
  if (!m?.[1]) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function sessionFolderForDelete(item: HistoryItem): string | undefined {
  const direct = item.sessionFolder?.trim();
  if (direct) return direct;

  const bucket = stagingBucketName();
  const pathCandidates = [
    storageObjectPathFromSignedUrl(item.imageUrl, bucket),
    storageObjectPathFromAnySupabaseUrl(item.imageUrl),
    storageObjectPathFromSignedUrl(item.sourceUri, bucket),
    storageObjectPathFromAnySupabaseUrl(item.sourceUri),
  ];

  for (const path of pathCandidates) {
    const folder = parentFolder(path);
    if (folder) return folder;
  }

  const raw = item.sourceUri?.trim();
  if (raw && !/^https?:\/\//i.test(raw)) {
    const clean = raw.replace(/^\/+/, "");
    const folder = parentFolder(clean);
    if (folder) return folder;
  }

  return undefined;
}

function parentFolder(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return undefined;
  return path.slice(0, idx);
}

function looksLikeUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id.trim()
  );
}

function normalizedEnumKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .replace(/[-_/]+/g, " ");
}

/** Case / punctuation tolerant match — DB drift ("modern", "Mid Century") breaks strict equality. */
function matchEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[]
): T | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  if (allowed.includes(t as T)) return t as T;
  const n = normalizedEnumKey(t);
  for (const opt of allowed) {
    if (normalizedEnumKey(opt) === n) return opt;
  }
  return undefined;
}

function looksLikeStagingOutputHttps(uri: string | undefined): boolean {
  const u = uri?.trim();
  return Boolean(u && /^https?:\/\//i.test(u));
}

function storageImageUrlTier(uri: string | undefined): number {
  const u = uri?.trim() ?? "";
  if (!u) return 0;
  if (/\/storage\/v1\/object\//i.test(u)) return 3;
  if (/replicate\.(delivery|com)/i.test(u)) return 2;
  if (/^https?:\/\//i.test(u)) return 1;
  return 0;
}

/**
 * Prefer remote-signed URLs for thumbnails, but NEVER drop richer label fields from whichever
 * duplicate survived remote-first ingest (local cache often carries room/style reliably).
 */
function coalesceHistoryLabels(primary: HistoryItem, secondary: HistoryItem): HistoryItem {
  const mergedOriginal = pickBestOriginalUri(
    primary.originalUri,
    secondary.originalUri
  );

  const pickHttpsSource = looksLikeStagingOutputHttps(primary.sourceUri)
    ? primary.sourceUri
    : looksLikeStagingOutputHttps(secondary.sourceUri)
      ? secondary.sourceUri
      : primary.sourceUri ?? secondary.sourceUri;

  const pickImg =
    storageImageUrlTier(primary.imageUrl) >= storageImageUrlTier(secondary.imageUrl)
      ? primary.imageUrl
      : secondary.imageUrl;

  const pid = primary.id?.trim() ?? "";
  const sid = secondary.id?.trim() ?? "";
  const pickId = looksLikeUuid(pid) ? primary.id : looksLikeUuid(sid) ? secondary.id : primary.id;

  return {
    id: pickId,
    imageUrl: pickImg,
    originalUri: mergedOriginal,
    sourceUri: pickHttpsSource,
    sessionFolder: primary.sessionFolder ?? secondary.sessionFolder,
    status:
      primary.status === "completed" || secondary.status === "completed"
        ? "completed"
        : "pending",
    designMode: primary.designMode ?? secondary.designMode,
    roomType: primary.roomType ?? secondary.roomType,
    style: primary.style ?? secondary.style,
    exteriorSceneType: primary.exteriorSceneType ?? secondary.exteriorSceneType,
    exteriorStyle: primary.exteriorStyle ?? secondary.exteriorStyle,
    wallTreatment: primary.wallTreatment ?? secondary.wallTreatment,
    wallStyle: primary.wallStyle ?? secondary.wallStyle,
    wallColorHex: primary.wallColorHex ?? secondary.wallColorHex,
    wallCustomPrompt: primary.wallCustomPrompt ?? secondary.wallCustomPrompt,
    paletteId: primary.paletteId ?? secondary.paletteId,
    createdAt: primary.createdAt ?? secondary.createdAt,
  };
}

function mergeHistoryDuplicatesBySource(a: HistoryItem, b: HistoryItem): HistoryItem {
  const aPen = a.status === "pending";
  const bPen = b.status === "pending";
  if (aPen && !bPen) return coalesceHistoryLabels(b, a);
  if (!aPen && bPen) return coalesceHistoryLabels(a, b);
  return coalesceHistoryLabels(a, b);
}

const ROOM_TYPES: RoomType[] = [
  "Living Room",
  "Bedroom",
  "Kitchen",
  "Bathroom",
  "Home Office",
  "Study Room",
  "Restaurant",
];

const STYLE_TYPES: StyleType[] = [
  "Modern",
  "Contemporary",
  "Traditional",
  "Transitional",
  "Mid-Century",
  "Rustic",
  "Luxe",
  "Minimal",
  "Mediterranean",
  "Biophilic",
  "Airbnb",
  "Soho Style",
  "Rainbow",
  "Cozy",
  "Coastal",
  "Japandi",
  "Cottagecore",
  "Wood",
];

function asRoomType(value: string | null | undefined): RoomType | undefined {
  return matchEnum(value, ROOM_TYPES);
}

function asStyleType(value: string | null | undefined): StyleType | undefined {
  return matchEnum(value, STYLE_TYPES);
}

function asDesignMode(value: string | null): DesignMode | undefined {
  if (value === "exterior" || value === "interior" || value === "walls") return value;
  return undefined;
}

const WALL_TREATMENTS: WallTreatmentType[] = [
  "Paint",
  "Accent Wall",
  "Wallpaper",
  "Wood Paneling",
  "Tile",
  "Mural",
  "Custom",
];

function asWallTreatment(value: string | null | undefined): WallTreatmentType | undefined {
  return matchEnum(value, WALL_TREATMENTS);
}

function asWallStyle(value: string | null): WallStylePresetId | undefined {
  if (!value) return undefined;
  return value as WallStylePresetId;
}

function asMaybeString(value: string | null): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function asExteriorSceneType(
  value: string | null | undefined
): ExteriorSceneType | undefined {
  return matchEnum(value, EXTERIOR_SCENE_TYPES);
}

function asExteriorStyleType(
  value: string | null | undefined
): ExteriorStyleType | undefined {
  return matchEnum(value, EXTERIOR_STYLES);
}

function asPaletteId(value: string | null): StagingPaletteId | undefined {
  if (!value) return undefined;
  return value as StagingPaletteId;
}

function stagingBucketName(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_STAGING_BUCKET?.trim() || DEFAULT_BUCKET;
}

const HISTORY_MEDIA_RESOLVE_MS = 10_000;

async function findSessionObjectPath(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  bucket: string,
  folder: string,
  namePattern: RegExp
): Promise<string | undefined> {
  const listRes = await supabase.storage.from(bucket).list(folder, { limit: 20 });
  if (listRes.error) return undefined;
  const hit = (listRes.data ?? []).find((f) => namePattern.test(f.name ?? ""));
  return hit?.name ? `${folder}/${hit.name}` : undefined;
}

/**
 * Re-sign staged/original objects for detail compare — fixes expired signed URLs and
 * replaces stale device-local `originalUri` paths with storage-backed originals.
 */
export async function resolveHistoryItemMediaUris(
  item: Pick<HistoryItem, "imageUrl" | "originalUri" | "sourceUri" | "sessionFolder">
): Promise<{ imageUrl: string; originalUri?: string }> {
  const fallback = {
    imageUrl: item.imageUrl,
    originalUri: pickBestOriginalUri(item.originalUri),
  };
  const supabase = getSupabase();
  if (!supabase) return fallback;

  const bucket = stagingBucketName();
  const signPath = async (path: string | undefined): Promise<string | undefined> => {
    const trimmed = path?.trim();
    if (!trimmed) return undefined;
    const res = await supabase.storage
      .from(bucket)
      .createSignedUrl(trimmed, HISTORY_SIGNED_URL_TTL_SECONDS);
    return res.data?.signedUrl ?? undefined;
  };

  const run = async (): Promise<{ imageUrl: string; originalUri?: string }> => {
    let stagedPath =
      storageObjectPathFromAnySupabaseUrl(item.imageUrl) ||
      storageObjectPathFromSignedUrl(item.imageUrl, bucket);
    const sourceTrim = item.sourceUri?.trim();
    if (!stagedPath && sourceTrim && !/^https?:\/\//i.test(sourceTrim)) {
      stagedPath = sourceTrim.replace(/^\/+/, "");
    }

    let originalPath =
      storageObjectPathFromAnySupabaseUrl(item.originalUri) ||
      storageObjectPathFromSignedUrl(item.originalUri, bucket);

    const folder = item.sessionFolder?.trim();
    if (folder) {
      if (!originalPath) {
        originalPath = await findSessionObjectPath(
          supabase,
          bucket,
          folder,
          /^original\./i
        );
      }
      if (!stagedPath) {
        stagedPath = await findSessionObjectPath(
          supabase,
          bucket,
          folder,
          /^staged\./i
        );
      }
    }

    const [signedStaged, signedOriginal] = await Promise.all([
      signPath(stagedPath),
      signPath(originalPath),
    ]);

    const imageUrl = signedStaged ?? item.imageUrl;
    const originalUri = pickBestOriginalUri(signedOriginal, item.originalUri);

    return { imageUrl, originalUri };
  };

  try {
    return await withTimeout(run(), HISTORY_MEDIA_RESOLVE_MS, "Media resolve timed out");
  } catch {
    return fallback;
  }
}

const SESSION_FOLDER_ALIAS_PREFIX = "session-folder:";

function historySessionFolderDedupeToken(folder: string): string {
  const t = folder.trim();
  return t.startsWith(SESSION_FOLDER_ALIAS_PREFIX)
    ? t
    : `${SESSION_FOLDER_ALIAS_PREFIX}${t}`;
}

/** Bucket-relative object path aliases (helps match signed CDN URLs ↔ replicate URLs). */
function addBucketPathAliases(set: Set<string>, bucketPath: string | undefined): void {
  const t = bucketPath?.trim();
  if (!t) return;
  set.add(t);
  set.add(`path:${t}`);
  const folder = parentFolder(t);
  if (folder) set.add(historySessionFolderDedupeToken(folder));
}

/** All fuzzy keys that might identify the same staging session row across local cache + Supabase. */
function addHistoryStagingAliasKeys(keys: Set<string>, item: HistoryItem): void {
  addUriToKeySet(keys, item.sourceUri);
  addUriToKeySet(keys, item.imageUrl);
  const bucket = stagingBucketName();
  for (const p of [
    storageObjectPathFromSignedUrl(item.imageUrl, bucket),
    storageObjectPathFromAnySupabaseUrl(item.imageUrl),
    storageObjectPathFromSignedUrl(item.sourceUri, bucket),
    storageObjectPathFromAnySupabaseUrl(item.sourceUri),
  ]) {
    addBucketPathAliases(keys, p);
  }

  const rawSrc = item.sourceUri?.trim();
  if (rawSrc && !/^https?:\/\//i.test(rawSrc)) {
    const clean = rawSrc.replace(/^\/+/, "");
    addBucketPathAliases(keys, clean);
  }

  const f = item.sessionFolder?.trim();
  if (f) keys.add(historySessionFolderDedupeToken(f));
}

function historyStagingAliasKeysForItem(item: HistoryItem): Set<string> {
  const s = new Set<string>();
  addHistoryStagingAliasKeys(s, item);
  return s;
}

async function resolveCurrentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    await ensureAnonymousSession();
    const sessionRes = await supabase.auth.getSession();
    const fromSession = sessionRes.data.session?.user?.id;
    if (fromSession) return fromSession;

    const userRes = await supabase.auth.getUser();
    if (userRes.error) return null;
    return userRes.data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Normalize/dedupe locally persisted rows (pending vs completed, twins). Used whenever remote merge is skipped. */
function finalizeLocalHistoryItems(localItems: HistoryItem[]): HistoryItem[] {
  return mergeHistoryItems(localItems, []);
}

/** Fast DB probe when full storage sync fails or is in cooldown — drops ghost pending if server has zero sessions. */
async function fetchRemoteStagingSessionRowCount(userId: string): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const res = await supabase
      .from("staging_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (res.error) return null;
    return res.count ?? 0;
  } catch {
    return null;
  }
}

async function finalizeLocalHistoryForDisplay(
  localItems: HistoryItem[]
): Promise<HistoryItem[]> {
  let items = finalizeLocalHistoryItems(localItems);
  const userId = await resolveCurrentUserId();
  if (!userId) return items;
  const count = await fetchRemoteStagingSessionRowCount(userId);
  if (count === 0) {
    const nowMs = Date.now();
    items = items.filter((item) => shouldKeepPendingWhenRemoteEmpty(item, nowMs));
  }
  return items;
}

/** Run async work with bounded parallelism (faster than serial, gentler than unbounded `Promise.all`). */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Math.min(Math.max(1, concurrency), items.length);
  const run = async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await mapper(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}

/** Drop cached history when auth user changes so lists re-sync from the server. */
export async function clearLocalHistoryCache(): Promise<void> {
  invalidateHistoryListCache();
  try {
    await AsyncStorage.removeItem(LOCAL_HISTORY_KEY);
  } catch {
    // non-fatal
  }
}

export async function listHistoryItems(options?: {
  force?: boolean;
  /** Read local cache only — avoids remote merge duplicating in-flight pending cards. */
  localOnly?: boolean;
}): Promise<HistoryItem[]> {
  const localOnly = Boolean(options?.localOnly);

  if (!localOnly) {
    const cached = readMemoryHistoryListCache(options?.force);
    if (cached) return cached;
  }

  const localItems = await readLocalHistoryItems();
  if (localOnly) {
    return finalizeLocalHistoryForDisplay(localItems);
  }
  if (Date.now() < remoteHistoryRetryAt) {
    const deduped = await finalizeLocalHistoryForDisplay(localItems);
    void writeLocalHistoryItems(deduped);
    return commitHistoryListCache(deduped);
  }
  const localBySourceKey = new Map<string, HistoryItem>();
  for (const item of localItems) {
    const keys = historyStagingAliasKeysForItem(item);
    if (keys.size === 0) {
      const k = canonicalUriKey(item.sourceUri || item.imageUrl);
      if (k) localBySourceKey.set(k, item);
      continue;
    }
    for (const k of keys) {
      localBySourceKey.set(k, item);
    }
  }
  const supabase = getSupabase();
  if (!supabase) {
    const deduped = await finalizeLocalHistoryForDisplay(localItems);
    void writeLocalHistoryItems(deduped);
    return commitHistoryListCache(deduped);
  }
  try {
    let raceTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const strictRemote = await Promise.race([
        (async (): Promise<HistoryItem[]> => {
          const userId = await resolveCurrentUserId();
    const installationId = await getInstallationId().catch(() => null);
    if (!userId && !installationId) {
      return finalizeLocalHistoryItems(localItems);
    }
    if (!userId) {
      return finalizeLocalHistoryItems(localItems);
    }

    const bucket = stagingBucketName();
    const sessionsPrefix = `users/${userId}/sessions`;

    const selectCols =
      "id,folder,original_path,staged_path,original_source_uri,staged_source_uri,design_mode,room_type,style,exterior_scene_type,exterior_style,wall_treatment,wall_style,wall_color_hex,wall_custom_prompt,palette_id,created_at";
    let metaRows: SessionMetaRow[] = [];
    const metaByFolder = new Map<string, SessionMetaRow>();

    const byUserPromise = supabase
      .from("staging_sessions")
      .select(selectCols)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_PAGE_SIZE);

    // `installation_id` column is optional (added by supabase/storage-policies.sql). When the
    // schema hasn't been migrated yet the query errors with "column installation_id does not
    // exist" — swallow that explicitly so the rest of the history flow still resolves remote
    // folders + metadata.json.
    const byInstallPromise = (async (): Promise<{
      data?: SessionMetaRow[] | null;
      error?: { message?: string } | null;
    }> => {
      if (!installationId) return { data: [] as SessionMetaRow[] };
      const res = await supabase
        .from("staging_sessions")
        .select(selectCols)
        .eq("installation_id", installationId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_PAGE_SIZE);
      return { data: res.data, error: res.error };
    })();

    const foldersPromise = supabase.storage.from(bucket).list(sessionsPrefix, {
      limit: HISTORY_PAGE_SIZE,
      sortBy: { column: "name", order: "desc" },
    });

    const [byUserRes, byInstallRes, foldersRes] = await Promise.all([
      byUserPromise,
      byInstallPromise,
      foldersPromise,
    ]);

    metaRows = ((byUserRes.data ?? []) as SessionMetaRow[]) ?? [];
    for (const row of metaRows) metaByFolder.set(row.folder ?? "", row);

    if (byInstallRes?.error?.message && __DEV__) {
      const msg = byInstallRes.error.message;
      if (/installation_id/i.test(msg)) {
        console.warn(
          "[HomeAI] staging_sessions: 'installation_id' column missing — skipping per-device fallback query. " +
            "Apply supabase/storage-policies.sql to add it."
        );
      } else {
        console.warn("[HomeAI] staging_sessions installation_id query failed:", msg);
      }
    }
    const installRows = ((byInstallRes?.data ?? []) as SessionMetaRow[]) ?? [];
    for (const row of installRows) {
      const key = row.folder ?? "";
      if (!metaByFolder.has(key)) {
        metaByFolder.set(key, row);
        metaRows.push(row);
      }
    }

    if (foldersRes.error) throw foldersRes.error;

    const folders = foldersRes.data ?? [];

    const itemResults = await mapWithConcurrency(
      folders,
      HISTORY_FOLDER_RESOLVE_CONCURRENCY,
      async (folder): Promise<HistoryItem | null> => {
        const folderName = folder.name?.trim();
        if (!folderName) return null;

        const folderPath = `${sessionsPrefix}/${folderName}`;
        const meta = metaByFolder.get(folderPath);

        let imageUrl: string | null = null;
        let stagedPathForSource: string;
        let originalSignedUrl: string | undefined;
        let createdAtFromFile: string | undefined;

        const stagedPathDb = meta?.staged_path?.trim();
        if (stagedPathDb) {
          stagedPathForSource = meta?.staged_source_uri ?? stagedPathDb;
          const stagedSign = supabase.storage
            .from(bucket)
            .createSignedUrl(stagedPathDb, HISTORY_SIGNED_URL_TTL_SECONDS);
          const originalPathTrimmed = meta?.original_path?.trim();
          const origSign = originalPathTrimmed
            ? supabase.storage
                .from(bucket)
                .createSignedUrl(originalPathTrimmed, HISTORY_SIGNED_URL_TTL_SECONDS)
            : Promise.resolve({ data: { signedUrl: null as string | null } });
          const [stagedSigned, originalSigned] = await Promise.all([stagedSign, origSign]);
          imageUrl = stagedSigned.data?.signedUrl ?? null;
          originalSignedUrl = originalSigned.data?.signedUrl ?? undefined;
        } else {
          const filesRes = await supabase.storage.from(bucket).list(folderPath, { limit: 20 });
          if (filesRes.error) return null;

          const staged = (filesRes.data ?? []).find((f) => /^staged\./i.test(f.name ?? ""));
          if (!staged?.name) return null;

          stagedPathForSource = `${folderPath}/${staged.name}`;
          const signedRes = await supabase.storage
            .from(bucket)
            .createSignedUrl(stagedPathForSource, HISTORY_SIGNED_URL_TTL_SECONDS);
          imageUrl = signedRes.data?.signedUrl ?? null;

          const original = (filesRes.data ?? []).find((f) => /^original\./i.test(f.name ?? ""));
          if (original?.name) {
            const originalPath = `${folderPath}/${original.name}`;
            const originalSigned = await supabase.storage
              .from(bucket)
              .createSignedUrl(originalPath, HISTORY_SIGNED_URL_TTL_SECONDS);
            originalSignedUrl = originalSigned.data?.signedUrl ?? undefined;
          }
          createdAtFromFile = staged.created_at ?? staged.updated_at ?? undefined;
        }

        // Merge `metadata.json` when DB rows omit labels (partial RLS) or `design_mode` is null.
        // Skip when `staging_sessions` already has full taxonomy — saves one signed URL + fetch per folder.
        const storageMeta = shouldSkipStorageMetadataFetch(meta)
          ? null
          : await tryReadStorageMetadata(supabase, bucket, folderPath);

        if (!imageUrl) return null;

        const createdAt =
          meta?.created_at ??
          storageMeta?.createdAt ??
          createdAtFromFile ??
          undefined;

        const stagedSourceUri =
          meta?.staged_source_uri?.trim() ??
          storageMeta?.stagedSourceUri?.trim() ??
          stagedPathForSource;

        /** Match local AsyncStorage rows that used replicate URLs instead of bucket paths. */
        const phantomForCache: HistoryItem = {
          id: "local-cache-hit",
          imageUrl: imageUrl ?? "",
          sourceUri: stagedSourceUri,
          sessionFolder: folderPath,
        };
        let existingLocal: HistoryItem | undefined;
        for (const ak of historyStagingAliasKeysForItem(phantomForCache)) {
          const hit = localBySourceKey.get(ak);
          if (hit) {
            existingLocal = hit;
            break;
          }
        }
        const cachedImageUrl = existingLocal?.imageUrl;
        const bestImageUrl = isRenderableImageUri(imageUrl)
          ? imageUrl
          : isRenderableImageUri(cachedImageUrl) && !isSupabaseStorageUrl(cachedImageUrl)
            ? cachedImageUrl
            : isRenderableImageUri(stagedSourceUri)
              ? stagedSourceUri
              : undefined;
        if (!bestImageUrl) return null;

        // Three-tier fallback: DB row → metadata.json → local AsyncStorage cache. The local cache
        // is the SAVIOR for sessions uploaded before the labels-in-metadata fix landed (their JSON
        // files have nulls, DB rows have nulls, but the local row generated by ProcessingScreen
        // still remembers what the user picked).
        const designMode =
          asDesignMode(meta?.design_mode ?? storageMeta?.designMode ?? null) ??
          existingLocal?.designMode;
        const roomType =
          asRoomType(meta?.room_type ?? null) ??
          asRoomType(storageMeta?.roomType ?? null) ??
          existingLocal?.roomType;
        const style =
          asStyleType(meta?.style ?? null) ??
          asStyleType(storageMeta?.style ?? null) ??
          existingLocal?.style;
        const exteriorSceneType =
          asExteriorSceneType(meta?.exterior_scene_type ?? null) ??
          asExteriorSceneType(storageMeta?.exteriorSceneType ?? null) ??
          existingLocal?.exteriorSceneType;
        const exteriorStyle =
          asExteriorStyleType(meta?.exterior_style ?? null) ??
          asExteriorStyleType(storageMeta?.exteriorStyle ?? null) ??
          existingLocal?.exteriorStyle;
        const wallTreatment =
          asWallTreatment(meta?.wall_treatment ?? null) ??
          asWallTreatment(storageMeta?.wallTreatment ?? null) ??
          existingLocal?.wallTreatment;
        const wallStyle =
          asWallStyle(meta?.wall_style ?? null) ??
          asWallStyle(storageMeta?.wallStyle ?? null) ??
          existingLocal?.wallStyle;
        const paletteId =
          asPaletteId(meta?.palette_id ?? null) ??
          asPaletteId(storageMeta?.paletteId ?? null) ??
          existingLocal?.paletteId;

        const resolved: HistoryItem = {
          id: meta?.id ?? folderName,
          imageUrl: bestImageUrl,
          originalUri: pickBestOriginalUri(
            originalSignedUrl,
            storageMeta?.originalUri,
            existingLocal?.originalUri,
            looksLikeStagingOutputHttps(meta?.original_source_uri ?? undefined)
              ? meta?.original_source_uri ?? undefined
              : undefined
          ),
          sourceUri: stagedSourceUri,
          sessionFolder: folderPath,
          designMode,
          roomType,
          style,
          exteriorSceneType,
          exteriorStyle,
          wallTreatment,
          wallStyle,
          wallColorHex: asMaybeString(
            meta?.wall_color_hex ?? storageMeta?.wallColorHex ?? null
          ),
          wallCustomPrompt: asMaybeString(
            meta?.wall_custom_prompt ?? storageMeta?.wallCustomPrompt ?? null
          ),
          paletteId,
          createdAt,
        };

        if (__DEV__) {
          // Helps diagnose missing room/style labels — shows exactly which sources contributed.
          const taxonomySources = {
            db: {
              room: meta?.room_type ?? null,
              style: meta?.style ?? null,
              exteriorScene: meta?.exterior_scene_type ?? null,
              exteriorStyle: meta?.exterior_style ?? null,
              wallTreatment: meta?.wall_treatment ?? null,
              wallStyle: meta?.wall_style ?? null,
            },
            json: {
              room: storageMeta?.roomType ?? null,
              style: storageMeta?.style ?? null,
              exteriorScene: storageMeta?.exteriorSceneType ?? null,
              exteriorStyle: storageMeta?.exteriorStyle ?? null,
              wallTreatment: storageMeta?.wallTreatment ?? null,
              wallStyle: storageMeta?.wallStyle ?? null,
            },
            resolved: {
              designMode,
              room: roomType,
              style,
              exteriorScene: exteriorSceneType,
              exteriorStyle,
              wallTreatment,
              wallStyle,
            },
          };
          const hasLabels = Boolean(
            roomType ||
              style ||
              exteriorSceneType ||
              exteriorStyle ||
              wallTreatment ||
              wallStyle
          );
          if (!hasLabels) {
            console.warn(
              "[HomeAI] History row missing labels for folder:",
              folderPath,
              taxonomySources
            );
          } else {
            console.log(
              "[HomeAI] History row resolved labels for folder:",
              folderPath,
              taxonomySources.resolved
            );
          }
        }

        return resolved;
      }
    );

    const items = itemResults
      .filter((x): x is HistoryItem => Boolean(x))
      .sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });

    if (__DEV__) {
      const labeled = items.filter(
        (x) =>
          x.roomType ||
          x.style ||
          x.exteriorSceneType ||
          x.exteriorStyle ||
          x.wallTreatment ||
          x.wallStyle
      ).length;
      console.log(
        "[HomeAI] History storage folders:",
        folders.length,
        "resolved images:",
        items.length,
        "with labels:",
        labeled,
        "DB rows:",
        metaRows.length
      );
    }

    const merged = mergeHistoryItems(localItems, items);
    const nowMs = Date.now();
    const remoteUriKeys = buildRemoteSessionUriKeySet(items, metaRows);
    const remoteSessionFolders = buildRemoteSessionFolderSet(items);
    const metaIdx = metaSessionIndex(metaRows);
    const remoteHistoryEmpty = items.length === 0 && metaRows.length === 0;

    let sanitized = sanitizePendingHistoryItems(merged, nowMs);
    if (remoteHistoryEmpty) {
      sanitized = sanitized.filter((item) =>
        shouldKeepPendingWhenRemoteEmpty(item, nowMs)
      );
    }

    // Drop orphan *storage* placeholders (expired signed URLs / deleted buckets).
    // Keep local & Replicate URIs until upload catches up or the next successful merge.
    const pruned = sanitized.filter((item) => {
      if (item.status === "pending") {
        return isActivePendingHistoryItem(item, nowMs);
      }
      const keys = historyItemUriKeys(item);
      if (keys.some((k) => remoteUriKeys.has(k))) return true;
      if (!isRenderableImageUri(item.imageUrl)) return false;
      if (!isStorageBackedHistoryItem(item)) return true;
      return false;
    });

    const serverHasSessionTruth =
      metaRows.length > 0 || items.length > 0 || remoteUriKeys.size > 0;
    const strictRemote = serverHasSessionTruth
      ? pruned.filter((item) =>
          passesStrictServerAlignment(
            item,
            metaIdx,
            remoteUriKeys,
            remoteSessionFolders,
            nowMs
          )
        )
      : pruned;
    if (__DEV__) {
      const labeled = strictRemote.filter(
        (x) =>
          x.roomType ||
          x.style ||
          x.exteriorSceneType ||
          x.exteriorStyle ||
          x.wallTreatment ||
          x.wallStyle
      ).length;
      console.log(
        "[HomeAI] History final list — items:",
        strictRemote.length,
        "with labels:",
        labeled
      );
      const missing = strictRemote
        .filter(
          (x) =>
            !(
              x.roomType ||
              x.style ||
              x.exteriorSceneType ||
              x.exteriorStyle ||
              x.wallTreatment ||
              x.wallStyle
            )
        )
        .slice(0, 5);
      if (missing.length > 0) {
        console.warn(
          "[HomeAI] History final list — rows STILL missing labels (first 5):",
          missing.map((x) => ({
            id: x.id,
            sessionFolder: x.sessionFolder,
            sourceUri: x.sourceUri,
            imageUrl: x.imageUrl,
            designMode: x.designMode,
          }))
        );
      }
    }
    // Persist merged result so revisit can reuse same cached URLs/data without refetch churn.
        return strictRemote;
      })(),
        new Promise<HistoryItem[]>((_, reject) => {
          raceTimeoutId = setTimeout(
            () => reject(new Error("History sync timed out")),
            HISTORY_REMOTE_SYNC_TIMEOUT_MS
          );
        }),
      ]);
      await writeLocalHistoryItems(strictRemote);
      return commitHistoryListCache(strictRemote);
    } finally {
      if (raceTimeoutId) clearTimeout(raceTimeoutId);
    }
  } catch (e) {
    if (isNetworkFailure(e)) {
      remoteHistoryRetryAt = Date.now() + REMOTE_HISTORY_RETRY_COOLDOWN_MS;
    }
    const deduped = await finalizeLocalHistoryForDisplay(localItems);
    void writeLocalHistoryItems(deduped);
    return commitHistoryListCache(deduped);
  }
}

function mergeHistoryItems(
  localItems: HistoryItem[],
  remoteItems: HistoryItem[]
): HistoryItem[] {
  // First pass: merge rows that belong to the same staging session — local AsyncStorage rows
  // keyed by replicate URLs MUST merge with Supabase-resolved rows keyed by bucket paths /
  // signed URLs, otherwise we keep an unlabeled server row while dropping the labelled local row.
  const byAliasKey = new Map<string, HistoryItem>();
  const orphanNoDedupeIds: HistoryItem[] = [];

  const collectOverlappingRefs = (item: HistoryItem): HistoryItem[] => {
    const seen = new Set<HistoryItem>();
    for (const k of historyStagingAliasKeysForItem(item)) {
      const hit = byAliasKey.get(k);
      if (hit) seen.add(hit);
    }
    return [...seen];
  };

  const reregisterMerged = (merged: HistoryItem): void => {
    for (const k of historyStagingAliasKeysForItem(merged)) {
      byAliasKey.set(k, merged);
    }
  };

  for (const incoming of [...remoteItems, ...localItems]) {
    const incomingKeys = historyStagingAliasKeysForItem(incoming);
    const hasAnyKey = incomingKeys.size > 0;
    if (!hasAnyKey) {
      orphanNoDedupeIds.push(incoming);
      continue;
    }
    let acc = incoming;
    for (const hit of collectOverlappingRefs(acc)) {
      acc = mergeHistoryDuplicatesBySource(hit, acc);
    }
    reregisterMerged(acc);
  }

  const dedupMergedValues = (): HistoryItem[] => {
    const seen = new Set<HistoryItem>();
    const rows: HistoryItem[] = [];
    for (const v of byAliasKey.values()) {
      if (seen.has(v)) continue;
      seen.add(v);
      rows.push(v);
    }
    return rows;
  };

  const byIdentity = new Map<string, HistoryItem>();
  const all = [...dedupMergedValues(), ...orphanNoDedupeIds].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
  for (const item of all) {
    const identityKey = historyMergeIdentityKey(item);
    const existing = byIdentity.get(identityKey);
    if (!existing) {
      byIdentity.set(identityKey, item);
      continue;
    }
    byIdentity.set(identityKey, pickPreferredHistoryItem(existing, item));
  }
  const merged = Array.from(byIdentity.values()).sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  return dedupePendingForDisplay(sanitizePendingHistoryItems(merged, Date.now()));
}

async function readLocalHistoryItems(): Promise<LocalHistoryItem[]> {
  try {
    let raw = await AsyncStorage.getItem(LOCAL_HISTORY_KEY);
    let fromLegacy = false;
    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_LOCAL_HISTORY_KEY);
      fromLegacy = Boolean(raw);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .filter((item) => typeof item?.imageUrl === "string")
      .map((item) => ({
        ...item,
        // Migration for older entries saved before `sourceUri` existed.
        sourceUri: item.sourceUri ?? item.imageUrl,
      }));
    if (fromLegacy) {
      void AsyncStorage.removeItem(LEGACY_LOCAL_HISTORY_KEY);
    }
    if (normalized.length === 0) return [];
    const sanitized = finalizeLocalHistoryItems(normalized);
    const rawSig = sortedHistoryFingerprints(normalized).join("\n");
    const cleanSig = sortedHistoryFingerprints(sanitized).join("\n");
    if (rawSig !== cleanSig) {
      void writeLocalHistoryItems(sanitized);
    } else if (fromLegacy) {
      void writeLocalHistoryItems(sanitized);
    }
    return sanitized;
  } catch {
    return [];
  }
}

async function writeLocalHistoryItems(items: LocalHistoryItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items));
  } catch {
    // non-fatal cache write failure
  }
}

/**
 * Attach Supabase folder + optional DB UUID after upload so offline merge keys line up between
 * the local replicate-URL cache row and remote storage-derived rows (fixes missing room/style UX).
 */
export async function patchLocalStagingSessionLabels(opts: {
  matchId?: string;
  stagingOutputUri: string;
  sessionFolder?: string | null;
  serverSessionId?: string | null;
}): Promise<void> {
  const stagingCanon = canonicalUriKey(opts.stagingOutputUri);
  if (!stagingCanon) return;
  const current = await readLocalHistoryItems();
  const sid = opts.serverSessionId?.trim();
  const next = current.map((row) => {
    const matchById =
      opts.matchId != null && opts.matchId !== "" && row.id === opts.matchId;
    const matchByUri =
      canonicalUriKey(row.sourceUri || row.imageUrl) === stagingCanon ||
      canonicalUriKey(row.imageUrl) === stagingCanon;
    if (!(matchById || matchByUri)) return row;
    const folderTrim = opts.sessionFolder?.trim();
    return {
      ...row,
      sessionFolder: folderTrim || row.sessionFolder,
      id: sid && looksLikeUuid(sid) ? sid : row.id,
    };
  });
  await writeLocalHistoryItems(next);
  invalidateHistoryListCache();
}

export async function appendLocalHistoryItem(item: HistoryItem): Promise<void> {
  const current = await readLocalHistoryItems();
  const normalized: HistoryItem = {
    ...item,
    status: item.status ?? "completed",
    createdAt: item.createdAt ?? new Date().toISOString(),
  };
  const attemptKey = stagingAttemptKey(normalized);
  const photoKey =
    normalized.status === "pending" ? pendingPhotoDedupeKey(normalized) : "";

  const withoutDup = current.filter((x) => {
    if (x.id === normalized.id) return false;
    if (stagingAttemptKey(x) === attemptKey) return false;
    if (
      normalized.status === "pending" &&
      x.status === "pending" &&
      photoKey &&
      pendingPhotoDedupeKey(x) === photoKey
    ) {
      return false;
    }
    return true;
  });
  const merged = [normalized, ...withoutDup];
  const next = finalizeLocalHistoryItems(merged).slice(0, LOCAL_HISTORY_MAX);
  await writeLocalHistoryItems(next);
  invalidateHistoryListCache();
}

export async function removeLocalHistoryItemById(id: string): Promise<void> {
  const current = await readLocalHistoryItems();
  const next = current.filter((item) => item.id !== id);
  await writeLocalHistoryItems(next);
  invalidateHistoryListCache();
}

export async function deleteHistoryItem(item: HistoryItem): Promise<void> {
  const current = await readLocalHistoryItems();
  const removeKeys = historyStagingAliasKeysForItem(item);
  const folder = sessionFolderForDelete(item);
  const next = current.filter((x) => {
    if (x.id === item.id) return false;
    if (folder && x.sessionFolder === folder) return false;
    for (const k of removeKeys) {
      if (historyStagingAliasKeysForItem(x).has(k)) return false;
    }
    return true;
  });
  await writeLocalHistoryItems(next);
  invalidateHistoryListCache();

  const supabase = getSupabase();
  // No client: local cache already cleared. Common cases — missing env vars, or iOS Simulator
  // dev bypass in getSupabase() (remote writes/deletes are skipped there by design).
  if (!supabase) return;

  const bucket = stagingBucketName();

  const storageIssues: string[] = [];

  if (folder) {
    const filesRes = await supabase.storage.from(bucket).list(folder, { limit: 100 });
    if (filesRes.error) {
      storageIssues.push(`storage list: ${filesRes.error.message}`);
    } else {
      const filePaths = (filesRes.data ?? [])
        .map((f) => f.name)
        .filter((name): name is string => Boolean(name))
        .map((name) => `${folder}/${name}`);
      if (filePaths.length > 0) {
        const rm = await supabase.storage.from(bucket).remove(filePaths);
        if (rm.error) storageIssues.push(`storage remove: ${rm.error.message}`);
      }
    }
  }

  let dbError: string | undefined;
  if (looksLikeUuid(item.id)) {
    const { error } = await supabase.from("staging_sessions").delete().eq("id", item.id);
    if (error) dbError = error.message;
  }
  if (folder) {
    const { error } = await supabase.from("staging_sessions").delete().eq("folder", folder);
    if (error) dbError = dbError ?? error.message;
  }

  const couldTargetRemote = looksLikeUuid(item.id) || Boolean(folder);
  if (!couldTargetRemote) {
    throw new Error(
      "Could not remove this item from online backup. Check your connection and try again."
    );
  }
  if (dbError) {
    const hint =
      /permission denied|row-level security|policy/i.test(dbError)
        ? " Online backup may not be set up correctly on the server."
        : "";
    throw new Error(
      [`database: ${dbError}`, hint, ...storageIssues].filter(Boolean).join(" ")
    );
  }

  if (storageIssues.length > 0) {
    throw new Error(
      `${storageIssues.join(
        " "
      )} Could not delete files from online backup. Please try again later.`
    );
  }
}
