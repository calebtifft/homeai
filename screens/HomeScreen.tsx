import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import interiorDesignCardImage from "../assets/interior-design.jpg";
import exteriorDesignCardImage from "../assets/exterior-design.jpg";
import wallsDesignCardImage from "../assets/wall.jpg";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
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
  deleteHistoryItem,
  HISTORY_LIST_MEMORY_CACHE_MS,
  isHistoryItemPending,
  dedupePendingForDisplay,
  historyItemReactKey,
  mergeHistoryListState,
  listHistoryItems,
  type HistoryItem,
} from "../services/history";
import { FreeStagingUsageBadge } from "../components/FreeStagingUsageBadge";
import { HomeExploreSection } from "../components/HomeExploreSection";
import { HomeGallerySection } from "../components/HomeGallerySection";
import type { RootStackParamList } from "../types";
import { Manrope, radius } from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;
type BottomTabKey = "home" | "gallery" | "history" | "explore";

function canonicalImageKey(uri: string | undefined): string {
  if (!uri) return "";
  return uri.trim().replace(/[?#].*$/, "");
}

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);
  const [recentHistoryLoading, setRecentHistoryLoading] = useState(false);
  const [recentHistoryError, setRecentHistoryError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  type HomeDesignMode = "interior" | "exterior" | "walls";
  const [activeDesignMode, setActiveDesignMode] = useState<HomeDesignMode>(
    "interior"
  );
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTabKey>("home");
  const homeScrollRef = useRef<ScrollView | null>(null);
  const homeScrollYRef = useRef(0);
  const recentHistoryRef = useRef<HistoryItem[]>([]);
  const lastHistoryFetchedAtRef = useRef(0);
  const activeBottomTabRef = useRef<BottomTabKey>("home");
  const imageSourceCacheRef = useRef<Record<string, { uri: string }>>({});
  const designCardOffsetsRef = useRef<Record<HomeDesignMode, number>>({
    interior: 0,
    exterior: 0,
    walls: 0,
  });
  const { colors, typography, isDark, ambientShadow, ghostBorder, primaryOverlay: po } =
    useTheme();
  const designCards = useMemo(
    () => [
      {
        key: "interior" as const,
        title: t("home.ctaInteriorTitle"),
        subtitle: t("home.ctaInteriorMeta"),
        image: interiorDesignCardImage,
      },
      {
        key: "exterior" as const,
        title: t("home.ctaExteriorTitle"),
        subtitle: t("home.ctaExteriorMeta"),
        image: exteriorDesignCardImage,
      },
      {
        key: "walls" as const,
        title: t("home.ctaWallsTitle"),
        subtitle: t("home.ctaWallsMeta"),
        image: wallsDesignCardImage,
      },
    ],
    [t]
  );

  const bottomTabs = useMemo(
    () =>
      [
        {
          key: "home" as const,
          icon: "home" as const,
          label: t("home.tabHome"),
          active: activeBottomTab === "home",
        },
        {
          key: "gallery" as const,
          icon: "collections" as const,
          label: t("home.tabGallery"),
          active: activeBottomTab === "gallery",
        },
        {
          key: "history" as const,
          icon: "history" as const,
          label: t("home.tabHistory"),
          active: activeBottomTab === "history",
        },
        {
          key: "explore" as const,
          icon: "explore" as const,
          label: t("home.tabExplore"),
          active: activeBottomTab === "explore",
        },
      ] as const,
    [activeBottomTab, t]
  );

  const recentStaged = useMemo(() => {
    return recentHistory.slice(0, 2).map((item, index) => {
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
      return {
        id: item.id,
        title,
        subtitle,
        image: item.imageUrl,
        originalUri: item.originalUri,
        status: item.status ?? "completed",
        designMode: item.designMode,
        roomType: item.roomType,
        style: item.style,
        exteriorSceneType: item.exteriorSceneType,
        exteriorStyle: item.exteriorStyle,
        wallTreatment: item.wallTreatment,
        wallStyle: item.wallStyle,
        createdAt: item.createdAt,
        stagger: index % 2 === 1,
      };
    });
  }, [recentHistory, t]);
  const isHistoryPage = activeBottomTab === "history";
  const isHomeTab = activeBottomTab === "home";
  const isGalleryPage = activeBottomTab === "gallery";
  const isExplorePage = activeBottomTab === "explore";

  useEffect(() => {
    activeBottomTabRef.current = activeBottomTab;
  }, [activeBottomTab]);

  const shouldSkipHistoryTabFetch = useCallback((force?: boolean) => {
    if (force) return false;
    const current = recentHistoryRef.current;
    if (current.length === 0) return false;
    if (current.some((item) => item.status === "pending")) return false;
    return Date.now() - lastHistoryFetchedAtRef.current < HISTORY_LIST_MEMORY_CACHE_MS;
  }, []);

  const loadRecentHistory = useCallback(
    async (opts?: { preferSilent?: boolean; force?: boolean; localOnly?: boolean }) => {
      const force = Boolean(opts?.force);
      const localOnly = Boolean(opts?.localOnly);
      if (!localOnly && shouldSkipHistoryTabFetch(force)) return;

      const preferSilent = Boolean(opts?.preferSilent);
      const hasCached = recentHistoryRef.current.length > 0;
      const tab = activeBottomTabRef.current;
      const showFullBleedLoader =
        !preferSilent &&
        !hasCached &&
        !localOnly &&
        (tab === "history" || tab === "gallery");
      let safetyTimer: ReturnType<typeof setTimeout> | undefined;
      if (showFullBleedLoader) {
        setRecentHistoryLoading(true);
        setRecentHistoryError(null);
        safetyTimer = setTimeout(() => setRecentHistoryLoading(false), 45_000);
      }
      try {
        const items = await listHistoryItems(
          localOnly ? { localOnly: true } : { force }
        );
        const displayItems = dedupePendingForDisplay(items);
        setRecentHistory((prev) => mergeHistoryListState(prev, displayItems));
        setRecentHistoryError(null);
        lastHistoryFetchedAtRef.current = Date.now();
      } catch {
        if (showFullBleedLoader) {
          setRecentHistory([]);
          setRecentHistoryError("failed");
        }
      } finally {
        if (safetyTimer) clearTimeout(safetyTimer);
        if (showFullBleedLoader) {
          setRecentHistoryLoading(false);
        }
      }
    },
    [shouldSkipHistoryTabFetch]
  );

  useEffect(() => {
    recentHistoryRef.current = recentHistory;
  }, [recentHistory]);

  useEffect(() => {
    void loadRecentHistory();
  }, [loadRecentHistory]);

  useFocusEffect(
    useCallback(() => {
      const hasItems = recentHistoryRef.current.length > 0;
      const hasPending = recentHistoryRef.current.some((item) => item.status === "pending");
      if (!hasItems || hasPending) {
        void loadRecentHistory({
          preferSilent: hasItems,
          localOnly: hasPending,
          force: hasPending ? false : undefined,
        });
      }
    }, [loadRecentHistory])
  );

  useEffect(() => {
    if (activeBottomTab !== "history" && activeBottomTab !== "gallery") return;
    const hasItems = recentHistoryRef.current.length > 0;
    const hasPending = recentHistoryRef.current.some((item) => item.status === "pending");
    void loadRecentHistory({
      preferSilent: hasItems,
      localOnly: hasPending,
      force: hasPending ? false : undefined,
    });
  }, [activeBottomTab, loadRecentHistory]);
  const getImageSource = useCallback((id: string, uri: string) => {
    const existing = imageSourceCacheRef.current[id];
    if (existing && existing.uri === uri) return existing;
    const next = { uri };
    imageSourceCacheRef.current[id] = next;
    return next;
  }, []);

  const handleHistoryDelete = useCallback(
    (item: HistoryItem) => {
      if (deletingIds[item.id]) return;
      Alert.alert(t("history.deleteTitle"), t("history.deleteMessage"), [
        { text: t("configure.back"), style: "cancel" },
        {
          text: t("history.deleteConfirm"),
          style: "destructive",
          onPress: () => {
            setDeletingIds((prev) => ({ ...prev, [item.id]: true }));
            delete imageSourceCacheRef.current[item.id];
            setRecentHistory((prev) =>
              prev.filter((x) => {
                if (x.id === item.id) return false;
                const left = canonicalImageKey(x.sourceUri || x.imageUrl);
                const right = canonicalImageKey(item.sourceUri || item.imageUrl);
                return !(left && right && left === right);
              })
            );
            void (async () => {
              try {
                await deleteHistoryItem(item);
              } catch {
                Alert.alert(t("history.deleteFailedTitle"), t("history.deleteFailedBody"));
              } finally {
                setDeletingIds((prev) => {
                  const next = { ...prev };
                  delete next[item.id];
                  return next;
                });
                await loadRecentHistory({ force: true });
              }
            })();
          },
        },
      ]);
    },
    [deletingIds, loadRecentHistory, t]
  );

  const hasPendingHistory = useMemo(
    () => recentHistory.some((item) => item.status === "pending"),
    [recentHistory]
  );

  const hadPendingHistoryRef = useRef(false);

  useEffect(() => {
    if (!hasPendingHistory) return;
    const id = setInterval(() => {
      void loadRecentHistory({ preferSilent: true, localOnly: true });
    }, 1800);
    return () => clearInterval(id);
  }, [hasPendingHistory, loadRecentHistory]);

  useEffect(() => {
    if (hadPendingHistoryRef.current && !hasPendingHistory) {
      void loadRecentHistory({ preferSilent: true, force: true });
    }
    hadPendingHistoryRef.current = hasPendingHistory;
  }, [hasPendingHistory, loadRecentHistory]);

  const premiumCardShadow = useMemo(
    () =>
      Platform.select({
        ios: {
          shadowColor: isDark ? "#000000" : "#5f6d47",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.32 : 0.1,
          shadowRadius: 20,
        },
        android: { elevation: isDark ? 10 : 6 },
        default: {},
      }) ?? {},
    [isDark]
  );

  const styles = useMemo(() => {
    return StyleSheet.create({
      root: {
        flex: 1,
        backgroundColor: colors.surface,
      },
      safeTop: {
        zIndex: 10,
      },
      headerBlur: {
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(177, 177, 188, 0.12)",
      },
      headerInner: {
        position: "relative",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 24,
        paddingVertical: 10,
        maxWidth: 448,
        width: "100%",
        alignSelf: "center",
      },
      headerTitleCenter: {
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      },
      headerRight: {
        flexShrink: 0,
        marginLeft: 8,
        zIndex: 1,
      },
      headerIconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: po.o20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceContainerLow,
      },
      headerIconPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.95 }],
      },
      headerTitle: {
        fontFamily: Manrope.bold,
        fontSize: 22,
        letterSpacing: -0.3,
        color: colors.onSurface,
      },
      scroll: {
        flex: 1,
      },
      scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 12,
        maxWidth: 448,
        width: "100%",
        alignSelf: "center",
      },
      tabHidden: {
        display: "none",
      },
      stickyTabsWrap: {
        backgroundColor: colors.surface,
        width: "100%",
        maxWidth: 448,
        alignSelf: "center",
        paddingTop: 6,
        paddingBottom: 14,
        paddingHorizontal: 24,
        zIndex: 4,
      },
      designTab: {
        flex: 1,
        paddingHorizontal: 16,
        height: 34,
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
      },
      designTabActive: {
        backgroundColor: colors.primary,
      },
      designTabText: {
        fontFamily: Manrope.semiBold,
        fontSize: 14,
        color: colors.onSurfaceVariant,
      },
      designTabTextActive: {
        color: colors.onPrimary,
      },
      designTabsRow: {
        alignSelf: "stretch",
        flexDirection: "row",
        gap: 6,
        borderRadius: radius.full,
        padding: 4,
        backgroundColor: colors.surfaceContainerLow,
      },
      designCard: {
        width: "100%",
        borderRadius: 18,
        backgroundColor: colors.surfaceContainerLowest,
        marginBottom: 18,
        overflow: "hidden",
      },
      designCardPressed: {
        transform: [{ scale: 0.99 }],
      },
      designCardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 8,
        minHeight: 72,
      },
      designCardTitle: {
        fontFamily: Manrope.bold,
        fontSize: 20,
        color: colors.onSurface,
      },
      designCardSubtitle: {
        marginTop: 2,
        fontSize: 14,
        lineHeight: 20,
        maxWidth: "92%",
      },
      designArrow: {
        marginTop: 2,
      },
      designImage: {
        width: "100%",
        height: "100%",
      },
      designImageFrame: {
        width: "100%",
        aspectRatio: 16 / 9,
        backgroundColor: colors.surfaceContainer,
        overflow: "hidden",
      },
      recentSection: {
        width: "100%",
        marginBottom: 36,
      },
      historyLoadingBlock: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 56,
        paddingHorizontal: 16,
        gap: 16,
      },
      historyLoadingCaption: {
        textAlign: "center",
        opacity: 0.82,
        maxWidth: 320,
      },
      recentHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginBottom: 22,
      },
      historyPageTitle: {
        marginBottom: 6,
      },
      historyPageSubtitle: {
        marginBottom: 18,
      },
      homeHistoryCardShell: {
        width: "100%",
        borderRadius: 16,
      },
      homeHistoryCard: {
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: colors.surfaceContainerLowest,
        borderWidth: 1,
        borderColor: colors.surfaceContainerHigh,
      },
      historyImageTapArea: {
        ...StyleSheet.absoluteFillObject,
      },
      historyDeleteFloating: {
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 6,
        elevation: 6,
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isDark ? "rgba(0,0,0,0.52)" : "rgba(0,0,0,0.4)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.28)",
      },
      recentTitle: {
        fontFamily: Manrope.bold,
        fontSize: 12,
        letterSpacing: 3.2,
        textTransform: "uppercase",
        color: colors.onSurface,
        opacity: 0.85,
      },
      viewAll: {
        fontFamily: Manrope.bold,
        fontSize: 11,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: colors.primary,
      },
      recentGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 16,
      },
      historyGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 16,
      },
      recentCell: {
        width: "47%",
      },
      recentStagger: {
        marginTop: 28,
      },
      recentImageWrap: {
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: colors.surfaceContainerHigh,
        aspectRatio: 4 / 5,
      },
      historyImageWrap: {
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: colors.surfaceContainerHigh,
        aspectRatio: 4 / 5,
        position: "relative",
      },
      recentImage: {
        width: "100%",
        height: "100%",
      },
      historyImageGradient: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "52%",
      },
      historyImageCopy: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 12,
        paddingBottom: 10,
        paddingTop: 24,
      },
      historyPendingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.34)",
        gap: 8,
      },
      historyPendingText: {
        fontFamily: Manrope.bold,
        fontSize: 16,
        color: "#ffffff",
      },
      historyCardTitle: {
        fontFamily: Manrope.bold,
        fontSize: 18,
        color: "#ffffff",
      },
      historyCardSub: {
        fontFamily: Manrope.medium,
        fontSize: 14,
        color: "rgba(255,255,255,0.92)",
      },
      recentCopy: {
        paddingHorizontal: 4,
        paddingTop: 12,
        gap: 4,
      },
      recentCardTitle: {
        fontFamily: Manrope.bold,
        fontSize: 16,
        color: colors.onSurface,
      },
      recentCardSub: {
        fontFamily: Manrope.medium,
        fontSize: 14,
        color: colors.onSurfaceVariant,
      },
      visionWrap: {
        marginBottom: 16,
        borderRadius: 28,
        overflow: "hidden",
        ...ambientShadow,
      },
      visionCard: {
        paddingVertical: 36,
        paddingHorizontal: 28,
        borderRadius: 28,
        overflow: "hidden",
        position: "relative",
      },
      visionGlow: {
        position: "absolute",
        bottom: -72,
        right: -72,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: "rgba(195, 210, 175, 0.35)",
      },
      visionWater: {
        position: "absolute",
        right: "-8%",
        top: "8%",
        pointerEvents: "none",
      },
      visionContent: {
        maxWidth: "72%",
        zIndex: 2,
      },
      visionPill: {
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.full,
        backgroundColor: "rgba(255,255,255,0.2)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        marginBottom: 18,
      },
      visionPillText: {
        fontFamily: Manrope.bold,
        fontSize: 10,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#fafaf8",
      },
      visionHeadline: {
        fontFamily: Manrope.bold,
        fontSize: 24,
        lineHeight: 30,
        color: "#fafaf8",
        marginBottom: 10,
      },
      visionBody: {
        fontFamily: Manrope.medium,
        fontSize: 14,
        lineHeight: 22,
        color: "rgba(250, 250, 248, 0.82)",
      },
      exploreBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "flex-start",
        marginTop: 22,
        backgroundColor: isDark ? "#f4f5f0" : colors.surfaceContainerLowest,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: radius.full,
      },
      exploreBtnText: {
        fontFamily: Manrope.bold,
        fontSize: 14,
        color: colors.primary,
      },
      tabBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        minHeight: 72,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: isDark
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(177, 177, 188, 0.12)",
        overflow: "hidden",
        backgroundColor: isDark
          ? "rgba(22, 24, 18, 0.92)"
          : "rgba(255,255,255,0.65)",
      },
      tabBarInner: {
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        paddingTop: 10,
        paddingHorizontal: 8,
      },
      tabItem: {
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        minWidth: 64,
      },
      tabItemActive: {
        backgroundColor: po.o08,
      },
      tabLabel: {
        fontFamily: Manrope.bold,
        fontSize: 10,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: isDark
          ? "rgba(175, 182, 168, 0.55)"
          : "rgba(94, 94, 104, 0.55)",
        marginTop: 6,
      },
      tabLabelActive: {
        color: colors.primary,
      },
    });
  }, [colors, isDark, ambientShadow, ghostBorder, po]);

  const goToConfigure = useCallback(
    (mode: HomeDesignMode) => {
      navigation.navigate({
        name: "Configure",
        params: { designMode: mode },
        merge: false,
      });
    },
    [navigation]
  );
  const onSelectDesignTab = useCallback(
    (mode: HomeDesignMode) => {
      if (mode === activeDesignMode) return;
      setActiveDesignMode(mode);
      const targetY = mode === "interior" ? 0 : Math.max(0, designCardOffsetsRef.current[mode]);
      if (Math.abs(homeScrollYRef.current - targetY) < 12) return;
      requestAnimationFrame(() => {
        homeScrollRef.current?.scrollTo({
          y: targetY,
          animated: true,
        });
      });
    },
    [activeDesignMode]
  );

  const openExploreTab = useCallback(() => {
    setActiveBottomTab("explore");
    requestAnimationFrame(() => {
      homeScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  const scrollToHomeSection = useCallback((_tab: BottomTabKey) => {
    homeScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const tabBarHeight = 72 + insets.bottom;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <BlurView
          intensity={55}
          tint={isDark ? "dark" : "light"}
          style={styles.headerBlur}
        >
          <View style={styles.headerInner}>
            <Pressable
              onPress={() => navigation.navigate("Settings")}
              hitSlop={12}
              style={({ pressed }) => [
                styles.headerIconButton,
                pressed && styles.headerIconPressed,
                { zIndex: 1 },
              ]}
            >
              <MaterialIcons name="menu" size={22} color={colors.primary} />
            </Pressable>
            <View style={styles.headerTitleCenter} pointerEvents="none">
              <Text style={styles.headerTitle} numberOfLines={1}>
                Home<Text style={{ color: colors.primary }}>AI</Text>
              </Text>
            </View>
            <View style={styles.headerRight}>
              <FreeStagingUsageBadge />
            </View>
          </View>
        </BlurView>
      </SafeAreaView>

      {isHomeTab ? (
        <View style={styles.stickyTabsWrap}>
          <View style={styles.designTabsRow}>
            {[
              { key: "interior" as const, label: t("home.designTabInterior") },
              { key: "exterior" as const, label: t("home.designTabExterior") },
              { key: "walls" as const, label: t("home.designTabWalls") },
            ].map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => onSelectDesignTab(tab.key)}
                style={[
                  styles.designTab,
                  activeDesignMode === tab.key && styles.designTabActive,
                ]}
              >
                <Text
                  style={[
                    styles.designTabText,
                    activeDesignMode === tab.key && styles.designTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={homeScrollRef}
        style={styles.scroll}
        onScroll={(event) => {
          homeScrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isHomeTab
          ? designCards.map((card) => (
            <Pressable
              key={card.key}
              onLayout={(event) => {
                designCardOffsetsRef.current[card.key] = event.nativeEvent.layout.y;
              }}
              onPress={() => goToConfigure(card.key)}
              accessibilityRole="button"
              accessibilityLabel={
                card.key === "interior"
                  ? t("home.ctaInteriorA11y")
                  : card.key === "exterior"
                    ? t("home.ctaExteriorA11y")
                    : t("home.ctaWallsA11y")
              }
              style={({ pressed }) => [
                styles.designCard,
                ambientShadow,
                ghostBorder,
                premiumCardShadow,
                pressed && styles.designCardPressed,
              ]}
            >
              <View style={styles.designCardHeader}>
                <View>
                  <Text style={styles.designCardTitle}>{card.title}</Text>
                  <Text
                    style={[typography.bodySm, styles.designCardSubtitle]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {card.subtitle}
                  </Text>
                </View>
                <MaterialIcons
                  name="arrow-forward"
                  size={22}
                  color={colors.onSurface}
                  style={styles.designArrow}
                />
              </View>
              <View style={styles.designImageFrame}>
                <Image
                  source={card.image}
                  style={styles.designImage}
                  resizeMode="contain"
                  fadeDuration={0}
                />
              </View>
            </Pressable>
          ))
          : null}

        <View style={!isGalleryPage ? styles.tabHidden : undefined}>
          <HomeGallerySection
            navigation={navigation}
            items={recentHistory}
            getImageSource={getImageSource}
            loading={recentHistoryLoading && recentHistory.length === 0}
            loadFailed={Boolean(recentHistoryError) && recentHistory.length === 0}
          />
        </View>

        {isExplorePage ? <HomeExploreSection navigation={navigation} /> : null}

        {isHistoryPage ? (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <View>
                <Text style={[typography.headline, styles.historyPageTitle]}>
                  {t("history.title")}
                </Text>
                <Text style={[typography.bodySm, styles.historyPageSubtitle]}>
                  {t("history.subtitle")}
                </Text>
              </View>
            </View>
            {recentHistoryLoading && recentHistory.length === 0 ? (
              <View style={styles.historyLoadingBlock}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[typography.body, styles.historyLoadingCaption]}>
                  {t("history.loadingBody")}
                </Text>
              </View>
            ) : recentHistory.length > 0 ? (
              <View style={styles.historyGrid}>
                {recentHistory.map((item) => {
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
                  const imgSrc = getImageSource(item.id, item.imageUrl);
                  const busy = Boolean(deletingIds[item.id]);
                  const isPending = isHistoryItemPending(item);
                  return (
                    <View key={historyItemReactKey(item)} style={styles.recentCell}>
                      <View style={[styles.homeHistoryCardShell, ambientShadow]}>
                        <View style={styles.homeHistoryCard} collapsable={false}>
                          <View style={styles.historyImageWrap}>
                            {isPending ? (
                              <View
                                style={styles.historyImageTapArea}
                                accessibilityRole="text"
                                accessibilityLabel={t("history.stagingInProgressA11y")}
                                accessible
                              >
                                <Image
                                  key={`${item.id}:${imgSrc.uri}`}
                                  source={imgSrc}
                                  style={styles.recentImage}
                                  resizeMode="cover"
                                  fadeDuration={0}
                                />
                                <LinearGradient
                                  colors={["transparent", "rgba(0,0,0,0.72)"]}
                                  style={styles.historyImageGradient}
                                  pointerEvents="none"
                                />
                                <View style={styles.historyImageCopy} pointerEvents="none">
                                  <Text style={styles.historyCardTitle} numberOfLines={1}>
                                    {title}
                                  </Text>
                                  <Text style={styles.historyCardSub} numberOfLines={1}>
                                    {subtitle}
                                  </Text>
                                </View>
                                <View
                                  style={styles.historyPendingOverlay}
                                  pointerEvents="auto"
                                >
                                  <ActivityIndicator size="small" color="#ffffff" />
                                  <Text style={styles.historyPendingText}>
                                    {t("processing.title")}
                                  </Text>
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
                                  styles.historyImageTapArea,
                                  pressed && { opacity: 0.94 },
                                ]}
                              >
                                <Image
                                  key={`${item.id}:${imgSrc.uri}`}
                                  source={imgSrc}
                                  style={styles.recentImage}
                                  resizeMode="cover"
                                  fadeDuration={0}
                                />
                                <LinearGradient
                                  colors={["transparent", "rgba(0,0,0,0.72)"]}
                                  style={styles.historyImageGradient}
                                  pointerEvents="none"
                                />
                                <View style={styles.historyImageCopy}>
                                  <Text style={styles.historyCardTitle} numberOfLines={1}>
                                    {title}
                                  </Text>
                                  <Text style={styles.historyCardSub} numberOfLines={1}>
                                    {subtitle}
                                  </Text>
                                </View>
                              </Pressable>
                            )}
                            <Pressable
                              onPress={() => handleHistoryDelete(item)}
                              disabled={busy || isPending}
                              style={({ pressed }) => [
                                styles.historyDeleteFloating,
                                (busy || isPending) && { opacity: 0.45 },
                                pressed && !busy && !isPending && { opacity: 0.88 },
                              ]}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              accessibilityRole="button"
                              accessibilityLabel={t("history.deleteA11y")}
                            >
                              {busy ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                              ) : (
                                <MaterialIcons
                                  name="delete-outline"
                                  size={19}
                                  color="rgba(255,255,255,0.96)"
                                />
                              )}
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.recentCardSub}>
                {recentHistoryError ? t("history.loadFailedBody") : t("history.emptyBody")}
              </Text>
            )}
          </View>
        ) : null}

        {isHomeTab ? (
          <View style={styles.visionWrap}>
            <LinearGradient
              colors={[colors.primary, colors.primaryDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.visionCard}
            >
              <View style={styles.visionGlow} />
              <MaterialIcons
                name="auto-awesome"
                size={180}
                color="rgba(255,255,255,0.12)"
                style={styles.visionWater}
              />
              <View style={styles.visionContent}>
                <View style={styles.visionPill}>
                  <Text style={styles.visionPillText}>{t("home.visionPill")}</Text>
                </View>
                <Text style={styles.visionHeadline}>{t("home.visionHeadline")}</Text>
                <Text style={styles.visionBody}>{t("home.visionBody")}</Text>
                <Pressable
                  onPress={openExploreTab}
                  style={({ pressed }) => [
                    styles.exploreBtn,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={styles.exploreBtnText}>{t("home.exploreStyles")}</Text>
                  <MaterialIcons
                    name="arrow-forward"
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
        <BlurView
          intensity={70}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.tabBarInner}>
          {bottomTabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => {
                if (tab.active) return;
                setActiveBottomTab(tab.key);
                scrollToHomeSection(tab.key);
              }}
              style={({ pressed }) => [
                styles.tabItem,
                tab.active && styles.tabItemActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <MaterialIcons
                name={tab.icon}
                size={26}
                color={
                  tab.active
                    ? colors.primary
                    : isDark
                      ? "rgba(175, 182, 168, 0.55)"
                      : "rgba(94, 94, 104, 0.55)"
                }
              />
              <Text
                style={[
                  styles.tabLabel,
                  tab.active && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
