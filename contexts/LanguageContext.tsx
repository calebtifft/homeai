import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LanguageId } from "../constants/languages";
import { DEFAULT_LANGUAGE_ID } from "../constants/languages";
import { loadLanguageId, setLanguageId as persistLanguageId } from "../services/languagePreferences";
import type { StringKey } from "../locales/strings";
import { translate } from "../locales/strings";

type LanguageContextValue = {
  languageId: LanguageId;
  setLanguageId: (next: LanguageId) => Promise<void>;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Stash a one-shot toast message (e.g. after saving language) for the next screen to show via `takeQueuedLanguageSavedToast`. */
  queueLanguageSavedToast: (message: string) => void;
  takeQueuedLanguageSavedToast: () => string | null;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const pendingSavedToastRef = useRef<string | null>(null);
  const [languageId, setLanguageIdState] = useState<LanguageId>(
    DEFAULT_LANGUAGE_ID
  );

  useEffect(() => {
    let cancelled = false;
    void loadLanguageId().then((id) => {
      if (!cancelled) setLanguageIdState(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguageId = useCallback(async (next: LanguageId) => {
    await persistLanguageId(next);
    setLanguageIdState(next);
  }, []);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) =>
      translate(languageId, key, vars),
    [languageId]
  );

  const queueLanguageSavedToast = useCallback((message: string) => {
    pendingSavedToastRef.current = message;
  }, []);

  const takeQueuedLanguageSavedToast = useCallback(() => {
    const msg = pendingSavedToastRef.current;
    pendingSavedToastRef.current = null;
    return msg;
  }, []);

  const value = useMemo(
    () => ({
      languageId,
      setLanguageId,
      t,
      queueLanguageSavedToast,
      takeQueuedLanguageSavedToast,
    }),
    [languageId, setLanguageId, t, queueLanguageSavedToast, takeQueuedLanguageSavedToast]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
