import type { Theme } from "@react-navigation/native";
import type { ThemePalette } from "./curatedCanvas";

const MANROPE = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semiBold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
} as const;

export function buildAppNavigationTheme(
  colors: ThemePalette,
  isDark: boolean
): Theme {
  return {
    dark: isDark,
    colors: {
      primary: colors.primary,
      background: colors.surface,
      card: colors.surface,
      text: colors.onSurface,
      border: isDark
        ? "rgba(255, 255, 255, 0.12)"
        : "rgba(164, 171, 155, 0.28)",
      notification: colors.primaryDim,
    },
    fonts: {
      regular: { fontFamily: MANROPE.regular, fontWeight: "400" },
      medium: { fontFamily: MANROPE.medium, fontWeight: "500" },
      bold: { fontFamily: MANROPE.semiBold, fontWeight: "600" },
      heavy: { fontFamily: MANROPE.bold, fontWeight: "700" },
    },
  };
}
