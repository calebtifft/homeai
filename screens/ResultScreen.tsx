import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { ToastBanner } from "../components/ToastBanner";
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
import { saveImageToPhotoLibrary } from "../services/saveImageToLibrary";
import { shareImageUri } from "../services/shareImage";
import {
  navigateToConfigureFromSelection,
  navigateToProcessingFromSelection,
} from "../utils/stagingFlowNavigation";
import type { RootStackParamList } from "../types";
import { primaryOverlay, radius } from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

type ToastVariant = "success" | "error";

export function ResultScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const p = route.params;
  const { originalUri, generatedUri } = p;
  const isExterior = p.designMode === "exterior";
  const isWalls = p.designMode === "walls";
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<ToastVariant>("success");
  const toastDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastClearMsgRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useLanguage();
  const { colors, typography, ghostBorder } = useTheme();

  const styleLabel = isWalls
    ? t(WALL_PRESET_LABEL_KEY[p.wallStyle])
    : isExterior
      ? t(EXTERIOR_STYLE_LABEL_KEY[p.exteriorStyle])
      : p.style
        ? t(STYLE_LABEL_KEY[p.style])
        : "";
  const roomOrSceneLabel = isWalls
    ? t(WALL_TREATMENT_LABEL_KEY[p.wallTreatment])
    : isExterior
      ? t(EXTERIOR_SCENE_LABEL_KEY[p.exteriorSceneType])
      : p.roomType
        ? t(ROOM_TYPE_LABEL_KEY[p.roomType])
        : "";

  const heroSub = isWalls
    ? t("result.heroSubWalls", { finish: styleLabel })
    : isExterior
      ? t("result.heroSubExterior", {
          style: styleLabel,
          scene: roomOrSceneLabel,
        })
      : t("result.heroSub", { style: styleLabel, room: roomOrSceneLabel });

  const showToast = useCallback((message: string, variant: ToastVariant) => {
    if (toastDismissRef.current) {
      clearTimeout(toastDismissRef.current);
      toastDismissRef.current = null;
    }
    if (toastClearMsgRef.current) {
      clearTimeout(toastClearMsgRef.current);
      toastClearMsgRef.current = null;
    }
    setToastVariant(variant);
    setToastMessage(message);
    setToastOpen(true);
    toastDismissRef.current = setTimeout(() => {
      setToastOpen(false);
      toastDismissRef.current = null;
      toastClearMsgRef.current = setTimeout(() => {
        setToastMessage("");
        toastClearMsgRef.current = null;
      }, 240);
    }, 2800);
  }, []);

  useEffect(
    () => () => {
      if (toastDismissRef.current) clearTimeout(toastDismissRef.current);
      if (toastClearMsgRef.current) clearTimeout(toastClearMsgRef.current);
    },
    []
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: {
          flex: 1,
          backgroundColor: colors.surface,
        },
        scrollContent: {
          paddingHorizontal: 24,
          paddingTop: Math.max(insets.top, 8) + 8,
          paddingBottom: 40,
          alignItems: "stretch",
        },
        heroTitle: {
          marginBottom: 8,
        },
        backBtn: {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: 6,
          marginBottom: 12,
          paddingVertical: 6,
          paddingHorizontal: 2,
        },
        heroSub: {
          marginBottom: 20,
        },
        metaRow: {
          flexDirection: "row",
          gap: 12,
          marginTop: 20,
          marginBottom: 24,
        },
        metaCell: {
          flex: 1,
          padding: 18,
          borderRadius: radius.xl,
          backgroundColor: colors.surfaceContainerLow,
        },
        metaValue: {
          marginTop: 6,
        },
        primarySave: {
          marginBottom: 12,
        },
        secondaryBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minHeight: 56,
          borderRadius: radius.xl,
          backgroundColor: colors.secondaryContainer,
          marginBottom: 12,
        },
        tertiaryBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minHeight: 52,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.outlineVariant,
          marginBottom: 12,
        },
        actionsSpacer: {
          marginBottom: 16,
        },
        pressed: {
          opacity: 0.92,
          transform: [{ scale: 0.99 }],
        },
        notesRule: {
          width: 48,
          height: 2,
          borderRadius: 1,
          backgroundColor: primaryOverlay.o22,
          marginBottom: 16,
        },
        notesTitle: {
          marginBottom: 10,
        },
        notesBody: {
          lineHeight: 22,
          maxWidth: 400,
        },
      }),
    [colors, insets.top]
  );

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveImageToPhotoLibrary(generatedUri);
      showToast(t("result.saveSuccessToast"), "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("result.saveErrorFallback");
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareImageUri(generatedUri);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("result.shareErrorFallback");
      showToast(msg, "error");
    } finally {
      setSharing(false);
    }
  };

  const runRegenerate = useCallback(async () => {
    if (regenerating) return;
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
      navigateToProcessingFromSelection(navigation, originalUri, p);
    } finally {
      setRegenerating(false);
    }
  }, [navigation, originalUri, p, regenerating, t, user?.id]);

  const onChangeSettings = () => {
    navigateToConfigureFromSelection(navigation, originalUri, p);
  };

  const onTryAnother = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Home" }],
    });
  };

  return (
    <View style={[styles.scroll, { flex: 1 }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [
          styles.backBtn,
          pressed && styles.pressed,
        ]}>
          <MaterialIcons name="arrow-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={[typography.displaySm, styles.heroTitle]}>
          {t("result.title")}
        </Text>
        <Text style={[typography.body, styles.heroSub]}>{heroSub}</Text>

        <BeforeAfterSlider
          originalUri={originalUri}
          generatedUri={generatedUri}
        />

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
            <Text style={[typography.metaValue, styles.metaValue]}>
              {roomOrSceneLabel}
            </Text>
          </View>
        </View>

        <PrimaryCTA
          title={t("result.saveCta")}
          icon={
            <MaterialIcons name="download" size={22} color={colors.onPrimary} />
          }
          onPress={onSave}
          loading={saving}
          disabled={sharing || regenerating}
          style={styles.primarySave}
        />

        <Pressable
          onPress={() => void onShare()}
          disabled={saving || regenerating}
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
            {sharing ? t("subscription.purchasing") : t("result.shareCta")}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void runRegenerate()}
          disabled={saving || sharing || regenerating}
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
            {regenerating ? t("subscription.purchasing") : t("result.regenerateCta")}
          </Text>
        </Pressable>

        <Pressable
          onPress={onChangeSettings}
          disabled={saving || sharing || regenerating}
          style={({ pressed }) => [
            styles.tertiaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            name="tune"
            size={22}
            color={colors.onSurface}
          />
          <Text style={[typography.secondaryCta, { color: colors.onSurface }]}>
            {t("result.changeSettingsCta")}
          </Text>
        </Pressable>

        <Pressable
          onPress={onTryAnother}
          style={({ pressed }) => [
            styles.tertiaryBtn,
            styles.actionsSpacer,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            name="home"
            size={22}
            color={colors.onSurface}
          />
          <Text style={[typography.secondaryCta, { color: colors.onSurface }]}>
            {t("result.tryAnother")}
          </Text>
        </Pressable>

        <View style={styles.notesRule} />
        <Text style={[typography.headline, styles.notesTitle]}>
          {t("result.notesTitle")}
        </Text>
        <Text style={[typography.bodySm, styles.notesBody]}>{t("result.notesBody")}</Text>
      </ScrollView>

      {toastMessage ? (
        <ToastBanner
          visible={toastOpen}
          message={toastMessage}
          variant={toastVariant}
        />
      ) : null}
    </View>
  );
}
