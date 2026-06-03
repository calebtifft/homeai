import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { StackScreenHeader } from "../components/StackScreenHeader";
import {
  SUBSCRIPTION_PLANS,
  canPurchasePlanInApp,
  defaultMembershipSelection,
  isSubscriptionPlanDowngrade,
  isSubscriptionPlanUpgrade,
  type SubscriptionPlan,
  type SubscriptionPlanId,
} from "../constants/subscriptionPlans";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import type { LanguageId } from "../constants/languages";
import type { StringKey } from "../locales/strings";
import { translate } from "../locales/strings";
import type { PurchasesPackage } from "react-native-purchases";
import {
  applyPurchaseCustomerInfo,
  getSubscriptionOfferings,
  isPurchaseCancelledError,
  isRevenueCatAvailable,
  openSubscriptionManagement,
  planIdFromCustomerInfo,
  purchasePlan,
  refreshSubscriptionEntitlements,
  restorePurchases,
  type ActiveSubscriptionSummary,
} from "../services/subscriptionBilling";
import {
  activeSummaryFromProfile,
  getCachedSubscriptionProfile,
} from "../services/subscriptionProfile";
import { openLegalDocument } from "../services/openLegalDocument";
import { formatSubscriptionDate } from "../utils/subscriptionDisplay";
import type { RootStackParamList } from "../types";
import {
  Manrope,
  radius,
  type ThemePalette,
  type ThemeTypography,
} from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "SubscriptionPlans">;

function localizePlan(
  plan: SubscriptionPlan,
  languageId: LanguageId,
  livePrice?: string
): SubscriptionPlan {
  const id = plan.id;
  return {
    id,
    title: translate(languageId, `plan.${id}.title` as StringKey),
    periodLabel: translate(languageId, `plan.${id}.period` as StringKey),
    priceLine: livePrice ?? translate(languageId, `plan.${id}.priceLine` as StringKey),
    bullets: [
      translate(languageId, `plan.${id}.bullet0` as StringKey),
      translate(languageId, `plan.${id}.bullet1` as StringKey),
      translate(languageId, `plan.${id}.bullet2` as StringKey),
    ],
  };
}

function createPlanStyles(colors: ThemePalette, typography: ThemeTypography) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 10,
      maxWidth: 448,
      width: "100%",
      alignSelf: "center",
    },
    lead: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      marginBottom: 18,
      lineHeight: 20,
    },
    planRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 76,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: radius.lg,
      marginBottom: 12,
      borderWidth: 1.5,
      overflow: "hidden",
    },
    planRowIdle: {
      backgroundColor: colors.surfaceContainerLow,
      borderColor: "transparent",
    },
    planRowSelected: {
      backgroundColor: colors.surfaceContainerLow,
      borderColor: colors.primaryDim,
    },
    planRowDisabled: {
      opacity: 0.48,
    },
    planSubtitleLocked: {
      ...typography.caption,
      color: colors.onSurfaceVariant,
      lineHeight: 16,
      marginTop: 2,
    },
    planTextCol: {
      flex: 1,
      paddingRight: 12,
    },
    planTitle: {
      fontFamily: Manrope.bold,
      fontSize: 17,
      letterSpacing: -0.2,
      color: colors.onSurface,
    },
    planSubtitle: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      lineHeight: 18,
    },
    planPrice: {
      fontFamily: Manrope.extraBold,
      fontSize: 17,
      letterSpacing: -0.25,
      color: colors.onSurface,
      textAlign: "right",
      maxWidth: "46%",
    },
    ctaBlock: {
      marginTop: 8,
      marginBottom: 12,
    },
    restoreBtn: {
      alignSelf: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    restoreLabel: {
      fontFamily: Manrope.semiBold,
      fontSize: 14,
      color: colors.primary,
    },
    footnote: {
      ...typography.caption,
      color: colors.onSurfaceVariant,
      textAlign: "center",
      lineHeight: 18,
      paddingHorizontal: 4,
    },
    legalRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      marginTop: 12,
      paddingHorizontal: 4,
    },
    legalLink: {
      fontFamily: Manrope.semiBold,
      fontSize: 13,
      color: colors.primary,
      textDecorationLine: "underline",
    },
    legalSeparator: {
      ...typography.caption,
      color: colors.onSurfaceVariant,
    },
    activeBanner: {
      borderRadius: radius.lg,
      padding: 16,
      marginBottom: 18,
      backgroundColor: colors.primaryContainer,
      borderWidth: 1,
      borderColor: colors.primaryDim,
    },
    activeBannerTitle: {
      fontFamily: Manrope.bold,
      fontSize: 16,
      color: colors.onSurface,
      marginBottom: 6,
    },
    activeBannerBody: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      lineHeight: 20,
    },
    activeChip: {
      alignSelf: "flex-start",
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    activeChipText: {
      fontFamily: Manrope.bold,
      fontSize: 11,
      letterSpacing: 0.4,
      color: colors.onPrimary,
      textTransform: "uppercase",
    },
    planTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 4,
    },
    planActivePill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    planActivePillText: {
      fontFamily: Manrope.bold,
      fontSize: 10,
      letterSpacing: 0.35,
      color: colors.onPrimary,
      textTransform: "uppercase",
    },
    planUpgradePill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      borderWidth: 1,
      borderColor: colors.primaryDim,
    },
    planUpgradePillText: {
      fontFamily: Manrope.bold,
      fontSize: 10,
      letterSpacing: 0.35,
      color: colors.primary,
      textTransform: "uppercase",
    },
    membershipCard: {
      borderRadius: radius.lg,
      padding: 20,
      marginBottom: 20,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.primaryDim,
    },
    membershipIconRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    membershipTitle: {
      fontFamily: Manrope.bold,
      fontSize: 20,
      letterSpacing: -0.3,
      color: colors.onSurface,
    },
    membershipBullet: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      lineHeight: 22,
      marginBottom: 8,
      paddingLeft: 4,
    },
  });
}

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental != null
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function SubscriptionPlanRow({
  plan,
  selected,
  isActivePlan,
  isUpgradeOption,
  locked,
  lockedSubtitle,
  onSelect,
  styles,
  activeLabel,
  upgradeLabel,
}: {
  plan: SubscriptionPlan;
  selected: boolean;
  isActivePlan: boolean;
  isUpgradeOption: boolean;
  locked: boolean;
  lockedSubtitle?: string;
  onSelect: () => void;
  styles: ReturnType<typeof createPlanStyles>;
  activeLabel: string;
  upgradeLabel: string;
}) {
  const { isDark, colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const prevSelected = useRef(false);

  const androidRipple =
    Platform.OS === "android"
      ? {
          color: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.07)",
        }
      : undefined;

  useEffect(() => {
    if (selected && !prevSelected.current) {
      scale.setValue(0.986);
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 132,
        useNativeDriver: true,
      }).start();
    }
    prevSelected.current = selected;
  }, [selected, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={locked ? undefined : onSelect}
        disabled={locked}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: locked }}
        android_ripple={locked ? undefined : androidRipple}
        style={({ pressed }) => [
          styles.planRow,
          selected ? styles.planRowSelected : styles.planRowIdle,
          locked && styles.planRowDisabled,
          isActivePlan && {
            borderColor: colors.primary,
            backgroundColor: isDark
              ? "rgba(52, 143, 104, 0.12)"
              : "rgba(52, 143, 104, 0.08)",
          },
          !locked &&
            pressed &&
            (Platform.OS === "ios"
              ? { opacity: 0.9, transform: [{ scale: 0.985 }] }
              : { opacity: 0.97 }),
        ]}
      >
        <View style={styles.planTextCol}>
          <View style={styles.planTitleRow}>
            <Text style={styles.planTitle}>{plan.title}</Text>
            {isActivePlan ? (
              <View style={styles.planActivePill}>
                <Text style={styles.planActivePillText}>{activeLabel}</Text>
              </View>
            ) : isUpgradeOption ? (
              <View style={styles.planUpgradePill}>
                <Text style={styles.planUpgradePillText}>{upgradeLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.planSubtitle}>{plan.periodLabel}</Text>
          {locked && lockedSubtitle ? (
            <Text style={styles.planSubtitleLocked}>{lockedSubtitle}</Text>
          ) : null}
        </View>
        <Text style={styles.planPrice} numberOfLines={2}>
          {plan.priceLine}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function SubscriptionPlansScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { languageId, t } = useLanguage();
  const { user } = useAuth();
  const { colors, typography } = useTheme();
  const [selectedId, setSelectedId] = useState<SubscriptionPlanId>("year");
  const [pricesByPlan, setPricesByPlan] = useState<
    Partial<Record<SubscriptionPlanId, string>>
  >({});
  const [packagesByPlan, setPackagesByPlan] = useState<
    Partial<Record<SubscriptionPlanId, PurchasesPackage>>
  >({});
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [activeSummary, setActiveSummary] =
    useState<ActiveSubscriptionSummary | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  const styles = useMemo(
    () => createPlanStyles(colors, typography),
    [colors, typography]
  );

  const userId = user?.id ?? null;

  const refreshEntitlements = useCallback(async () => {
    setRefreshing(true);
    try {
      const cached = await getCachedSubscriptionProfile();
      if (cached?.status === "active") {
        const fromCache = activeSummaryFromProfile(cached);
        setActiveSummary(fromCache);
        setSelectedId(defaultMembershipSelection(fromCache.planId));
      }
      const summary = await refreshSubscriptionEntitlements(userId);
      if (summary) {
        setActiveSummary(summary);
        setSelectedId(defaultMembershipSelection(summary.planId));
      }
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refreshEntitlements();
    }, [refreshEntitlements])
  );

  useEffect(() => {
    if (!isRevenueCatAvailable()) return;
    let cancelled = false;
    void (async () => {
      const { pricesByPlan: live, packagesByPlan: pkgs } =
        await getSubscriptionOfferings(userId);
      if (!cancelled) {
        setPricesByPlan(live);
        setPackagesByPlan(pkgs);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const localizedPlans = useMemo(
    () =>
      SUBSCRIPTION_PLANS.map((p) =>
        localizePlan(p, languageId, pricesByPlan[p.id])
      ),
    [languageId, pricesByPlan]
  );

  const selectedPlan = useMemo(
    () =>
      localizedPlans.find((p) => p.id === selectedId) ?? localizedPlans[0],
    [localizedPlans, selectedId]
  );

  const billingReady = isRevenueCatAvailable();
  const hasActivePlan = activeSummary != null;
  const isLifetimeMember = activeSummary?.isLifetime === true;
  const isRecurringMember = hasActivePlan && !isLifetimeMember;
  const isCurrentSelection =
    hasActivePlan && activeSummary.planId === selectedId;

  const activePlanId = activeSummary?.planId ?? null;

  const isSelectedDowngrade =
    hasActivePlan &&
    activePlanId != null &&
    isSubscriptionPlanDowngrade(selectedId, activePlanId);

  const canPurchaseSelected = canPurchasePlanInApp(selectedId, activePlanId);

  const showManagePrimaryCta =
    isRecurringMember && isCurrentSelection && !canPurchaseSelected;

  const isSelectedUpgrade =
    hasActivePlan &&
    activePlanId != null &&
    isSubscriptionPlanUpgrade(selectedId, activePlanId);

  const planLockedSubtitle = useCallback(
    (planId: SubscriptionPlanId): string | undefined => {
      if (!activePlanId || !isSubscriptionPlanDowngrade(planId, activePlanId)) {
        return undefined;
      }
      if (activeSummary?.expiresAt) {
        const date = formatSubscriptionDate(
          activeSummary.expiresAt,
          languageId
        );
        return t("subscription.planLockedUntilRenewal", { date });
      }
      return t("subscription.planLockedDowngrade");
    },
    [activePlanId, activeSummary?.expiresAt, languageId, t]
  );

  const screenTitle = isLifetimeMember
    ? t("nav.membership")
    : hasActivePlan
      ? t("nav.membership")
      : t("nav.subscribe");

  const lifetimePlan = useMemo(
    () => localizedPlans.find((p) => p.id === "lifetime") ?? localizedPlans[0],
    [localizedPlans]
  );

  const activeBannerBody = useMemo(() => {
    if (!activeSummary) return "";
    if (activeSummary.isLifetime) {
      return t("subscription.activeBannerLifetime");
    }
    if (activeSummary.expiresAt) {
      const date = formatSubscriptionDate(activeSummary.expiresAt, languageId);
      return activeSummary.willRenew
        ? t("subscription.activeBannerRenewal", { date })
        : t("subscription.activeBannerExpires", { date });
    }
    const planTitle = translate(
      languageId,
      `plan.${activeSummary.planId}.title` as StringKey
    );
    return t("subscription.settingsSubtitlePlan", { plan: planTitle });
  }, [activeSummary, languageId, t]);

  const ctaTitle = useMemo(() => {
    if (purchasing) return t("subscription.purchasing");
    if (showManagePrimaryCta) return t("subscription.manage");
    if (isCurrentSelection) return t("subscription.currentPlan");
    if (isSelectedUpgrade) {
      const planTitle = translate(
        languageId,
        `plan.${selectedId}.title` as StringKey
      );
      return t("subscription.upgradeToPlan", { plan: planTitle });
    }
    return t("subscription.continue");
  }, [
    isCurrentSelection,
    isSelectedUpgrade,
    languageId,
    purchasing,
    selectedId,
    showManagePrimaryCta,
    t,
  ]);

  const onManageSubscription = useCallback(() => {
    void openSubscriptionManagement().then((opened) => {
      if (opened) return;
      Alert.alert(
        t("subscription.manageFailedTitle"),
        t("subscription.manageFailedBody")
      );
    });
  }, [t]);

  const onContinue = useCallback(async () => {
    if (showManagePrimaryCta) {
      onManageSubscription();
      return;
    }
    if (isCurrentSelection) return;
    if (hasActivePlan && !canPurchaseSelected) return;
    if (isSelectedDowngrade && activePlanId) {
      const currentTitle = translate(
        languageId,
        `plan.${activePlanId}.title` as StringKey
      );
      const date =
        activeSummary?.expiresAt != null
          ? formatSubscriptionDate(activeSummary.expiresAt, languageId)
          : null;
      Alert.alert(
        t("subscription.downgradeBlockedTitle"),
        date
          ? t("subscription.downgradeBlockedBody", {
              current: currentTitle,
              date,
            })
          : t("subscription.downgradeBlockedBodyNoDate", {
              current: currentTitle,
            })
      );
      return;
    }
    if (isLifetimeMember) {
      Alert.alert(
        t("subscription.lifetimeStatusTitle"),
        t("subscription.lifetimeAlreadyOwnedBody")
      );
      return;
    }
    if (!billingReady) {
      Alert.alert(
        t("subscription.billingUnavailableTitle"),
        t("subscription.billingUnavailableBody")
      );
      return;
    }
    if (purchasing) return;
    setPurchasing(true);
    try {
      const { active, customerInfo } = await purchasePlan(selectedId, userId, {
        pkg: packagesByPlan[selectedId],
      });
      if (active) {
        const summary = await applyPurchaseCustomerInfo(
          customerInfo,
          userId,
          selectedId
        );
        if (summary) {
          setActiveSummary(summary);
          setSelectedId(defaultMembershipSelection(summary.planId));
        }
        const planTitle =
          summary != null
            ? translate(languageId, `plan.${summary.planId}.title` as StringKey)
            : selectedPlan.title;
        Alert.alert(
          t("subscription.purchaseSuccessTitle"),
          isSelectedUpgrade
            ? t("subscription.upgradeSuccessBody", { plan: planTitle })
            : hasActivePlan
              ? t("subscription.switchSuccessBody", { plan: planTitle })
              : t("subscription.purchaseSuccessBody", { plan: planTitle })
        );
        return;
      }
      Alert.alert(
        t("subscription.purchaseFailedTitle"),
        t("subscription.purchaseInactiveBody")
      );
    } catch (e) {
      if (isPurchaseCancelledError(e)) return;
      // Test Store / flaky network: purchase may have succeeded locally while receipt POST failed.
      try {
        const recovered = await refreshSubscriptionEntitlements(userId);
        if (recovered) {
          setActiveSummary(recovered);
          setSelectedId(defaultMembershipSelection(recovered.planId));
          const planTitle = translate(
            languageId,
            `plan.${recovered.planId}.title` as StringKey
          );
          Alert.alert(
            t("subscription.purchaseSuccessTitle"),
            t("subscription.purchaseSuccessBody", { plan: planTitle })
          );
          return;
        }
      } catch {
        /* fall through to error alert */
      }
      const msg =
        e instanceof Error ? e.message : t("subscription.purchaseFailedBody");
      const isTimeout = /timed out/i.test(msg);
      Alert.alert(
        t("subscription.purchaseFailedTitle"),
        isTimeout ? t("subscription.purchaseTimeoutBody") : msg
      );
    } finally {
      setPurchasing(false);
    }
  }, [
    billingReady,
    packagesByPlan,
    purchasing,
    selectedId,
    selectedPlan.title,
    t,
    userId,
    isCurrentSelection,
    hasActivePlan,
    isLifetimeMember,
    isSelectedDowngrade,
    isSelectedUpgrade,
    activePlanId,
    activeSummary?.expiresAt,
    canPurchaseSelected,
    showManagePrimaryCta,
    onManageSubscription,
    languageId,
  ]);

  const onRestore = useCallback(async () => {
    if (!billingReady) {
      Alert.alert(
        t("subscription.restoreTitle"),
        t("subscription.restoreUnavailableBody")
      );
      return;
    }
    if (restoring) return;
    setRestoring(true);
    try {
      const { active, customerInfo } = await restorePurchases(userId);
      if (active) {
        const restoredPlanId = planIdFromCustomerInfo(customerInfo);
        const summary = await applyPurchaseCustomerInfo(
          customerInfo,
          userId,
          restoredPlanId
        );
        if (summary) {
          setActiveSummary(summary);
          setSelectedId(defaultMembershipSelection(summary.planId));
        }
        const restoredTitle = translate(
          languageId,
          `plan.${restoredPlanId}.title` as StringKey
        );
        Alert.alert(
          t("subscription.restoreTitle"),
          t("subscription.restoreSuccessPlanBody", { plan: restoredTitle })
        );
      } else {
        Alert.alert(
          t("subscription.restoreTitle"),
          t("subscription.restoreNoPurchaseBody")
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("subscription.restoreFailedBody");
      Alert.alert(t("subscription.restoreTitle"), msg);
    } finally {
      setRestoring(false);
    }
  }, [billingReady, restoring, languageId, t, userId]);

  const onSelectPlan = useCallback(
    (id: SubscriptionPlanId) => {
      if (
        activePlanId &&
        isSubscriptionPlanDowngrade(id, activePlanId)
      ) {
        return;
      }
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          180,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity
        )
      );
      setSelectedId(id);
    },
    [activePlanId]
  );

  const openPrivacy = useCallback(() => {
    void openLegalDocument("privacy", {
      unavailableTitle: t("legal.openFailedTitle"),
      unavailableBody: t("legal.openFailedBody"),
    });
  }, [t]);

  const openTerms = useCallback(() => {
    void openLegalDocument("terms", {
      unavailableTitle: t("legal.openFailedTitle"),
      unavailableBody: t("legal.openFailedBody"),
    });
  }, [t]);

  return (
    <View style={styles.root}>
      <StackScreenHeader title={screenTitle} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLifetimeMember ? (
          <>
            <Text style={styles.lead}>{t("subscription.lifetimeLead")}</Text>
            <View style={styles.membershipCard}>
              <View style={styles.membershipIconRow}>
                <MaterialIcons name="workspace-premium" size={28} color={colors.primary} />
                <Text style={styles.membershipTitle}>
                  {t("subscription.lifetimeStatusTitle")}
                </Text>
              </View>
              <Text style={styles.activeBannerBody}>
                {t("subscription.activeBannerLifetime")}
              </Text>
              {lifetimePlan.bullets.map((bullet) => (
                <Text key={bullet} style={styles.membershipBullet}>
                  • {bullet}
                </Text>
              ))}
              <Text style={[styles.footnote, { marginTop: 12, textAlign: "left" }]}>
                {t("subscription.lifetimeNoRenewal")}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.lead}>
              {hasActivePlan
                ? t("subscription.leadActive")
                : t("subscription.lead")}
            </Text>

            {hasActivePlan ? (
              <View style={styles.activeBanner}>
                <Text style={styles.activeBannerTitle}>
                  {t("subscription.activeBannerTitle")}
                </Text>
                <Text style={styles.activeBannerBody}>{activeBannerBody}</Text>
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>
                    {t("subscription.activeBadge")}
                  </Text>
                </View>
              </View>
            ) : null}

            {localizedPlans.map((plan) => {
              const locked =
                activePlanId != null &&
                isSubscriptionPlanDowngrade(plan.id, activePlanId);
              const isUpgradeOption =
                activePlanId != null &&
                isSubscriptionPlanUpgrade(plan.id, activePlanId);
              return (
                <SubscriptionPlanRow
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selectedId}
                  isActivePlan={activeSummary?.planId === plan.id}
                  isUpgradeOption={isUpgradeOption}
                  locked={locked}
                  lockedSubtitle={planLockedSubtitle(plan.id)}
                  activeLabel={t("subscription.activeBadge")}
                  upgradeLabel={t("subscription.upgradeBadge")}
                  onSelect={() => onSelectPlan(plan.id)}
                  styles={styles}
                />
              );
            })}

            <View style={styles.ctaBlock}>
              <PrimaryCTA
                title={ctaTitle}
                onPress={() =>
                  void (showManagePrimaryCta
                    ? onManageSubscription()
                    : onContinue())
                }
                loading={purchasing}
                disabled={
                  restoring ||
                  purchasing ||
                  (refreshing && !hasActivePlan) ||
                  (!showManagePrimaryCta &&
                    !isSelectedUpgrade &&
                    (isCurrentSelection || isSelectedDowngrade))
                }
              />
            </View>

            {isRecurringMember && !showManagePrimaryCta ? (
              <Pressable
                onPress={onManageSubscription}
                disabled={purchasing || restoring || refreshing}
                style={styles.restoreBtn}
                accessibilityRole="button"
              >
                <Text style={styles.restoreLabel}>{t("subscription.manage")}</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Pressable
          onPress={() => void onRestore()}
          disabled={purchasing || restoring || refreshing}
          style={styles.restoreBtn}
          accessibilityRole="button"
        >
          <Text style={styles.restoreLabel}>
            {restoring ? t("subscription.restoring") : t("subscription.restore")}
          </Text>
        </Pressable>

        {!isLifetimeMember ? (
          <Text style={styles.footnote}>{t("subscription.footnote")}</Text>
        ) : null}

        <View style={styles.legalRow}>
          <Pressable
            onPress={openPrivacy}
            accessibilityRole="link"
            accessibilityLabel={t("subscription.legalPrivacyA11y")}
          >
            <Text style={styles.legalLink}>{t("legal.privacy")}</Text>
          </Pressable>
          <Text style={styles.legalSeparator} accessibilityElementsHidden>
            ·
          </Text>
          <Pressable
            onPress={openTerms}
            accessibilityRole="link"
            accessibilityLabel={t("subscription.legalTermsA11y")}
          >
            <Text style={styles.legalLink}>{t("legal.terms")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
