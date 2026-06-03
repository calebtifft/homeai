import { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ImageStyle } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import {
  EXTERIOR_SCENE_LABEL_KEY,
  EXTERIOR_STYLE_LABEL_KEY,
} from "../locales/exteriorDesignKeys";
import { ROOM_TYPE_LABEL_KEY, STYLE_LABEL_KEY } from "../locales/roomStyleKeys";
import {
  WALL_PRESET_LABEL_KEY,
  WALL_TREATMENT_LABEL_KEY,
} from "../locales/wallsKeys";
import {
  dedupePendingForDisplay,
  historyItemReactKey,
  historyItemStableFingerprint,
  isHistoryItemPending,
  type HistoryItem,
} from "../services/history";
import type { RootStackParamList } from "../types";
import { Manrope, radius } from "../theme/curatedCanvas";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

export type HomeGallerySectionProps = {
  navigation: Nav;
  items: HistoryItem[];
  getImageSource: (id: string, uri: string) => { uri: string };
  loading?: boolean;
  loadFailed?: boolean;
};

type GalleryCardProps = {
  item: HistoryItem;
  title: string;
  subtitle: string;
  imageSource: { uri: string };
  processingText: string;
  stagingInProgressA11y: string;
  navigation: Nav;
  styles: ReturnType<typeof StyleSheet.create>;
  ambientShadow: object;
};

const GalleryCard = memo(
  function GalleryCard({
    item,
    title,
    subtitle,
    imageSource,
    processingText,
    stagingInProgressA11y,
    navigation,
    styles,
    ambientShadow,
  }: GalleryCardProps) {
    const isPending = isHistoryItemPending(item);
    return (
      <View style={styles.cell}>
        <View style={[styles.cardShell, ambientShadow]}>
          <View style={styles.card}>
            <View style={styles.imageWrap}>
              {isPending ? (
                <View
                  style={styles.tapArea}
                  accessibilityRole="text"
                  accessibilityLabel={stagingInProgressA11y}
                  accessible
                >
                  <Image
                    key={`${item.id}:${imageSource.uri}`}
                    source={imageSource}
                    style={styles.image as ImageStyle}
                    resizeMode="cover"
                    fadeDuration={0}
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.72)"]}
                    style={styles.gradient}
                    pointerEvents="none"
                  />
                  <View style={styles.copy} pointerEvents="none">
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  </View>
                  <View style={styles.pendingOverlay} pointerEvents="auto">
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.pendingText}>{processingText}</Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() =>
                    navigation.navigate("HistoryDetail", {
                      imageUrl: item.imageUrl,
                      originalUri: item.originalUri,
                      sourceUri: item.sourceUri,
                      sessionFolder: item.sessionFolder,
                      designMode: item.designMode,
                      roomType: item.roomType,
                      style: item.style,
                      exteriorSceneType: item.exteriorSceneType,
                      exteriorStyle: item.exteriorStyle,
                      wallTreatment: item.wallTreatment,
                      wallStyle: item.wallStyle,
                      wallColorHex: item.wallColorHex,
                      wallCustomPrompt: item.wallCustomPrompt,
                      paletteId: item.paletteId,
                      createdAt: item.createdAt,
                    })
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.tapArea,
                    pressed && { opacity: 0.94 },
                  ]}
                >
                  <Image
                    key={`${item.id}:${imageSource.uri}`}
                    source={imageSource}
                    style={styles.image as ImageStyle}
                    resizeMode="cover"
                    fadeDuration={0}
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.72)"]}
                    style={styles.gradient}
                    pointerEvents="none"
                  />
                  <View style={styles.copy}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.title === next.title &&
    prev.subtitle === next.subtitle &&
    prev.imageSource.uri === next.imageSource.uri &&
    prev.processingText === next.processingText &&
    historyItemStableFingerprint(prev.item) === historyItemStableFingerprint(next.item)
);

export function HomeGallerySection({
  navigation,
  items,
  getImageSource,
  loading = false,
  loadFailed = false,
}: HomeGallerySectionProps) {
  const { t } = useLanguage();
  const { colors, typography, ambientShadow, ghostBorder } = useTheme();
  const [filter, setFilter] = useState<"all" | "interior" | "exterior" | "walls">(
    "all"
  );

  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? items
        : items.filter((x) => (x.designMode ?? "interior") === filter);
    return dedupePendingForDisplay(base);
  }, [items, filter]);

  const processingText = t("processing.title");
  const stagingInProgressA11y = t("history.stagingInProgressA11y");

  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          width: "100%",
          marginBottom: 28,
        },
        header: {
          marginBottom: 14,
        },
        title: {
          marginBottom: 6,
        },
        subtitle: {
          marginBottom: 14,
        },
        filterTrack: {
          alignSelf: "stretch",
          flexDirection: "row",
          gap: 4,
          borderRadius: radius.full,
          padding: 4,
          marginBottom: 18,
          backgroundColor: colors.surfaceContainer,
          ...ghostBorder,
        },
        filterSegment: {
          flex: 1,
          minWidth: 0,
          height: 36,
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 6,
          backgroundColor: "transparent",
        },
        filterSegmentActive: {
          backgroundColor: colors.primary,
        },
        filterSegmentPressed: {
          opacity: 0.88,
        },
        filterSegmentText: {
          fontFamily: Manrope.semiBold,
          fontSize: 13,
          letterSpacing: 0.1,
          color: colors.onSurfaceVariant,
          textAlign: "center",
        },
        filterSegmentTextActive: {
          color: colors.onPrimary,
        },
        grid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 16,
        },
        cell: {
          width: "47%",
        },
        cardShell: {
          borderRadius: 16,
          overflow: "hidden",
        },
        card: {
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: colors.surfaceContainerLowest,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
        },
        imageWrap: {
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: colors.surfaceContainerHigh,
          aspectRatio: 4 / 5,
          position: "relative",
        },
        tapArea: {
          ...StyleSheet.absoluteFillObject,
        },
        image: {
          width: "100%",
          height: "100%",
        },
        gradient: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "52%",
        },
        copy: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 12,
          paddingBottom: 10,
          paddingTop: 24,
        },
        cardTitle: {
          fontFamily: Manrope.bold,
          fontSize: 18,
          color: "#ffffff",
        },
        cardSub: {
          fontFamily: Manrope.medium,
          fontSize: 14,
          color: "rgba(255,255,255,0.92)",
        },
        pendingOverlay: {
          ...StyleSheet.absoluteFillObject,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.34)",
          gap: 8,
        },
        pendingText: {
          fontFamily: Manrope.bold,
          fontSize: 14,
          color: "#ffffff",
        },
        empty: {
          opacity: 0.75,
        },
        loadingBlock: {
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 48,
          paddingHorizontal: 12,
          gap: 16,
        },
        loadingCaption: {
          textAlign: "center",
          opacity: 0.82,
          maxWidth: 320,
        },
      }),
    [colors, ghostBorder]
  );

  const chips = useMemo(
    () =>
      [
        { key: "all" as const, label: t("gallery.filterAll") },
        { key: "interior" as const, label: t("gallery.filterInterior") },
        { key: "exterior" as const, label: t("gallery.filterExterior") },
        { key: "walls" as const, label: t("gallery.filterWalls") },
      ] as const,
    [t]
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[typography.headline, styles.title]}>{t("gallery.title")}</Text>
        <Text style={[typography.bodySm, styles.subtitle]}>{t("gallery.subtitle")}</Text>
      </View>

      <View style={styles.filterTrack} accessibilityRole="tablist">
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.filterSegment,
                active && styles.filterSegmentActive,
                pressed && styles.filterSegmentPressed,
              ]}
            >
              <Text
                style={[styles.filterSegmentText, active && styles.filterSegmentTextActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[typography.body, styles.loadingCaption]}>{t("history.loadingBody")}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <Text style={[typography.body, styles.empty]}>
          {loadFailed ? t("history.loadFailedBody") : t("gallery.empty")}
        </Text>
      ) : (
        <View style={styles.grid}>
          {filtered.map((item) => {
            const isExterior = item.designMode === "exterior";
            const isWalls = item.designMode === "walls";
            const title = isWalls
              ? item.wallStyle
                ? t(WALL_PRESET_LABEL_KEY[item.wallStyle])
                : t("result.metaFinish")
              : isExterior
                ? item.exteriorStyle
                  ? t(EXTERIOR_STYLE_LABEL_KEY[item.exteriorStyle])
                  : t("result.metaStyle")
                : item.style
                  ? t(STYLE_LABEL_KEY[item.style])
                  : t("result.metaStyle");
            const subtitle = isWalls
              ? item.wallTreatment
                ? t(WALL_TREATMENT_LABEL_KEY[item.wallTreatment])
                : t("result.metaTreatment")
              : isExterior
                ? item.exteriorSceneType
                  ? t(EXTERIOR_SCENE_LABEL_KEY[item.exteriorSceneType])
                  : t("result.metaScene")
                : item.roomType
                  ? t(ROOM_TYPE_LABEL_KEY[item.roomType])
                  : t("result.metaRoom");
            return (
              <GalleryCard
                key={historyItemReactKey(item)}
                item={item}
                title={title}
                subtitle={subtitle}
                imageSource={getImageSource(item.id, item.imageUrl)}
                processingText={processingText}
                stagingInProgressA11y={stagingInProgressA11y}
                navigation={navigation}
                styles={styles}
                ambientShadow={ambientShadow}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}
