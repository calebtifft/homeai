import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import type { StagingPaletteId } from "../constants/colorPalettes";
import { isSurprisePalette, STAGING_PALETTES } from "../constants/colorPalettes";
import { useTheme } from "../contexts/ThemeContext";
import { Manrope } from "../theme/curatedCanvas";

const COLS = 3;
const RING = 3;
const COL_GAP = 10;
const GRID_MAX_W = 400;
const PREVIEW_H = 56;
const LABEL_H = 40;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size) as T[]);
  }
  return out;
}

type ColorPaletteGridProps = {
  selected: StagingPaletteId;
  onSelect: (id: StagingPaletteId) => void;
  labelFor: (id: StagingPaletteId) => string;
};

export function ColorPaletteGrid({ selected, onSelect, labelFor }: ColorPaletteGridProps) {
  const { colors, isDark } = useTheme();
  const rows = useMemo(() => chunk(STAGING_PALETTES, COLS), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        grid: {
          width: "100%",
          maxWidth: GRID_MAX_W,
          alignSelf: "center",
        },
        row: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: COL_GAP,
        },
        cell: {
          flex: 1,
          minWidth: 0,
          alignItems: "stretch",
        },
        cardOuter: {
          borderRadius: 14,
          borderWidth: RING,
          borderColor: "transparent",
          overflow: "hidden",
          backgroundColor: colors.surfaceContainerLow,
        },
        cardOuterSelected: {
          borderColor: colors.primary,
          backgroundColor: isDark
            ? "rgba(115, 134, 86, 0.14)"
            : "rgba(115, 134, 86, 0.08)",
        },
        preview: {
          height: PREVIEW_H,
          width: "100%",
          flexDirection: "row",
        },
        bar: {
          flex: 1,
        },
        surpriseGradient: {
          ...StyleSheet.absoluteFillObject,
        },
        surpriseIconWrap: {
          ...StyleSheet.absoluteFillObject,
          alignItems: "center",
          justifyContent: "center",
        },
        surpriseIconBubble: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: "rgba(255,255,255,0.92)",
          alignItems: "center",
          justifyContent: "center",
        },
        labelWrap: {
          minHeight: LABEL_H,
          paddingHorizontal: 6,
          paddingVertical: 8,
          justifyContent: "center",
          backgroundColor: isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.04)",
        },
        label: {
          fontFamily: Manrope.semiBold,
          fontSize: 11,
          letterSpacing: -0.1,
          textAlign: "center",
          color: colors.onSurface,
        },
        labelSelected: {
          color: colors.primary,
        },
      }),
    [colors, isDark]
  );

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((p) => {
            const isSelected = selected === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => onSelect(p.id)}
                style={({ pressed }) => [
                  styles.cell,
                  pressed && { opacity: 0.92 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={labelFor(p.id)}
              >
                <View
                  style={[
                    styles.cardOuter,
                    isSelected && styles.cardOuterSelected,
                  ]}
                >
                  <View style={styles.preview}>
                    {isSurprisePalette(p.id) ? (
                      <>
                        <LinearGradient
                          colors={["#FF6B6B", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.surpriseGradient}
                        />
                        <View style={styles.surpriseIconWrap} pointerEvents="none">
                          <View style={styles.surpriseIconBubble}>
                            <MaterialIcons name="card-giftcard" size={22} color={colors.primary} />
                          </View>
                        </View>
                      </>
                    ) : (
                      p.colors.map((hex, i) => (
                        <View key={i} style={[styles.bar, { backgroundColor: hex }]} />
                      ))
                    )}
                  </View>
                  <View style={styles.labelWrap}>
                    <Text
                      style={[styles.label, isSelected && styles.labelSelected]}
                      numberOfLines={2}
                    >
                      {labelFor(p.id)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
          {row.length < COLS
            ? Array.from({ length: COLS - row.length }).map((_, i) => (
                <View key={`pad-${rowIndex}-${i}`} style={styles.cell} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
