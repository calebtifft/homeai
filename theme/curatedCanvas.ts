/**
 * "The Curated Canvas" — emerald-forward palette (#348F68 as brand primary).
 * `CCLight` is the original cream surfaces; `CCDark` mirrors the same roles for dark mode.
 */
import { Platform, type TextStyle, type ViewStyle } from "react-native";

/** Light theme — warm cream surfaces, green-gray neutrals. */
export const CCLight = {
  surface: "#faf9f5",
  surfaceBright: "#fcfcf9",
  surfaceContainer: "#eef0ea",
  surfaceContainerLow: "#f4f5f0",
  surfaceContainerHigh: "#e4e6df",
  surfaceContainerHighest: "#d9dcd3",
  surfaceContainerLowest: "#ffffff",
  surfaceDim: "#cdd0c6",
  onSurface: "#2b2e26",
  onSurfaceVariant: "#575c52",
  onBackground: "#2b2e26",
  primary: "#348F68",
  primaryDim: "#2B7856",
  onPrimary: "#fafaf8",
  primaryContainer: "#d7efe4",
  onPrimaryContainer: "#153b2a",
  secondaryContainer: "#e9ebe4",
  onSecondaryContainer: "#40453a",
  outlineVariant: "#a4ab9b",
} as const;

/** Dark theme — same structure, deep olive-gray surfaces, slightly lifted sage accents. */
export const CCDark = {
  surface: "#121410",
  surfaceBright: "#1a1c17",
  surfaceContainer: "#232720",
  surfaceContainerLow: "#1e211c",
  surfaceContainerHigh: "#2f342c",
  surfaceContainerHighest: "#3a4036",
  surfaceContainerLowest: "#1c1f1a",
  surfaceDim: "#0c0d0b",
  onSurface: "#e8ebe3",
  onSurfaceVariant: "#a8b09c",
  onBackground: "#e8ebe3",
  primary: "#63B592",
  primaryDim: "#348F68",
  onPrimary: "#0c1f16",
  primaryContainer: "#1f4c38",
  onPrimaryContainer: "#d5efe3",
  secondaryContainer: "#2a2e27",
  onSecondaryContainer: "#d2d8ca",
  outlineVariant: "#5c6652",
} as const;

export type ThemePalette = typeof CCLight | typeof CCDark;

/** rgba() overlays from brand #348F68 = rgb(52, 143, 104) — used on imagery in both themes. */
export const primaryOverlay = {
  o06: "rgba(52, 143, 104, 0.06)",
  o08: "rgba(52, 143, 104, 0.08)",
  o10: "rgba(52, 143, 104, 0.10)",
  o20: "rgba(52, 143, 104, 0.20)",
  o22: "rgba(52, 143, 104, 0.22)",
  o85: "rgba(52, 143, 104, 0.85)",
} as const;

export function createGhostBorder(isDark: boolean): ViewStyle {
  return {
    borderWidth: 1,
    borderColor: isDark
      ? "rgba(255, 255, 255, 0.10)"
      : "rgba(164, 171, 155, 0.22)",
  };
}

export function createAmbientShadow(isDark: boolean): ViewStyle {
  return (
    Platform.select({
      ios: {
        shadowColor: isDark ? "#000000" : "#2b2e26",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.45 : 0.06,
        shadowRadius: isDark ? 20 : 16,
      },
      android: { elevation: isDark ? 12 : 8 },
      default: {},
    }) ?? {}
  );
}

export function createPrimaryGlowShadow(isDark: boolean): ViewStyle {
  return (
    Platform.select({
      ios: {
        shadowColor: isDark ? "#000000" : "#2B7856",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: isDark ? 0.5 : 0.35,
        shadowRadius: isDark ? 16 : 12,
      },
      android: { elevation: isDark ? 14 : 10 },
      default: {},
    }) ?? {}
  );
}

/** Manrope family names post-load (@expo-google-fonts/manrope). */
export const Manrope = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semiBold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extraBold: "Manrope_800ExtraBold",
} as const;

export const radius = {
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

const OVERLAY_LIGHT = "#fafaf8";

export function createTypography(c: ThemePalette) {
  return {
    display: {
      fontFamily: Manrope.extraBold,
      fontSize: 34,
      lineHeight: 40,
      letterSpacing: -0.5,
      color: c.onSurface,
    } satisfies TextStyle,
    displaySm: {
      fontFamily: Manrope.extraBold,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.4,
      color: c.onBackground,
    } satisfies TextStyle,
    headline: {
      fontFamily: Manrope.bold,
      fontSize: 20,
      letterSpacing: -0.2,
      color: c.onSurface,
    } satisfies TextStyle,
    title: {
      fontFamily: Manrope.bold,
      fontSize: 18,
      color: c.onSurface,
    } satisfies TextStyle,
    titleSm: {
      fontFamily: Manrope.semiBold,
      fontSize: 17,
      letterSpacing: -0.15,
      color: c.onSurface,
    } satisfies TextStyle,
    lead: {
      fontFamily: Manrope.semiBold,
      fontSize: 16,
      lineHeight: 22,
      letterSpacing: -0.1,
      color: c.onSurface,
    } satisfies TextStyle,
    body: {
      fontFamily: Manrope.regular,
      fontSize: 16,
      lineHeight: 24,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    bodyMedium: {
      fontFamily: Manrope.medium,
      fontSize: 16,
      lineHeight: 24,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    bodySm: {
      fontFamily: Manrope.regular,
      fontSize: 14,
      lineHeight: 20,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    bodySmMedium: {
      fontFamily: Manrope.medium,
      fontSize: 14,
      lineHeight: 20,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    label: {
      fontFamily: Manrope.semiBold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    overline: {
      fontFamily: Manrope.semiBold,
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: "uppercase" as const,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    kickerSm: {
      fontFamily: Manrope.semiBold,
      fontSize: 11,
      letterSpacing: 1.1,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    caption: {
      fontFamily: Manrope.regular,
      fontSize: 12,
      lineHeight: 16,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    captionMedium: {
      fontFamily: Manrope.medium,
      fontSize: 12,
      lineHeight: 16,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    micro: {
      fontFamily: Manrope.regular,
      fontSize: 10,
      lineHeight: 14,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
    wordmark: {
      fontFamily: Manrope.extraBold,
      fontSize: 22,
      letterSpacing: -0.4,
      color: c.onSurface,
    } satisfies TextStyle,
    emphasisSm: {
      fontFamily: Manrope.semiBold,
      fontSize: 12,
      lineHeight: 16,
      color: c.onSurface,
    } satisfies TextStyle,
    controlLabel: {
      fontFamily: Manrope.semiBold,
      fontSize: 14,
      lineHeight: 18,
      color: c.onSurface,
    } satisfies TextStyle,
    cta: {
      fontFamily: Manrope.bold,
      fontSize: 17,
      color: c.onPrimary,
    } satisfies TextStyle,
    secondaryCta: {
      fontFamily: Manrope.bold,
      fontSize: 16,
      color: c.onSecondaryContainer,
    } satisfies TextStyle,
    uiTag: {
      fontFamily: Manrope.semiBold,
      fontSize: 10,
      letterSpacing: 1.2,
      color: c.primary,
    } satisfies TextStyle,
    badge: {
      fontFamily: Manrope.bold,
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
      color: c.primary,
    } satisfies TextStyle,
    badgeOnDark: {
      fontFamily: Manrope.bold,
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      color: OVERLAY_LIGHT,
    } satisfies TextStyle,
    badgeLight: {
      fontFamily: Manrope.bold,
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      color: c.onSurface,
    } satisfies TextStyle,
    stepIndex: {
      fontFamily: Manrope.bold,
      fontSize: 13,
      color: c.onPrimary,
    } satisfies TextStyle,
    metaValue: {
      fontFamily: Manrope.semiBold,
      fontSize: 16,
      color: c.primary,
    } satisfies TextStyle,
    imageOverlayTitle: {
      fontFamily: Manrope.bold,
      fontSize: 17,
      letterSpacing: -0.2,
      color: OVERLAY_LIGHT,
    } satisfies TextStyle,
    imageOverlaySubtitle: {
      fontFamily: Manrope.medium,
      fontSize: 13,
      lineHeight: 18,
      color: "rgba(255,255,255,0.88)",
    } satisfies TextStyle,
    finePrint: {
      fontFamily: Manrope.medium,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
      color: c.onSurfaceVariant,
    } satisfies TextStyle,
  };
}

export type ThemeTypography = ReturnType<typeof createTypography>;
