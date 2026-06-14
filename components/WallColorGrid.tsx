import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import {
  WALL_QUICK_COLORS,
  type WallQuickColorId,
} from "../constants/wallsDesign";

const SWATCH = 44;
const GAP = 10;
const RAINBOW: readonly [string, string, ...string[]] = [
  "#F25C5C",
  "#F2A65C",
  "#F2E25C",
  "#7CE25C",
  "#5CE2C0",
  "#5CBDE2",
  "#7C5CE2",
  "#E25CCB",
  "#F25C5C",
];

type WallColorGridProps = {
  selectedId: WallQuickColorId | undefined;
  onSelect: (id: WallQuickColorId) => void;
  labelFor: (id: WallQuickColorId) => string;
};

export function WallColorGrid({ selectedId, onSelect, labelFor }: WallColorGridProps) {
  const { colors, isDark } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        grid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          rowGap: GAP,
          columnGap: GAP,
          padding: 14,
          borderRadius: 18,
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
          alignSelf: "center",
          width: "100%",
          maxWidth: 400,
        },
        cell: {
          width: SWATCH,
          height: SWATCH,
          alignItems: "center",
          justifyContent: "center",
        },
        ring: {
          width: "92%",
          height: "92%",
          borderRadius: 9999,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: "transparent",
        },
        ringSelected: {
          borderColor: colors.primary,
        },
        swatch: {
          width: "88%",
          height: "88%",
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.16)"
            : "rgba(0,0,0,0.10)",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        swatchWhite: {
          borderColor: isDark
            ? "rgba(255,255,255,0.35)"
            : "rgba(0,0,0,0.18)",
        },
        rainbowOuter: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: 9999,
          overflow: "hidden",
        },
        rainbowCenter: {
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.surfaceContainerLowest,
          alignItems: "center",
          justifyContent: "center",
        },
      }),
    [colors, isDark]
  );

  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {WALL_QUICK_COLORS.map((c) => {
        const isSelected = selectedId === c.id;
        const isWhite = c.hex?.toUpperCase() === "#FFFFFF";
        return (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c.id)}
            style={({ pressed }) => [
              styles.cell,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={labelFor(c.id)}
          >
            <View style={[styles.ring, isSelected && styles.ringSelected]}>
              {c.id === "custom" ? (
                <View style={[styles.swatch]}>
                  <LinearGradient
                    colors={RAINBOW}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.rainbowOuter}
                  />
                  <View style={styles.rainbowCenter} pointerEvents="none">
                    <MaterialIcons
                      name="colorize"
                      size={14}
                      color={colors.onSurface}
                    />
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.swatch,
                    isWhite && styles.swatchWhite,
                    { backgroundColor: c.hex ?? "#CCCCCC" },
                  ]}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
