import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import wallsHeroFallback from "../assets/wall.jpg";
import {
  EXTERIOR_STYLES,
  type ExteriorStyleType,
} from "../constants/exteriorDesign";
import { EXTERIOR_STYLE_PREVIEW_SOURCE } from "../constants/exteriorStylePreviews";
import { INTERIOR_STYLE_PREVIEW_SOURCE } from "../constants/interiorStylePreviews";
import { getWallStylePreviewSource } from "../constants/wallStylePreviews";
import {
  wallPresetsForTreatment,
  type WallStylePresetId,
  type WallTreatmentType,
} from "../constants/wallsDesign";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { EXTERIOR_STYLE_LABEL_KEY } from "../locales/exteriorDesignKeys";
import { STYLE_LABEL_KEY } from "../locales/roomStyleKeys";
import { WALL_PRESET_LABEL_KEY } from "../locales/wallsKeys";
import type { StringKey } from "../locales/strings";
import type { RootStackParamList, StyleType } from "../types";
import { Manrope } from "../theme/curatedCanvas";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

type ExploreMode = "interior" | "exterior" | "walls";

const WALL_EXPLORE_TREATMENTS: WallTreatmentType[] = [
  "Paint",
  "Wallpaper",
  "Wood Paneling",
  "Tile",
  "Mural",
];

export type HomeExploreSectionProps = {
  navigation: Nav;
};

export function HomeExploreSection({ navigation }: HomeExploreSectionProps) {
  const { t } = useLanguage();
  const { colors, typography, ambientShadow } = useTheme();
  const [mode, setMode] = useState<ExploreMode>("interior");

  const interiorStyles = useMemo(
    () => Object.keys(INTERIOR_STYLE_PREVIEW_SOURCE) as StyleType[],
    []
  );

  const wallExploreItems = useMemo(() => {
    const items: { treatment: WallTreatmentType; presetId: WallStylePresetId }[] = [];
    for (const treatment of WALL_EXPLORE_TREATMENTS) {
      const preset = wallPresetsForTreatment(treatment)[0];
      if (!preset) continue;
      items.push({
        treatment,
        presetId: preset.id,
      });
    }
    return items;
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          width: "100%",
          marginBottom: 28,
        },
        title: {
          marginBottom: 6,
        },
        subtitle: {
          marginBottom: 16,
        },
        segment: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 18,
          padding: 4,
          borderRadius: 999,
          alignSelf: "flex-start",
          backgroundColor: colors.surfaceContainerLow,
        },
        segBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
        },
        segBtnActive: {
          backgroundColor: colors.primary,
        },
        segLabel: {
          fontFamily: Manrope.semiBold,
          fontSize: 14,
          color: colors.onSurfaceVariant,
        },
        segLabelActive: {
          color: colors.onPrimary,
        },
        grid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 14,
        },
        cell: {
          width: "47%",
        },
        card: {
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: colors.surfaceContainerLowest,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
        },
        imageWrap: {
          aspectRatio: 4 / 5,
          width: "100%",
          position: "relative",
          backgroundColor: colors.surfaceContainer,
        },
        img: {
          width: "100%",
          height: "100%",
        },
        gradient: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "48%",
        },
        labelWrap: {
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 10,
        },
        label: {
          fontFamily: Manrope.bold,
          fontSize: 15,
          color: "#ffffff",
        },
        hint: {
          marginTop: 18,
          fontFamily: Manrope.medium,
          fontSize: 13,
          lineHeight: 19,
          opacity: 0.72,
        },
      }),
    [colors]
  );

  const openInteriorPreset = (style: StyleType) => {
    navigation.navigate({
      name: "Configure",
      merge: false,
      params: {
        designMode: "interior",
        presetRoomType: "Living Room",
        presetStyle: style,
      },
    });
  };

  const openExteriorPreset = (style: ExteriorStyleType) => {
    navigation.navigate({
      name: "Configure",
      merge: false,
      params: {
        designMode: "exterior",
        presetExteriorScene: "Front Facade",
        presetExteriorStyle: style,
      },
    });
  };

  const openWallsPreset = (
    treatment: WallTreatmentType,
    presetId: WallStylePresetId
  ) => {
    navigation.navigate({
      name: "Configure",
      merge: false,
      params: {
        designMode: "walls",
        presetWallTreatment: treatment,
        presetWallStyle: presetId,
      },
    });
  };

  const hintKey: StringKey =
    mode === "walls" ? "explore.wallsHint" : "explore.hint";

  return (
    <View style={styles.section}>
      <Text style={[typography.headline, styles.title]}>{t("explore.title")}</Text>
      <Text style={[typography.bodySm, styles.subtitle]}>{t("explore.subtitle")}</Text>

      <View style={styles.segment}>
        <Pressable
          onPress={() => setMode("interior")}
          style={[styles.segBtn, mode === "interior" && styles.segBtnActive]}
        >
          <Text style={[styles.segLabel, mode === "interior" && styles.segLabelActive]}>
            {t("explore.tabInterior")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("exterior")}
          style={[styles.segBtn, mode === "exterior" && styles.segBtnActive]}
        >
          <Text style={[styles.segLabel, mode === "exterior" && styles.segLabelActive]}>
            {t("explore.tabExterior")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("walls")}
          style={[styles.segBtn, mode === "walls" && styles.segBtnActive]}
        >
          <Text style={[styles.segLabel, mode === "walls" && styles.segLabelActive]}>
            {t("explore.tabWalls")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {mode === "interior"
          ? interiorStyles.map((style) => (
            <View key={style} style={styles.cell}>
              <Pressable
                onPress={() => openInteriorPreset(style)}
                style={({ pressed }) => [
                  styles.card,
                  ambientShadow,
                  pressed && { opacity: 0.92 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t(STYLE_LABEL_KEY[style])}
              >
                <View style={styles.imageWrap}>
                  <Image
                    source={INTERIOR_STYLE_PREVIEW_SOURCE[style]}
                    style={styles.img}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.78)"]}
                    style={styles.gradient}
                    pointerEvents="none"
                  />
                  <View style={styles.labelWrap}>
                    <Text style={styles.label} numberOfLines={2}>
                      {t(STYLE_LABEL_KEY[style])}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>
          ))
          : mode === "exterior"
            ? EXTERIOR_STYLES.map((style) => (
              <View key={style} style={styles.cell}>
                <Pressable
                  onPress={() => openExteriorPreset(style)}
                  style={({ pressed }) => [
                    styles.card,
                    ambientShadow,
                    pressed && { opacity: 0.92 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t(EXTERIOR_STYLE_LABEL_KEY[style])}
                >
                  <View style={styles.imageWrap}>
                    <Image
                      source={EXTERIOR_STYLE_PREVIEW_SOURCE[style]}
                      style={styles.img}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.78)"]}
                      style={styles.gradient}
                      pointerEvents="none"
                    />
                    <View style={styles.labelWrap}>
                      <Text style={styles.label} numberOfLines={2}>
                        {t(EXTERIOR_STYLE_LABEL_KEY[style])}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            ))
            : wallExploreItems.map((item) => (
              <View key={item.presetId} style={styles.cell}>
                <Pressable
                  onPress={() => openWallsPreset(item.treatment, item.presetId)}
                  style={({ pressed }) => [
                    styles.card,
                    ambientShadow,
                    pressed && { opacity: 0.92 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t(WALL_PRESET_LABEL_KEY[item.presetId])}
                >
                  <View style={styles.imageWrap}>
                    <Image
                      source={
                        getWallStylePreviewSource(item.presetId) ?? wallsHeroFallback
                      }
                      style={styles.img}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.78)"]}
                      style={styles.gradient}
                      pointerEvents="none"
                    />
                    <View style={styles.labelWrap}>
                      <Text style={styles.label} numberOfLines={2}>
                        {t(WALL_PRESET_LABEL_KEY[item.presetId])}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            ))}
      </View>

      <Text style={[typography.bodySm, styles.hint]}>{t(hintKey)}</Text>
    </View>
  );
}
