import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  ListRenderItem,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ImageStyle } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { StackScreenHeader } from "../components/StackScreenHeader";
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
  isHistoryItemPending,
  dedupePendingForDisplay,
  historyItemReactKey,
  mergeHistoryListState,
  listHistoryItems,
  type HistoryItem,
} from "../services/history";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "History">;

function canonicalImageKey(uri: string | undefined): string {
  if (!uri) return "";
  return uri.trim().replace(/[?#].*$/, "");
}

function isPrefetchableUri(uri: string | undefined): boolean {
  const value = uri?.trim();
  if (!value) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/)/i.test(value);
}

type HistoryCardProps = {
  item: HistoryItem;
  imageSource: { uri: string };
  styleLabel: string;
  roomLabel: string;
  processingText: string;
  onPress: () => void;
  onDelete: () => void;
  onImageLoadError?: () => void;
  deleteBusy: boolean;
  deleteA11yLabel: string;
  styles: ReturnType<typeof StyleSheet.create>;
  ambientShadow: object;
  titleStyle: object;
  bodyStyle: object;
};

const HistoryCard = memo(function HistoryCard({
  item,
  imageSource,
  styleLabel,
  roomLabel,
  processingText,
  onPress,
  onDelete,
  onImageLoadError,
  deleteBusy,
  deleteA11yLabel,
  styles,
  ambientShadow,
  titleStyle,
  bodyStyle,
}: HistoryCardProps) {
  const pending = isHistoryItemPending(item);
  return (
    <View style={[styles.cardShell, ambientShadow]}>
      <View style={styles.card} collapsable={false}>
        <View style={styles.imageStage}>
          {pending ? (
            <View
              style={[styles.imageTapArea, styles.imageTapAreaDisabled]}
              accessibilityRole="text"
              accessibilityLabel={processingText}
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
                style={styles.imageGradient}
                pointerEvents="none"
              />
              <View style={styles.cardBody} pointerEvents="none">
                <Text style={[titleStyle, { color: "#fff" }]} numberOfLines={1}>
                  {styleLabel}
                </Text>
                <Text style={[bodyStyle, { color: "rgba(255,255,255,0.94)" }]} numberOfLines={1}>
                  {roomLabel}
                </Text>
              </View>
              <View style={styles.pendingOverlay} pointerEvents="auto">
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.pendingText}>{processingText}</Text>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.imageTapArea,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Image
                key={`${item.id}:${imageSource.uri}`}
                source={imageSource}
                style={styles.image as ImageStyle}
                resizeMode="cover"
                fadeDuration={0}
                onError={() => {
                  onImageLoadError?.();
                }}
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.72)"]}
                style={styles.imageGradient}
                pointerEvents="none"
              />
              <View style={styles.cardBody}>
                <Text style={[titleStyle, { color: "#fff" }]} numberOfLines={1}>
                  {styleLabel}
                </Text>
                <Text style={[bodyStyle, { color: "rgba(255,255,255,0.94)" }]} numberOfLines={1}>
                  {roomLabel}
                </Text>
              </View>
            </Pressable>
          )}
          <Pressable
            onPress={onDelete}
            disabled={deleteBusy || pending}
            style={({ pressed }) => [
              styles.deleteFloating,
              (deleteBusy || pending) && { opacity: 0.45 },
              pressed && !deleteBusy && !pending && { opacity: 0.88 },
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={deleteA11yLabel}
          >
            {deleteBusy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <MaterialIcons name="delete-outline" size={19} color="rgba(255,255,255,0.96)" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
});
export function HistoryScreen({ navigation }: Props) {
  const { t } = useLanguage();
  const { colors, typography, ambientShadow } = useTheme();
  const [items, setItems] = useState<HistoryItem[]>([]);
  /** Initial / full-screen fetch when there is nothing to show yet. */
  const [loading, setLoading] = useState(true);
  /** Lightweight refetch while the grid is already visible (e.g. after navigation back). */
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const lastLoadedAtRef = useRef(0);
  const itemsRef = useRef<HistoryItem[]>([]);
  const imageSourceCacheRef = useRef<Record<string, { uri: string; key: string }>>({});
  const imageReloadOnceRef = useRef<Set<string>>(new Set());
  /** Incremented on blur so in-flight focus loads skip `setItems` and avoid glitches after navigation. */
  const loadApplyGenerationRef = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.surface,
        },
        content: {
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 28,
          maxWidth: 448,
          width: "100%",
          alignSelf: "center",
        },
        subtitle: {
          marginBottom: 14,
          opacity: 0.84,
        },
        emptyWrap: {
          marginTop: 50,
          alignItems: "center",
          paddingHorizontal: 18,
        },
        emptyIcon: {
          width: 62,
          height: 62,
          borderRadius: 31,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceContainerLow,
          marginBottom: 14,
        },
        emptyTitle: {
          textAlign: "center",
          marginBottom: 6,
        },
        emptyBody: {
          textAlign: "center",
          opacity: 0.74,
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
        syncRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          paddingVertical: 8,
          paddingHorizontal: 4,
        },
        syncText: {
          opacity: 0.85,
        },
        cardShell: {
          width: "48%",
          marginBottom: 18,
          borderRadius: 16,
        },
        card: {
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: colors.surfaceContainerLowest,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
        },
        imageStage: {
          width: "100%",
          height: 180,
          position: "relative",
          backgroundColor: colors.surfaceContainer,
        },
        imageTapArea: {
          ...StyleSheet.absoluteFillObject,
        },
        imageTapAreaDisabled: {},
        image: {
          width: "100%",
          height: "100%",
          backgroundColor: colors.surfaceContainer,
        },
        deleteFloating: {
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
          backgroundColor: "rgba(0,0,0,0.48)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(255,255,255,0.28)",
        },
        cardBody: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 10,
          paddingBottom: 10,
          paddingTop: 24,
        },
        imageGradient: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "50%",
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        rowText: {
          flex: 1,
        },
        pendingOverlay: {
          ...StyleSheet.absoluteFillObject,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.34)",
          gap: 8,
        },
        pendingText: {
          ...typography.title,
          color: "#ffffff",
        },
        grid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        },
      }),
    [colors, typography]
  );

  /** Signed URLs expire (~1h); refresh periodically so thumbnails do not stick on gray placeholders. */
  const HISTORY_LIST_MAX_CACHE_MS = 4 * 60 * 1000;

  const load = useCallback(
    async (opts?: { force?: boolean; localOnly?: boolean; applyToken?: number }) => {
      const force = Boolean(opts?.force);
      const localOnly = Boolean(opts?.localOnly);
      const applyToken = opts?.applyToken;
      const currentItems = itemsRef.current;
      const hasPending = currentItems.some((item) => item.status === "pending");
      const cacheFresh =
        Date.now() - lastLoadedAtRef.current < HISTORY_LIST_MAX_CACHE_MS;
      if (!localOnly && !force && !hasPending && currentItems.length > 0 && cacheFresh) {
        return;
      }

      setError(null);
      try {
        const data = await listHistoryItems(
          localOnly ? { localOnly: true } : { force }
        );
        if (applyToken !== undefined && loadApplyGenerationRef.current !== applyToken) {
          return;
        }
        setItems((prev) => mergeHistoryListState(prev, dedupePendingForDisplay(data)));
        lastLoadedAtRef.current = Date.now();
      } catch (e) {
        if (applyToken !== undefined && loadApplyGenerationRef.current !== applyToken) {
          return;
        }
        const msg = e instanceof Error ? e.message : "Could not load history.";
        setError(msg);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      const applyToken = ++loadApplyGenerationRef.current;
      const hadItems = itemsRef.current.length > 0;
      if (!hadItems) {
        setLoading(true);
      } else {
        setSyncing(true);
      }

      const timer = setTimeout(() => {
        if (loadApplyGenerationRef.current !== applyToken) return;
        setLoading(false);
        setSyncing(false);
      }, 45_000);
      void load({ force: true, applyToken }).finally(() => {
        clearTimeout(timer);
        if (loadApplyGenerationRef.current !== applyToken) return;
        setLoading(false);
        setSyncing(false);
      });

      return () => {
        clearTimeout(timer);
        loadApplyGenerationRef.current += 1;
        setLoading(false);
        setSyncing(false);
      };
    }, [load])
  );

  const hasPendingHistory = useMemo(
    () => items.some((item) => item.status === "pending"),
    [items]
  );

  const hadPendingHistoryRef = useRef(false);

  useEffect(() => {
    if (!hasPendingHistory) return;
    const id = setInterval(() => {
      void load({ localOnly: true });
    }, 1800);
    return () => clearInterval(id);
  }, [hasPendingHistory, load]);

  useEffect(() => {
    if (hadPendingHistoryRef.current && !hasPendingHistory) {
      void load({ force: true });
    }
    hadPendingHistoryRef.current = hasPendingHistory;
  }, [hasPendingHistory, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    if (items.length === 0) return;
    const topItems = items.slice(0, 18);
    for (const item of topItems) {
      if (isPrefetchableUri(item.imageUrl)) {
        void Image.prefetch(item.imageUrl).catch(() => {
          // Non-fatal: avoid noisy "Network request failed" logs for expired URLs.
        });
      }
      if (item.originalUri && isPrefetchableUri(item.originalUri)) {
        void Image.prefetch(item.originalUri).catch(() => {
          // Non-fatal: avoid noisy "Network request failed" logs for expired URLs.
        });
      }
    }
  }, [items]);

  const keyExtractor = useCallback(
    (item: HistoryItem) => historyItemReactKey(item),
    []
  );

  const listHeader = useMemo(
    () => (
      <View>
        {syncing ? (
          <View style={styles.syncRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[typography.bodySm, styles.syncText]}>{t("history.syncingBody")}</Text>
          </View>
        ) : null}
        <Text style={[typography.bodySm, styles.subtitle]}>{t("history.subtitle")}</Text>
      </View>
    ),
    [colors.primary, styles, syncing, t, typography.bodySm]
  );

  const getImageSource = useCallback((item: HistoryItem): { uri: string } => {
    const existing = imageSourceCacheRef.current[item.id];
    const nextKey = canonicalImageKey(item.sourceUri || item.imageUrl);
    if (existing && existing.key === nextKey && existing.uri === item.imageUrl) return existing;
    const next = { uri: item.imageUrl, key: nextKey };
    imageSourceCacheRef.current[item.id] = next;
    return next;
  }, []);

  const onThumbnailLoadError = useCallback(
    (itemId: string) => {
      if (imageReloadOnceRef.current.has(itemId)) return;
      imageReloadOnceRef.current.add(itemId);
      delete imageSourceCacheRef.current[itemId];
      void load({ force: true });
    },
    [load]
  );

  const renderItem: ListRenderItem<HistoryItem> = useCallback(
    ({ item }) => {
      const isExterior = item.designMode === "exterior";
      const isWalls = item.designMode === "walls";
      const roomLabel = isWalls
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
      const styleLabel = isWalls
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

      return (
        <HistoryCard
          item={item}
          imageSource={getImageSource(item)}
          styleLabel={styleLabel}
          roomLabel={roomLabel}
          processingText={t("processing.title")}
          deleteBusy={Boolean(deletingIds[item.id])}
          deleteA11yLabel={t("history.deleteA11y")}
          onImageLoadError={() => onThumbnailLoadError(item.id)}
          onPress={() => {
            if (isHistoryItemPending(item)) return;
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
            });
          }}
          onDelete={() => {
            if (deletingIds[item.id]) return;
            Alert.alert(t("history.deleteTitle"), t("history.deleteMessage"), [
              { text: t("configure.back"), style: "cancel" },
              {
                text: t("history.deleteConfirm"),
                style: "destructive",
                onPress: () => {
                  setDeletingIds((prev) => ({ ...prev, [item.id]: true }));
                  delete imageSourceCacheRef.current[item.id];
                  setItems((prev) =>
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
                      await load({ force: true });
                    }
                  })();
                },
              },
            ]);
          }}
          styles={styles}
          ambientShadow={ambientShadow}
          titleStyle={typography.title}
          bodyStyle={typography.bodySm}
        />
      );
    },
    [
      ambientShadow,
      deletingIds,
      getImageSource,
      load,
      onThumbnailLoadError,
      navigation,
      styles,
      t,
      typography.bodySm,
      typography.title,
    ]
  );

  return (
    <View style={styles.root}>
      <StackScreenHeader title={t("history.title")} />
      {loading ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <Text style={[typography.bodySm, styles.subtitle]}>{t("history.subtitle")}</Text>
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[typography.body, styles.loadingCaption]}>{t("history.loadingBody")}</Text>
          </View>
        </ScrollView>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <Text style={[typography.bodySm, styles.subtitle]}>{t("history.subtitle")}</Text>
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="history" size={28} color={colors.primary} />
            </View>
            <Text style={[typography.headline, styles.emptyTitle]}>
              {t("history.emptyTitle")}
            </Text>
            <Text style={[typography.body, styles.emptyBody]}>
              {error ?? t("history.emptyBody")}
            </Text>
            <Pressable onPress={() => navigation.navigate("Home")} style={{ marginTop: 16 }}>
              <Text style={typography.secondaryCta}>{t("configure.back")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.grid}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={false}
          ListHeaderComponent={listHeader}
        />
      )}
    </View>
  );
}
