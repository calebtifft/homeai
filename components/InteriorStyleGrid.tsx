import { useMemo } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { ExteriorStyleType } from "../constants/exteriorDesign";
import { EXTERIOR_STYLE_PREVIEW_SOURCE } from "../constants/exteriorStylePreviews";
import { INTERIOR_STYLE_PREVIEW_SOURCE } from "../constants/interiorStylePreviews";
import { useTheme } from "../contexts/ThemeContext";
import type { StyleType } from "../types";
import { Manrope } from "../theme/curatedCanvas";

function stylePreviewSource(styleKey: string) {
  if (Object.prototype.hasOwnProperty.call(INTERIOR_STYLE_PREVIEW_SOURCE, styleKey)) {
    return INTERIOR_STYLE_PREVIEW_SOURCE[styleKey as StyleType];
  }
  if (Object.prototype.hasOwnProperty.call(EXTERIOR_STYLE_PREVIEW_SOURCE, styleKey)) {
    return EXTERIOR_STYLE_PREVIEW_SOURCE[styleKey as ExteriorStyleType];
  }
  return undefined;
}

const COLS = 3;
/** Ring width — same for idle (transparent) and selected so layout does not shift. */
const RING = 3;
/** Horizontal gap between the three columns (see `row` style). */
const COL_GAP = 10;
/** Matches `ConfigureScreen` scroll horizontal padding (24 × 2). */
const CONFIGURE_PAD_X = 48;
/** Max content width used elsewhere on the configure step. */
const GRID_MAX_W = 400;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size) as T[]);
  }
  return out;
}

type InteriorStyleGridProps = {
  /** Style keys — interior/exterior catalog entries use preview images; others show a placeholder. */
  items: readonly string[];
  selected: string;
  onSelect: (style: string) => void;
  labelFor: (style: string) => string;
};

export function InteriorStyleGrid({
  items,
  selected,
  onSelect,
  labelFor,
}: InteriorStyleGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const rows = useMemo(() => chunk(items, COLS), [items]);

  /** As large as possible for 3 columns without shifting layout (idle === selected slot size). */
  const { tile: SLOT, photoSize: PHOTO_SIZE } = useMemo(() => {
    const layoutW = Math.min(GRID_MAX_W, windowWidth - CONFIGURE_PAD_X);
    const gapTotal = COL_GAP * (COLS - 1);
    let tile = Math.floor((layoutW - gapTotal) / COLS);
    let photoSize = tile - RING * 2;
    const minPhoto = 80;
    if (photoSize < minPhoto) {
      photoSize = minPhoto;
      tile = photoSize + RING * 2;
    }
    return { tile, photoSize };
  }, [windowWidth]);

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
          marginBottom: 18,
          gap: COL_GAP,
        },
        cell: {
          flex: 1,
          minWidth: 0,
          alignItems: "center",
        },
        slotOuter: {
          position: "relative",
          width: SLOT,
          height: SLOT,
          borderRadius: SLOT / 2,
          borderWidth: RING,
          borderColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
        },
        slotOuterSelected: {
          borderColor: colors.primary,
          backgroundColor: isDark
            ? "rgba(115, 134, 86, 0.14)"
            : "rgba(115, 134, 86, 0.08)",
        },
        photoClip: {
          width: PHOTO_SIZE,
          height: PHOTO_SIZE,
          borderRadius: PHOTO_SIZE / 2,
          overflow: "hidden",
          backgroundColor: "transparent",
        },
        photo: {
          width: PHOTO_SIZE,
          height: PHOTO_SIZE,
        },
        checkBadge: {
          position: "absolute",
          bottom: 2,
          right: 2,
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: colors.surface,
        },
        label: {
          marginTop: 10,
          fontFamily: Manrope.semiBold,
          fontSize: 13,
          letterSpacing: -0.1,
          textAlign: "center",
          color: colors.onSurface,
        },
        labelSelected: {
          color: colors.primary,
        },
      }),
    [PHOTO_SIZE, SLOT, colors, isDark]
  );

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((styleType) => (
            <Pressable
              key={styleType}
              onPress={() => onSelect(styleType)}
              style={({ pressed }) => [
                styles.cell,
                pressed && { opacity: 0.92 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === styleType }}
              accessibilityLabel={labelFor(styleType)}
            >
              <View
                style={[
                  styles.slotOuter,
                  selected === styleType && styles.slotOuterSelected,
                ]}
              >
                <View style={styles.photoClip}>
                  {stylePreviewSource(styleType) ? (
                    <Image
                      source={stylePreviewSource(styleType)}
                      style={styles.photo}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                      fadeDuration={0}
                    />
                  ) : (
                    <View
                      style={[
                        styles.photo,
                        {
                          backgroundColor: colors.surfaceContainerHigh,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <MaterialIcons
                        name="landscape"
                        size={Math.max(28, Math.floor(PHOTO_SIZE * 0.38))}
                        color={colors.primary}
                      />
                    </View>
                  )}
                </View>
                {selected === styleType ? (
                  <View style={styles.checkBadge} pointerEvents="none">
                    <MaterialIcons name="check" size={16} color={colors.onPrimary} />
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.label,
                  selected === styleType && styles.labelSelected,
                ]}
                numberOfLines={2}
              >
                {labelFor(styleType)}
              </Text>
            </Pressable>
          ))}
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
