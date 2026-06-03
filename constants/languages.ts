/**
 * Display locales for the in-app language picker (BCP-47–style ids).
 * Labels are end-user facing; UI strings fall back to English unless translated in `locales/`.
 */
export const LANGUAGES = [
  { id: "en-US", label: "English (United States)", flag: "🇺🇸" },
  { id: "en-GB", label: "English (United Kingdom)", flag: "🇬🇧" },
  { id: "es-MX", label: "Español (México)", flag: "🇲🇽" },
  { id: "es-ES", label: "Español (España)", flag: "🇪🇸" },
  { id: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { id: "pt-PT", label: "Português (Portugal)", flag: "🇵🇹" },
  { id: "de", label: "Deutsch", flag: "🇩🇪" },
  { id: "fr", label: "Français", flag: "🇫🇷" },
  { id: "ja", label: "日本語", flag: "🇯🇵" },
  { id: "ko", label: "한국어", flag: "🇰🇷" },
  { id: "zh-CN", label: "简体中文", flag: "🇨🇳" },
  { id: "zh-TW", label: "繁體中文", flag: "🇹🇼" },
  { id: "it", label: "Italiano", flag: "🇮🇹" },
  { id: "th", label: "ไทย", flag: "🇹🇭" },
  { id: "ms-MY", label: "Bahasa Melayu", flag: "🇲🇾" },
  { id: "fil-PH", label: "Filipino", flag: "🇵🇭" },
  { id: "hi", label: "हिंदी", flag: "🇮🇳" },
  { id: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { id: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { id: "nl", label: "Nederlands", flag: "🇳🇱" },
  { id: "da", label: "Dansk", flag: "🇩🇰" },
  { id: "pl", label: "Polski", flag: "🇵🇱" },
  { id: "ar-AE", label: "العربية", flag: "🇦🇪" },
  { id: "fi", label: "Suomi", flag: "🇫🇮" },
  { id: "nb", label: "Norsk", flag: "🇳🇴" },
  { id: "sv", label: "Svenska", flag: "🇸🇪" },
  { id: "tr", label: "Türkçe", flag: "🇹🇷" },
  { id: "hu", label: "Magyar nyelv", flag: "🇭🇺" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const DEFAULT_LANGUAGE_ID: LanguageId = "en-US";

export function isLanguageId(value: string): value is LanguageId {
  return LANGUAGES.some((l) => l.id === value);
}

export function languageDisplayLabel(id: LanguageId): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
