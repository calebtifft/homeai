import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { StackScreenHeader } from "../components/StackScreenHeader";
import { useAuth } from "../contexts/AuthContext";
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
import { resolveHistoryItemMediaUris } from "../services/history";
import { shareImageUri } from "../services/shareImage";
import {
  navigateToConfigureFromSelection,
  navigateToProcessingFromSelection,
} from "../utils/stagingFlowNavigation";
import type { RootStackParamList } from "../types";
import { radius } from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "HistoryDetail">;

function canonicalCompareUri(uri: string | undefined): string {
  if (!uri) return "";
  return uri.trim().replace(/[?#].*$/, "");
}

export function HistoryDetailScreen({ route, navigation }: Props) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { colors, typography, ghostBorder } = useTheme();
  const item = route.params;
  const isExterior = item.designMode === "exterior";
  const isWalls = item.designMode === "walls";
  const [sharing, setSharing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(4 / 5);
  const [displayImageUrl, setDisplayImageUrl] = useState(item.imageUrl);
  const [displayOriginalUri, setDisplayOriginalUri] = useState(item.originalUri);

  const sourceUri =
    displayOriginalUri ?? item.sourceUri ?? item.originalUri ?? displayImageUrl;
  const hasCompare = Boolean(
    displayOriginalUri &&
      displayImageUrl &&
      canonicalCompareUri(displayOriginalUri) !== canonicalCompareUri(displayImageUrl)
  );

  useEffect(() => {
    let cancelled = false;
    setDisplayImageUrl(item.imageUrl);
    setDisplayOriginalUri(item.originalUri);
    void resolveHistoryItemMediaUris({
      imageUrl: item.imageUrl,
      originalUri: item.originalUri,
      sourceUri: item.sourceUri,
      sessionFolder: item.sessionFolder,
    }).then((resolved) => {
      if (cancelled) return;
      setDisplayImageUrl(resolved.imageUrl);
      setDisplayOriginalUri(resolved.originalUri);
    });
    return () => {
      cancelled = true;
    };
  }, [item.imageUrl, item.originalUri, item.sourceUri, item.sessionFolder]);

  useEffect(() => {
    let active = true;
    Image.getSize(
      displayImageUrl,
      (w, h) => {
        if (!active || w <= 0 || h <= 0) return;
        setImageAspectRatio(w / h);
      },
      () => {}
    );
    return () => {
      active = false;
    };
  }, [displayImageUrl]);

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

  const roomOrSceneLabel = isWalls
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

  const stagingSelection = useMemo(() => {
    if (isWalls && item.wallTreatment && item.wallStyle) {
      return {
        designMode: "walls" as const,
        wallTreatment: item.wallTreatment,
        wallStyle: item.wallStyle,
        wallColorHex: item.wallColorHex,
        wallCustomPrompt: item.wallCustomPrompt,
        photoMode: item.photoMode,
        paletteId: item.paletteId,
      };
    }
    if (isExterior && item.exteriorSceneType && item.exteriorStyle) {
      return {
        designMode: "exterior" as const,
        exteriorSceneType: item.exteriorSceneType,
        exteriorStyle: item.exteriorStyle,
        photoMode: item.photoMode,
        paletteId: item.paletteId,
      };
    }
    if (item.roomType && item.style) {
      return {
        designMode: "interior" as const,
        roomType: item.roomType,
        style: item.style,
        photoMode: item.photoMode,
        paletteId: item.paletteId,
      };
    }
    return null;
  }, [isExterior, isWalls, item]);

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
        metaRow: {
          flexDirection: "row",
          gap: 12,
          marginTop: 4,
          marginBottom: 20,
        },
        imageWrap: {
          width: "100%",
          marginBottom: 20,
          borderRadius: radius.xl,
          overflow: "hidden",
          backgroundColor: colors.surfaceContainerHigh,
        },
        image: {
          width: "100%",
          aspectRatio: imageAspectRatio,
        },
        metaCell: {
          flex: 1,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceContainerLow,
        },
        metaValue: {
          marginTop: 6,
        },
        actionRow: {
          gap: 10,
          marginBottom: 12,
        },
        secondaryBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minHeight: 52,
          borderRadius: radius.xl,
          backgroundColor: colors.secondaryContainer,
        },
        pressed: { opacity: 0.92 },
      }),
    [colors, imageAspectRatio]
  );

  const onShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareImageUri(displayImageUrl);
    } catch (e) {
      Alert.alert(
        t("result.shareCta"),
        e instanceof Error ? e.message : t("result.shareErrorFallback")
      );
    } finally {
      setSharing(false);
    }
  }, [displayImageUrl, sharing, t]);

  const onRegenerate = useCallback(async () => {
    if (!stagingSelection || regenerating) return;
    setRegenerating(true);
    try {
      const { resolveStagingAccess } = await import(
        "../services/subscriptionAccess"
      );
      const access = await resolveStagingAccess(user?.id ?? null);
      if (!access.allowed) {
        Alert.alert(
          t("usage.limitTitle"),
          t("usage.limitBody", { limit: access.dailyLimit }),
          [
            { text: t("configure.back"), style: "cancel" },
            {
              text: t("usage.subscribeCta"),
              onPress: () => navigation.navigate("SubscriptionPlans"),
            },
          ]
        );
        return;
      }
      navigateToProcessingFromSelection(
        navigation,
        sourceUri,
        stagingSelection
      );
    } finally {
      setRegenerating(false);
    }
  }, [
    navigation,
    regenerating,
    sourceUri,
    stagingSelection,
    t,
    user?.id,
  ]);

  const onChangeSettings = useCallback(() => {
    if (!stagingSelection) return;
    navigateToConfigureFromSelection(navigation, sourceUri, stagingSelection);
  }, [navigation, sourceUri, stagingSelection]);

  const onOpenResult = useCallback(() => {
    if (!hasCompare || !displayOriginalUri || !stagingSelection) return;
    navigation.navigate("Result", {
      originalUri: displayOriginalUri,
      generatedUri: displayImageUrl,
      ...stagingSelection,
    });
  }, [
    displayImageUrl,
    displayOriginalUri,
    hasCompare,
    navigation,
    stagingSelection,
  ]);

  return (
    <View style={styles.root}>
      <StackScreenHeader title={t("history.title")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.imageWrap, ghostBorder]}>
          {hasCompare && displayOriginalUri ? (
            <BeforeAfterSlider
              originalUri={displayOriginalUri}
              generatedUri={displayImageUrl}
            />
          ) : (
            <Image
              source={{ uri: displayImageUrl }}
              style={styles.image}
              resizeMode="contain"
              fadeDuration={0}
            />
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.metaCell, ghostBorder]}>
            <Text style={typography.label}>
              {isWalls
                ? t("result.metaFinish")
                : isExterior
                  ? t("configure.reviewStyleFieldExterior")
                  : t("result.metaStyle")}
            </Text>
            <Text style={[typography.metaValue, styles.metaValue]}>{styleLabel}</Text>
          </View>
          <View style={[styles.metaCell, ghostBorder]}>
            <Text style={typography.label}>
              {isWalls
                ? t("result.metaTreatment")
                : isExterior
                  ? t("result.metaScene")
                  : t("result.metaRoom")}
            </Text>
            <Text style={[typography.metaValue, styles.metaValue]}>{roomOrSceneLabel}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {hasCompare ? (
            <PrimaryCTA
              title={t("history.openResult")}
              onPress={onOpenResult}
              icon={
                <MaterialIcons name="compare" size={22} color={colors.onPrimary} />
              }
            />
          ) : null}
          {stagingSelection ? (
            <>
              <Pressable
                onPress={() => void onRegenerate()}
                disabled={regenerating || sharing}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="autorenew"
                  size={22}
                  color={colors.onSecondaryContainer}
                />
                <Text style={typography.secondaryCta}>
                  {regenerating
                    ? t("subscription.purchasing")
                    : t("history.regenerate")}
                </Text>
              </Pressable>
              <Pressable
                onPress={onChangeSettings}
                disabled={regenerating || sharing}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons name="tune" size={22} color={colors.onSecondaryContainer} />
                <Text style={typography.secondaryCta}>
                  {t("result.changeSettingsCta")}
                </Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            onPress={() => void onShare()}
            disabled={sharing || regenerating}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons
              name="ios-share"
              size={22}
              color={colors.onSecondaryContainer}
            />
            <Text style={typography.secondaryCta}>
              {sharing ? t("subscription.purchasing") : t("history.share")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
