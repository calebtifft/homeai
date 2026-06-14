import * as Notifications from "expo-notifications";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ViewStyle } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackScreenHeader } from "../components/StackScreenHeader";
import { ToastBanner } from "../components/ToastBanner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import {
  loadSettingsToggles,
  setNotificationsEnabled,
} from "../services/settingsPreferences";
import {
  getActiveSubscriptionSummary,
  refreshSubscriptionEntitlements,
  type ActiveSubscriptionSummary,
} from "../services/subscriptionBilling";
import {
  activeSummaryFromProfile,
  getCachedSubscriptionProfile,
  getSubscriptionProfile,
} from "../services/subscriptionProfile";
import { languageDisplayLabel } from "../constants/languages";
import {
  ensureNotificationsReady,
  getOsNotificationsGranted,
} from "../services/stagingNotifications";
import { shouldOfferPermissionSettings } from "../utils/permissions";
import { formatSubscriptionDate } from "../utils/subscriptionDisplay";
import type { StringKey } from "../locales/strings";
import { translate } from "../locales/strings";
import type { RootStackParamList } from "../types";
import {
  Manrope,
  radius,
  type ThemePalette,
  type ThemeTypography,
} from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

/** Custom switch geometry — thumb travel for spring animation. */
const SWITCH_TRACK_W = 51;
const SWITCH_THUMB = 27;
const SWITCH_PAD = 2;
const SWITCH_THUMB_TRAVEL = SWITCH_TRACK_W - SWITCH_PAD * 2 - SWITCH_THUMB;

type MaterialName = ComponentProps<typeof MaterialIcons>["name"];

type SettingsStyles = ReturnType<typeof createSettingsStyles>;

function createSettingsStyles(
  colors: ThemePalette,
  typography: ThemeTypography,
  ghostBorder: ViewStyle,
  ambientShadow: ViewStyle,
  primaryOverlay: { o08: string }
) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      maxWidth: 448,
      width: "100%",
      alignSelf: "center",
    },
    sectionTitle: {
      ...typography.label,
      fontSize: 11,
      letterSpacing: 1.15,
      marginTop: 20,
      marginBottom: 10,
      marginLeft: 2,
    },
    cardGroup: {
      marginBottom: 4,
    },
    rowCard: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      ...ghostBorder,
      ...ambientShadow,
    },
    rowCardStacked: {
      marginTop: 8,
    },
    rowPressed: {
      opacity: 0.92,
    },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: primaryOverlay.o08,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
      alignSelf: "center",
    },
    rowLabel: {
      fontFamily: Manrope.semiBold,
      fontSize: 16,
      lineHeight: 22,
      letterSpacing: -0.15,
      color: colors.onSurface,
      ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
    },
    rowSubtitle: {
      fontFamily: Manrope.medium,
      fontSize: 13,
      lineHeight: 18,
      color: colors.onSurfaceVariant,
      marginTop: 2,
      ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
    },
    rowTextCol: {
      flex: 1,
      paddingRight: 8,
      justifyContent: "center",
      minHeight: 44,
    },
    rowChevron: {
      alignSelf: "center",
      justifyContent: "center",
    },
    switchTrack: {
      width: SWITCH_TRACK_W,
      height: 31,
      borderRadius: 16,
      overflow: "hidden",
    },
    switchTrackBase: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerHigh,
    },
    switchTrackOnLayer: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      backgroundColor: colors.primaryContainer,
    },
    switchThumbRail: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      justifyContent: "center",
      paddingHorizontal: SWITCH_PAD,
      zIndex: 1,
    },
    switchThumb: {
      width: SWITCH_THUMB,
      height: SWITCH_THUMB,
      borderRadius: SWITCH_THUMB / 2,
      backgroundColor: colors.surfaceContainerLowest,
      ...Platform.select({
        ios: {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.14,
          shadowRadius: 2.5,
        },
        android: { elevation: 2 },
        default: {},
      }),
    },
  });
}

function IconTile({
  name,
  colors,
  styles,
}: {
  name: MaterialName;
  colors: ThemePalette;
  styles: SettingsStyles;
}) {
  return (
    <View style={styles.iconTile}>
      <MaterialIcons name={name} size={22} color={colors.primary} />
    </View>
  );
}

function SettingsSectionTitle({
  children,
  styles,
}: {
  children: string;
  styles: SettingsStyles;
}) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function SettingsNavRow({
  icon,
  label,
  subtitle,
  onPress,
  isFirst,
  colors,
  styles,
  chevronColor,
}: {
  icon: MaterialName;
  label: string;
  subtitle?: string;
  onPress: () => void;
  isFirst: boolean;
  colors: ThemePalette;
  styles: SettingsStyles;
  chevronColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowCard,
        !isFirst && styles.rowCardStacked,
        pressed && styles.rowPressed,
      ]}
    >
      <IconTile name={icon} colors={colors} styles={styles} />
      <View style={styles.rowTextCol}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.rowChevron}>
        <MaterialIcons name="chevron-right" size={22} color={chevronColor} />
      </View>
    </Pressable>
  );
}

function SettingsSwitch({
  value,
  onValueChange,
  styles,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  styles: SettingsStyles;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: value ? 1 : 0,
      friction: 8,
      tension: 112,
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  const thumbTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SWITCH_THUMB_TRAVEL],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={styles.switchTrack}
    >
      <View style={styles.switchTrackBase} pointerEvents="none" />
      <Animated.View
        pointerEvents="none"
        style={[styles.switchTrackOnLayer, { opacity: progress }]}
      />
      <View style={styles.switchThumbRail} pointerEvents="box-none">
        <Animated.View
          pointerEvents="none"
          style={[
            styles.switchThumb,
            { transform: [{ translateX: thumbTranslateX }] },
          ]}
        />
      </View>
    </Pressable>
  );
}

function SettingsToggleRow({
  icon,
  label,
  value,
  onValueChange,
  isFirst,
  colors,
  styles,
}: {
  icon: MaterialName;
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  isFirst: boolean;
  colors: ThemePalette;
  styles: SettingsStyles;
}) {
  return (
    <View style={[styles.rowCard, !isFirst && styles.rowCardStacked]}>
      <IconTile name={icon} colors={colors} styles={styles} />
      <View style={styles.rowTextCol}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <SettingsSwitch
        value={value}
        onValueChange={onValueChange}
        styles={styles}
      />
    </View>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { languageId, t, takeQueuedLanguageSavedToast } = useLanguage();
  const userId = user?.id ?? null;
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastClearMsgRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    colors,
    typography,
    ghostBorder,
    ambientShadow,
    primaryOverlay,
    isDark,
    setDarkMode,
  } = useTheme();
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [activeSummary, setActiveSummary] =
    useState<ActiveSubscriptionSummary | null>(null);

  const languageSubtitle = useMemo(
    () => languageDisplayLabel(languageId),
    [languageId]
  );

  const subscriptionSubtitle = useMemo(() => {
    if (!activeSummary) {
      return t("subscription.settingsSubtitleFree");
    }
    if (activeSummary.isLifetime) {
      return t("subscription.settingsSubtitleLifetime");
    }
    const planTitle = translate(
      languageId,
      `plan.${activeSummary.planId}.title` as StringKey
    );
    if (!activeSummary.expiresAt) {
      return t("subscription.settingsSubtitlePlan", { plan: planTitle });
    }
    const date = formatSubscriptionDate(activeSummary.expiresAt, languageId);
    return activeSummary.willRenew
      ? t("subscription.settingsSubtitleRenewal", { plan: planTitle, date })
      : t("subscription.settingsSubtitleExpires", { plan: planTitle, date });
  }, [activeSummary, languageId, t]);

  const applySummaryToState = useCallback(
    (summary: ActiveSubscriptionSummary | null) => {
      setActiveSummary(summary);
    },
    []
  );

  const summaryFromLocalProfile = useCallback(async () => {
    const cached = await getCachedSubscriptionProfile();
    if (cached?.status !== "active") return null;
    return activeSummaryFromProfile(cached);
  }, []);

  const styles = useMemo(
    () =>
      createSettingsStyles(
        colors,
        typography,
        ghostBorder,
        ambientShadow,
        primaryOverlay
      ),
    [colors, typography, ghostBorder, ambientShadow, primaryOverlay]
  );

  const showLanguageSavedToast = useCallback((message: string) => {
    if (toastDismissRef.current) {
      clearTimeout(toastDismissRef.current);
      toastDismissRef.current = null;
    }
    if (toastClearMsgRef.current) {
      clearTimeout(toastClearMsgRef.current);
      toastClearMsgRef.current = null;
    }
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

  useFocusEffect(
    useCallback(() => {
      const msg = takeQueuedLanguageSavedToast();
      if (msg) showLanguageSavedToast(msg);
      void (async () => {
        const local = await summaryFromLocalProfile();
        if (local) applySummaryToState(local);

        const summary =
          (await refreshSubscriptionEntitlements(userId)) ??
          (await getActiveSubscriptionSummary(userId));
        if (summary) {
          applySummaryToState(summary);
          return;
        }
        const profile = await getSubscriptionProfile(userId);
        if (profile?.status === "active") {
          applySummaryToState(activeSummaryFromProfile(profile));
          return;
        }
        if (!local) applySummaryToState(null);
      })();
    }, [
      applySummaryToState,
      showLanguageSavedToast,
      summaryFromLocalProfile,
      takeQueuedLanguageSavedToast,
      userId,
    ])
  );

  useEffect(
    () => () => {
      if (toastDismissRef.current) clearTimeout(toastDismissRef.current);
      if (toastClearMsgRef.current) clearTimeout(toastClearMsgRef.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const toggles = await loadSettingsToggles();
      if (cancelled) return;
      let on = toggles.notificationsOn;
      // Sync in-app toggle with OS state — do not auto-prompt on Settings open.
      if (on && Platform.OS !== "web" && !(await getOsNotificationsGranted())) {
        on = false;
        await setNotificationsEnabled(false);
      }
      if (!cancelled) setNotificationsOn(on);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onNotificationsChange = useCallback(
    (next: boolean) => {
      setNotificationsOn(next);
      void (async () => {
        await setNotificationsEnabled(next);
        if (!next || Platform.OS === "web") return;

        await ensureNotificationsReady();
        const granted = await getOsNotificationsGranted();
        if (granted) return;

        const osPermission = await Notifications.getPermissionsAsync();
        setNotificationsOn(false);
        await setNotificationsEnabled(false);

        const buttons: { text: string; style?: "cancel"; onPress?: () => void }[] = [
          { text: t("common.ok"), style: "cancel" },
        ];
        if (
          shouldOfferPermissionSettings(
            osPermission.status,
            osPermission.canAskAgain
          )
        ) {
          buttons.push({
            text: t("settings.notificationsOpenSettings"),
            onPress: () => {
              void Linking.openSettings();
            },
          });
        }
        Alert.alert(
          t("settings.notificationsDeniedTitle"),
          t("settings.notificationsDeniedBody"),
          buttons
        );
      })();
    },
    [t]
  );

  const onDarkModeChange = useCallback(
    (next: boolean) => {
      void setDarkMode(next);
    },
    [setDarkMode]
  );

  const onSubscriptionPlans = useCallback(() => {
    navigation.navigate("SubscriptionPlans");
  }, [navigation]);

  const onLanguage = useCallback(() => {
    navigation.navigate("Language");
  }, [navigation]);

  const onPrivacySecurity = useCallback(() => {
    navigation.navigate("PrivacySecurity");
  }, [navigation]);

  const onHelpCenter = useCallback(() => {
    navigation.navigate("HelpCenter");
  }, [navigation]);

  const onContactSupport = useCallback(() => {
    navigation.navigate("ContactSupport");
  }, [navigation]);


  const chevronColor = isDark
    ? "rgba(200, 206, 190, 0.45)"
    : "rgba(87, 92, 82, 0.45)";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StackScreenHeader title={t("settings.title")} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SettingsSectionTitle styles={styles}>
          {t("settings.sectionAccount")}
        </SettingsSectionTitle>
        <View style={styles.cardGroup}>
          <SettingsNavRow
            icon="workspace-premium"
            label={
              activeSummary?.isLifetime
                ? t("settings.rowMembership")
                : t("settings.rowSubscription")
            }
            subtitle={subscriptionSubtitle}
            onPress={onSubscriptionPlans}
            isFirst
            colors={colors}
            styles={styles}
            chevronColor={chevronColor}
          />
          <SettingsNavRow
            icon="language"
            label={t("settings.rowLanguage")}
            subtitle={languageSubtitle}
            onPress={onLanguage}
            isFirst={false}
            colors={colors}
            styles={styles}
            chevronColor={chevronColor}
          />
        </View>

        <SettingsSectionTitle styles={styles}>
          {t("settings.sectionApp")}
        </SettingsSectionTitle>
        <View style={styles.cardGroup}>
          <SettingsToggleRow
            icon="notifications"
            label={t("settings.rowNotifications")}
            value={notificationsOn}
            onValueChange={onNotificationsChange}
            isFirst
            colors={colors}
            styles={styles}
          />
          <SettingsToggleRow
            icon="dark-mode"
            label={t("settings.rowDarkMode")}
            value={isDark}
            onValueChange={onDarkModeChange}
            isFirst={false}
            colors={colors}
            styles={styles}
          />
          <SettingsNavRow
            icon="shield"
            label={t("settings.rowPrivacy")}
            onPress={onPrivacySecurity}
            isFirst={false}
            colors={colors}
            styles={styles}
            chevronColor={chevronColor}
          />
        </View>

        <SettingsSectionTitle styles={styles}>
          {t("settings.sectionSupport")}
        </SettingsSectionTitle>
        <View style={styles.cardGroup}>
          <SettingsNavRow
            icon="help-outline"
            label={t("settings.rowHelp")}
            onPress={onHelpCenter}
            isFirst
            colors={colors}
            styles={styles}
            chevronColor={chevronColor}
          />
          <SettingsNavRow
            icon="mail"
            label={t("settings.rowContact")}
            onPress={onContactSupport}
            isFirst={false}
            colors={colors}
            styles={styles}
            chevronColor={chevronColor}
          />
        </View>
      </ScrollView>
      {toastMessage ? (
        <ToastBanner
          visible={toastOpen}
          message={toastMessage}
          variant="success"
        />
      ) : null}
    </View>
  );
}
