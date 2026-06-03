/**
 * Legal document URLs — override via .env before App Store / Play submission.
 *
 * Defaults: https://homeai-website.vercel.app (privacy, terms sections).
 */
export type LegalDocumentId = "terms" | "privacy";

const DEFAULT_LEGAL_URLS: Record<LegalDocumentId, string> = {
  terms: "https://homeai-website.vercel.app/#terms",
  privacy: "https://homeai-website.vercel.app/#privacy",
};

function trimUrl(value: string | undefined): string | null {
  const v = value?.trim();
  return v && v.length > 0 ? v : null;
}

export function getLegalDocumentUrl(id: LegalDocumentId): string {
  if (id === "terms") {
    return (
      trimUrl(process.env.EXPO_PUBLIC_LEGAL_TERMS_URL) ?? DEFAULT_LEGAL_URLS.terms
    );
  }
  return (
    trimUrl(process.env.EXPO_PUBLIC_LEGAL_PRIVACY_URL) ??
    DEFAULT_LEGAL_URLS.privacy
  );
}
