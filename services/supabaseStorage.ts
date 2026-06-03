import * as FileSystem from "expo-file-system/legacy";
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
  StagingPhotoMode,
  StyleType,
} from "../types";
import { getInstallationId } from "./identity";
import { getSupabase } from "./supabase";
import { ensureAnonymousSession } from "./supabaseAuth";

const DEFAULT_BUCKET = "homeai-uploads";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function bucketName(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_STAGING_BUCKET?.trim() || DEFAULT_BUCKET
  );
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function extFromLocalUri(uri: string): { ext: string; contentType: string } {
  const path = uri.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return { ext: "png", contentType: "image/png" };
  if (path.endsWith(".webp")) return { ext: "webp", contentType: "image/webp" };
  if (path.endsWith(".heic") || path.endsWith(".heif")) {
    return { ext: "heic", contentType: "image/heic" };
  }
  return { ext: "jpg", contentType: "image/jpeg" };
}

export type StagingUploadResult = {
  bucket: string;
  userId: string;
  folder: string;
  originalPath: string;
  stagedPath: string;
  metadataPath: string;
  originalSignedUrl: string;
  stagedSignedUrl: string;
  sessionId: string | null;
};

type StagingUploadMeta = {
  designMode?: DesignMode;
  roomType?: RoomType;
  style?: StyleType;
  exteriorSceneType?: ExteriorSceneType;
  exteriorStyle?: ExteriorStyleType;
  wallTreatment?: WallTreatmentType;
  wallStyle?: WallStylePresetId;
  wallColorHex?: string;
  wallCustomPrompt?: string;
  photoMode?: StagingPhotoMode;
  paletteId?: StagingPaletteId;
};

function jsonToArrayBuffer(value: unknown): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return new Uint8Array(encoded).buffer;
}

function isSkippableStorageError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    lower.includes("row-level security policy") ||
    lower.includes("bucket not found") ||
    lower.includes("permission denied")
  );
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    // Prefer cached session user in-app (faster and more resilient than forcing an auth roundtrip).
    const sessionRes = await supabase.auth.getSession();
    const fromSession = sessionRes.data.session?.user?.id;
    if (fromSession) return fromSession;

    // Fallback: server-validated user when session cache is empty.
    const userRes = await supabase.auth.getUser();
    if (userRes.error) return null;
    return userRes.data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Uploads the user's original (local) image and the staged (remote URL) image
 * under a user-scoped folder in Supabase Storage.
 * No-op when Supabase env is not set or no authenticated user is present.
 */
export async function uploadStagingSession(
  localOriginalUri: string,
  remoteStagedImageUrl: string,
  meta?: StagingUploadMeta
): Promise<StagingUploadResult | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      if (__DEV__) {
        console.warn("[HomeAI] Supabase upload skipped: Supabase env vars are missing.");
      }
      return null;
    }
    const ensureRes = await ensureAnonymousSession();
    if (ensureRes.error && __DEV__) {
      console.warn("[HomeAI] Could not create anonymous session:", ensureRes.error.message);
    }

    const userId = await getAuthenticatedUserId();
    if (!userId) {
      if (__DEV__) {
        console.warn(
          "[HomeAI] Supabase upload skipped: no authenticated user (sign in required)."
        );
      }
      return null;
    }

    const bucket = bucketName();
    const installationId = await getInstallationId();
    const sessionToken = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const folder = `users/${userId}/sessions/${sessionToken}`;

    const { ext, contentType } = extFromLocalUri(localOriginalUri);
    const originalObjectPath = `${folder}/original.${ext}`;

    const base64 = await FileSystem.readAsStringAsync(localOriginalUri, {
      encoding: "base64",
    });
    const originalBody = base64ToArrayBuffer(base64);

    const originalUp = await supabase.storage
      .from(bucket)
      .upload(originalObjectPath, originalBody, {
        contentType,
        upsert: false,
      });

    if (originalUp.error) throw originalUp.error;

    const stagedRes = await fetch(remoteStagedImageUrl);
    if (!stagedRes.ok) {
      throw new Error(
        `Could not download staged image for upload (${stagedRes.status}).`
      );
    }
    const stagedBody = await stagedRes.arrayBuffer();

    const stagedObjectPath = `${folder}/staged.jpg`;
    const stagedUp = await supabase.storage
      .from(bucket)
      .upload(stagedObjectPath, stagedBody, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (stagedUp.error) throw stagedUp.error;

    const metadataObjectPath = `${folder}/metadata.json`;
    const metadataPayload = {
      userId,
      installationId,
      stagedSourceUri: remoteStagedImageUrl,
      designMode: meta?.designMode ?? null,
      roomType: meta?.roomType ?? null,
      style: meta?.style ?? null,
      exteriorSceneType: meta?.exteriorSceneType ?? null,
      exteriorStyle: meta?.exteriorStyle ?? null,
      wallTreatment: meta?.wallTreatment ?? null,
      wallStyle: meta?.wallStyle ?? null,
      wallColorHex: meta?.wallColorHex ?? null,
      wallCustomPrompt: meta?.wallCustomPrompt ?? null,
      photoMode: meta?.photoMode ?? null,
      paletteId: meta?.paletteId ?? null,
      createdAt: new Date().toISOString(),
    };
    const metadataUp = await supabase.storage
      .from(bucket)
      .upload(metadataObjectPath, jsonToArrayBuffer(metadataPayload), {
        contentType: "application/json",
        upsert: false,
      });
    if (metadataUp.error && __DEV__) {
      console.warn("[HomeAI] metadata.json upload skipped:", metadataUp.error.message);
    }

    const originalSigned = await supabase.storage
      .from(bucket)
      .createSignedUrl(originalObjectPath, SIGNED_URL_TTL_SECONDS);
    if (originalSigned.error) throw originalSigned.error;
    const stagedSigned = await supabase.storage
      .from(bucket)
      .createSignedUrl(stagedObjectPath, SIGNED_URL_TTL_SECONDS);
    if (stagedSigned.error) throw stagedSigned.error;

    let sessionId: string | null = null;
    const baseInsertPayload: Record<string, unknown> = {
      user_id: userId,
      bucket,
      folder,
      original_path: originalUp.data.path,
      staged_path: stagedUp.data.path,
      original_source_uri: localOriginalUri,
      staged_source_uri: remoteStagedImageUrl,
      design_mode: meta?.designMode ?? null,
      room_type: meta?.roomType ?? null,
      style: meta?.style ?? null,
      exterior_scene_type: meta?.exteriorSceneType ?? null,
      exterior_style: meta?.exteriorStyle ?? null,
      wall_treatment: meta?.wallTreatment ?? null,
      wall_style: meta?.wallStyle ?? null,
      wall_color_hex: meta?.wallColorHex ?? null,
      wall_custom_prompt: meta?.wallCustomPrompt ?? null,
      photo_mode: meta?.photoMode ?? null,
      palette_id: meta?.paletteId ?? null,
    };

    const tryInsert = async (
      includeInstallation: boolean
    ): Promise<{ id: string } | { error: string }> => {
      const payload = includeInstallation
        ? { ...baseInsertPayload, installation_id: installationId }
        : baseInsertPayload;
      const res = await supabase
        .from("staging_sessions")
        .insert(payload)
        .select("id")
        .single();
      if (res.error) return { error: res.error.message };
      return { id: String(res.data.id) };
    };

    let first = await tryInsert(true);
    if ("error" in first && /installation_id/i.test(first.error)) {
      // Older schema (run supabase/storage-policies.sql to add the column). Retry without it
      // so the row is still persisted — otherwise History/Gallery would lose the DB-side labels
      // and fall back on metadata.json alone.
      if (__DEV__) {
        console.warn(
          "[HomeAI] staging_sessions: 'installation_id' column missing — re-running insert without it. " +
            "Apply supabase/storage-policies.sql to add it permanently."
        );
      }
      first = await tryInsert(false);
    }
    if ("id" in first) {
      sessionId = first.id;
    } else if (__DEV__) {
      console.warn("[HomeAI] staging_sessions insert skipped:", first.error);
    }

    return {
      bucket,
      userId,
      folder,
      originalPath: originalUp.data.path,
      stagedPath: stagedUp.data.path,
      metadataPath: metadataObjectPath,
      originalSignedUrl: originalSigned.data.signedUrl,
      stagedSignedUrl: stagedSigned.data.signedUrl,
      sessionId,
    };
  } catch (error) {
    if (isSkippableStorageError(error)) {
      if (__DEV__) {
        console.warn(
          "[HomeAI] Supabase upload skipped: bucket/policy not ready. Run `supabase/storage-policies.sql` and confirm bucket `homeai-uploads` exists."
        );
      }
      return null;
    }
    throw error;
  }
}
