/** Marker prefix — detected by `formatStagingError` for a dedicated user-facing alert. */
export const PHOTO_FORMAT_ERROR_PREFIX = "PHOTO_FORMAT_UNSUPPORTED:";

const EXTENSION_BY_TOKEN: Record<string, string> = {
  jpg: ".jpg",
  jpeg: ".jpg",
  png: ".png",
  heic: ".heic",
  heif: ".heif",
  webp: ".webp",
  avif: ".avif",
  tif: ".tiff",
  tiff: ".tiff",
  gif: ".gif",
  bmp: ".bmp",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** Preserve the original extension when copying non-file:// picker URIs to cache. */
export function extensionFromUri(uri: string): string {
  const path = uri.split("?")[0] ?? uri;
  const match = path.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return ".img";
  }
  const token = match[1].toLowerCase();
  return EXTENSION_BY_TOKEN[token] ?? `.${token}`;
}

export function mimeTypeFromExtension(ext: string): string {
  const token = ext.replace(/^\./, "").toLowerCase();
  return MIME_BY_EXTENSION[token] ?? "application/octet-stream";
}

export function guessMultipartImagePart(localUri: string): {
  name: string;
  type: string;
} {
  const base =
    localUri.split("/").pop()?.split("?")[0]?.trim() || "room-photo.jpg";
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) {
    return { name: `${base}.jpg`, type: "image/jpeg" };
  }
  const ext = lower.slice(dot);
  return { name: base, type: mimeTypeFromExtension(ext) };
}

export function createPhotoFormatError(detail?: string): Error {
  const msg =
    "Could not read this photo format. Try another image, take a new photo in the app, or export as JPEG from your library.";
  return new Error(
    detail
      ? `${PHOTO_FORMAT_ERROR_PREFIX} ${msg} (${detail})`
      : `${PHOTO_FORMAT_ERROR_PREFIX} ${msg}`
  );
}

export function isPhotoFormatError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  return (
    raw.includes(PHOTO_FORMAT_ERROR_PREFIX) ||
    lower.includes("could not convert image to rgb jpeg") ||
    lower.includes("could not read photo dimensions")
  );
}
