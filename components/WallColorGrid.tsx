import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import {
  WALL_QUICK_COLORS,
  type WallQuickColorId,
} from "../constants/wallsDesign";
import { useTheme } from "../contexts/ThemeContext";
import { Manrope } from "../theme/curatedCanvas";

const COLS = 6;
const RING = 3;
const GAP = 10;
const GRID_MAX_W = 400;
const CONFIGURE_PAD_X = 48;
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

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size) as T[]);
  }
  return out;
}

type WallColorGridProps = {
  selectedId: WallQuickColorId | undefined;
  /** When set, shown in the selection summary (e.g. custom hex from the wheel). */
  selectedHex?: string;
  onSelect: (id: WallQuickColorId) => void;
  labelFor: (id: WallQuickColorId) => string;
};

export function WallColorGrid({
  selectedId,
  selectedHex,
  onSelect,
  labelFor,
}: WallColorGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const rows = useMemo(() => chunk(WALL_QUICK_COLORS, COLS), []);

  const swatchSize = useMemo(() => {
    const layoutW = Math.min(GRID_MAX_W, windowWidth - CONFIGURE_PAD_X) - 28;
    const gapTotal = GAP * (COLS - 1);
    return Math.max(36, Math.floor((layoutW - gapTotal) / COLS) - RING * 2);
  }, [windowWidth]);

  const selectedEntry = useMemo(
    () => WALL_QUICK_COLORS.find((c) => c.id === selectedId),
    [selectedId]
  );

  const summaryHex =
    selectedId === "custom"
      ? selectedHex
      : selectedEntry?.hex ?? selectedHex;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          width: "100%",
          maxWidth: GRID_MAX_W,
          alignSelf: "center",
        },
        grid: {
          padding: 14,
          borderRadius: 18,
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
        },
        row: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: GAP,
          gap: GAP,
        },
        rowLast: {
          marginBottom: 0,
        },
        cell: {
          flex: 1,
          minWidth: 0,
          alignItems: "center",
        },
        cellPad: {
          flex: 1,
          minWidth: 0,
        },
        hit: {
          alignItems: "center",
          justifyContent: "center",
        },
        ring: {
          width: swatchSize + RING * 2,
          height: swatchSize + RING * 2,
          borderRadius: 9999,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: RING,
          borderColor: "transparent",
        },
        ringSelected: {
          borderColor: colors.primary,
          backgroundColor: isDark
            ? "rgba(115, 134, 86, 0.16)"
            : "rgba(115, 134, 86, 0.10)",
        },
        swatch: {
          width: swatchSize,
          height: swatchSize,
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
        checkBadge: {
          position: "absolute",
          right: -2,
          bottom: -2,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: colors.surfaceContainerLow,
        },
        rainbowOuter: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: 9999,
        },
        rainbowCenter: {
          width: Math.max(20, Math.floor(swatchSize * 0.48)),
          height: Math.max(20, Math.floor(swatchSize * 0.48)),
          borderRadius: 9999,
          backgroundColor: colors.surfaceContainerLowest,
          alignItems: "center",
          justifyContent: "center",
        },
        summary: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginTop: 12,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 14,
          backgroundColor: isDark
            ? "rgba(115, 134, 86, 0.14)"
            : "rgba(115, 134, 86, 0.08)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(115, 134, 86, 0.35)"
            : "rgba(115, 134, 86, 0.22)",
        },
        summarySwatch: {
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.2)"
            : "rgba(0,0,0,0.12)",
        },
        summaryTextCol: {
          flex: 1,
          minWidth: 0,
        },
        summaryLabel: {
          fontFamily: Manrope.semiBold,
          fontSize: 14,
          color: colors.onSurface,
        },
        summaryHex: {
          fontFamily: Manrope.medium,
          fontSize: 12,
          color: colors.onSurfaceVariant,
          marginTop: 2,
          letterSpacing: 0.4,
        },
      }),
    [colors, isDark, swatchSize]
  );

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View
            key={`row-${rowIndex}`}
            style={[styles.row, rowIndex === rows.length - 1 && styles.rowLast]}
          >
            {row.map((c) => {
              const isSelected = selectedId === c.id;
              const isWhite = c.hex?.toUpperCase() === "#FFFFFF";
              return (
                <View key={c.id} style={styles.cell}>
                  <Pressable
                    onPress={() => onSelect(c.id)}
                    style={({ pressed }) => [
                      styles.hit,
                      pressed && { opacity: 0.88 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={labelFor(c.id)}
                  >
                    <View style={[styles.ring, isSelected && styles.ringSelected]}>
                      {c.id === "custom" ? (
                        <View style={styles.swatch}>
                          <LinearGradient
                            colors={RAINBOW}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.rainbowOuter}
                          />
                          <View style={styles.rainbowCenter} pointerEvents="none">
                            <MaterialIcons
                              name="colorize"
                              size={Math.max(12, Math.floor(swatchSize * 0.32))}
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
                      {isSelected ? (
                        <View style={styles.checkBadge} pointerEvents="none">
                          <MaterialIcons
                            name="check"
                            size={11}
                            color={colors.onPrimary}
                          />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
            {row.length < COLS
              ? Array.from({ length: COLS - row.length }).map((_, i) => (
                  <View key={`pad-${rowIndex}-${i}`} style={styles.cellPad} />
                ))
              : null}
          </View>
        ))}
      </View>

      {selectedId ? (
        <View style={styles.summary} accessibilityLiveRegion="polite">
          <View
            style={[
              styles.summarySwatch,
              summaryHex
                ? { backgroundColor: summaryHex }
                : { backgroundColor: colors.surfaceContainer },
            ]}
          />
          <View style={styles.summaryTextCol}>
            <Text style={styles.summaryLabel} numberOfLines={1}>
              {labelFor(selectedId)}
            </Text>
            {summaryHex ? (
              <Text style={styles.summaryHex}>{summaryHex}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
