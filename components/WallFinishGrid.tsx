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
import type { WallStylePresetId } from "../constants/wallsDesign";
import { getWallStylePreviewSource } from "../constants/wallStylePreviews";
import { useTheme } from "../contexts/ThemeContext";
import { Manrope } from "../theme/curatedCanvas";

const COLS = 2;
const GAP = 12;
const GRID_MAX_W = 400;
const CONFIGURE_PAD_X = 48;
const PREVIEW_H = 88;

type WallFinishPreset = {
  id: WallStylePresetId;
  swatch: string;
};

type WallFinishGridProps = {
  presets: readonly WallFinishPreset[];
  selectedId: WallStylePresetId | undefined;
  onSelect: (id: WallStylePresetId) => void;
  labelFor: (id: WallStylePresetId) => string;
};

export function WallFinishGrid({
  presets,
  selectedId,
  onSelect,
  labelFor,
}: WallFinishGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  const cardWidth = useMemo(() => {
    const layoutW = Math.min(GRID_MAX_W, windowWidth - CONFIGURE_PAD_X);
    return Math.floor((layoutW - GAP * (COLS - 1)) / COLS);
  }, [windowWidth]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        grid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: GAP,
          width: "100%",
          maxWidth: GRID_MAX_W,
          alignSelf: "center",
        },
        card: {
          width: cardWidth,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: colors.surfaceContainerHigh,
          backgroundColor: colors.surfaceContainerLowest,
          overflow: "hidden",
        },
        cardSelected: {
          borderColor: colors.primary,
          backgroundColor: isDark
            ? "rgba(115, 134, 86, 0.16)"
            : "rgba(115, 134, 86, 0.08)",
        },
        previewWrap: {
          height: PREVIEW_H,
          width: "100%",
          backgroundColor: colors.surfaceContainer,
          position: "relative",
        },
        previewImage: {
          width: "100%",
          height: "100%",
        },
        swatchFallback: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        swatchCircle: {
          width: 52,
          height: 52,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.18)"
            : "rgba(0,0,0,0.12)",
        },
        body: {
          paddingHorizontal: 10,
          paddingVertical: 10,
          minHeight: 52,
          justifyContent: "center",
        },
        label: {
          fontFamily: Manrope.semiBold,
          fontSize: 13,
          lineHeight: 17,
          color: colors.onSurface,
          textAlign: "center",
        },
        labelSelected: {
          color: colors.primary,
        },
        checkBadge: {
          position: "absolute",
          top: 8,
          right: 8,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: colors.surfaceBright,
        },
      }),
    [cardWidth, colors, isDark]
  );

  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {presets.map((preset) => {
        const selected = selectedId === preset.id;
        const preview = getWallStylePreviewSource(preset.id);
        return (
          <Pressable
            key={preset.id}
            onPress={() => onSelect(preset.id)}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={labelFor(preset.id)}
          >
            <View style={styles.previewWrap}>
              {preview ? (
                <Image
                  source={preview}
                  style={styles.previewImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  fadeDuration={0}
                />
              ) : (
                <View style={styles.swatchFallback}>
                  <View
                    style={[
                      styles.swatchCircle,
                      { backgroundColor: preset.swatch },
                    ]}
                  />
                </View>
              )}
              {selected ? (
                <View style={styles.checkBadge} pointerEvents="none">
                  <MaterialIcons name="check" size={14} color={colors.onPrimary} />
                </View>
              ) : null}
            </View>
            <View style={styles.body}>
              <Text
                numberOfLines={2}
                style={[styles.label, selected && styles.labelSelected]}
              >
                {labelFor(preset.id)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
