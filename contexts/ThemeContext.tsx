import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, type ViewStyle } from "react-native";
import {
  CCDark,
  CCLight,
  createAmbientShadow,
  createGhostBorder,
  createPrimaryGlowShadow,
  createTypography,
  primaryOverlay,
  type ThemePalette,
  type ThemeTypography,
} from "../theme/curatedCanvas";
import {
  setDarkModeEnabled,
  STORAGE_DARK_MODE,
} from "../services/settingsPreferences";

type ThemeContextValue = {
  isDark: boolean;
  colors: ThemePalette;
  typography: ThemeTypography;
  ghostBorder: ViewStyle;
  ambientShadow: ViewStyle;
  primaryGlowShadow: ViewStyle;
  primaryOverlay: typeof primaryOverlay;
  setDarkMode: (next: boolean) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function readStoredDarkMode(): Promise<boolean | null> {
  const raw = await AsyncStorage.getItem(STORAGE_DARK_MODE);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readStoredDarkMode().then((stored) => {
      if (cancelled) return;
      if (stored === true) {
        setIsDark(true);
        Appearance.setColorScheme("dark");
      } else if (stored === false) {
        setIsDark(false);
        Appearance.setColorScheme("light");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const colors = useMemo<ThemePalette>(
    () => (isDark ? CCDark : CCLight),
    [isDark]
  );

  const typography = useMemo(() => createTypography(colors), [colors]);

  const ghostBorder = useMemo(
    () => createGhostBorder(isDark),
    [isDark]
  );

  const ambientShadow = useMemo(
    () => createAmbientShadow(isDark),
    [isDark]
  );

  const primaryGlowShadow = useMemo(
    () => createPrimaryGlowShadow(isDark),
    [isDark]
  );

  const setDarkMode = useCallback(async (next: boolean) => {
    setIsDark(next);
    await setDarkModeEnabled(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDark,
      colors,
      typography,
      ghostBorder,
      ambientShadow,
      primaryGlowShadow,
      primaryOverlay,
      setDarkMode,
    }),
    [
      isDark,
      colors,
      typography,
      ghostBorder,
      ambientShadow,
      primaryGlowShadow,
      setDarkMode,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx == null) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
