import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  type ViewStyle,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { openSubscriptionManagement } from "../services/subscriptionBilling";
import { isExpoGoClient } from "../services/subscriptionManage";
import type { StagingAccessResult } from "../services/subscriptionAccess";
import { subscribeSubscriptionChange } from "../services/subscriptionEvents";
import { FREE_STAGING_DAILY_LIMIT } from "../services/stagingUsage";
import type { SubscriptionPlanId } from "../constants/subscriptionPlans";
import {
  formatSubscriptionDate,
  proModalTitleKey,
} from "../utils/subscriptionDisplay";
import type { RootStackParamList } from "../types";
import { Manrope, radius } from "../theme/curatedCanvas";
import { subscriptionBadgeTheme as theme } from "../theme/subscriptionBadgeTheme";

type Nav = NavigationProp<RootStackParamList>;

async function loadBadgeAccess(
  userId: string | null,
  options?: { force?: boolean }
): Promise<StagingAccessResult> {
  if (options?.force) {
    const { refreshSubscriptionEntitlements } = await import(
      "../services/subscriptionBilling"
    );
    await refreshSubscriptionEntitlements(userId, { force: true });
  }
  const { resolveBadgeAccess } = await import("../services/subscriptionAccess");
  return resolveBadgeAccess(userId);
}

function UpgradeModalButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={upgradeBtnStyles.outer}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          upgradeBtnStyles.press,
          pressed && upgradeBtnStyles.pressActive,
        ]}
      >
        <LinearGradient
          colors={[...theme.upgradeGradient]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            "rgba(255,255,255,0.38)",
            "rgba(255,255,255,0.12)",
            "rgba(255,255,255,0)",
          ]}
          locations={[0, 0.42, 1]}
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.72, y: 1 }}
          style={upgradeBtnStyles.gloss}
        />
        <View pointerEvents="none" style={upgradeBtnStyles.topEdge} />
        <Text style={upgradeBtnStyles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

function PrimaryModalButton({
  label,
  onPress,
  colors,
  glowShadow,
}: {
  label: string;
  onPress: () => void;
  colors: { primary: string; primaryDim: string; onPrimary: string };
  glowShadow: ViewStyle;
}) {
  return (
    <View style={[primaryBtnStyles.outer, glowShadow]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          primaryBtnStyles.press,
          pressed && primaryBtnStyles.pressActive,
        ]}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDim]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={[primaryBtnStyles.label, { color: colors.onPrimary }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function ModalCloseButton({
  onPress,
  a11y,
  isDark,
}: {
  onPress: () => void;
  a11y: string;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        modalCloseStyles.btn,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.14)"
            : "rgba(0,0,0,0.07)",
        },
      ]}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <MaterialIcons
        name="close"
        size={20}
        color={isDark ? "#F5F5F0" : "#2B2E26"}
      />
    </Pressable>
  );
}

const modalCloseStyles = StyleSheet.create({
  btn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 3,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});

const primaryBtnStyles = StyleSheet.create({
  outer: {
    marginTop: 8,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  press: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pressActive: {
    opacity: 0.92,
  },
  label: {
    fontFamily: Manrope.bold,
    fontSize: 16,
    letterSpacing: 0.2,
    zIndex: 1,
  },
});

const upgradeBtnStyles = StyleSheet.create({
  outer: {
    marginTop: 6,
    borderRadius: radius.full,
    overflow: "hidden",
    shadowColor: "#D81B7A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 6,
  },
  press: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pressActive: {
    opacity: 0.9,
  },
  gloss: {
    ...StyleSheet.absoluteFillObject,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.45)",
    borderRadius: 1,
  },
  label: {
    fontFamily: Manrope.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: 0.3,
    zIndex: 1,
  },
});

function ModalProHero({ isDark }: { isDark: boolean }) {
  return (
    <View style={heroStyles.cluster} pointerEvents="none">
      <View style={heroStyles.medallionOuter}>
        <LinearGradient
          colors={isDark ? ["#8D6E00", "#FFB300", "#FF8F00"] : ["#FFE082", "#FFB300", "#FF8F00"]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={heroStyles.medallion}
        >
          <MaterialIcons name="workspace-premium" size={40} color="#FFFFFF" />
        </LinearGradient>
      </View>
    </View>
  );
}

function ModalLifetimeHero({ isDark }: { isDark: boolean }) {
  const medallionColors = isDark
    ? [...theme.lifetimeMedallionDark]
    : [...theme.lifetimeMedallion];
  return (
    <View style={heroStyles.cluster} pointerEvents="none">
      <View style={heroStyles.lifetimeRing} />
      <View style={heroStyles.medallionOuter}>
        <LinearGradient
          colors={medallionColors}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={[heroStyles.medallion, heroStyles.lifetimeMedallion]}
        >
          <MaterialIcons name="all-inclusive" size={38} color="#FFFFFF" />
        </LinearGradient>
      </View>
    </View>
  );
}

function ModalStarHero() {
  return (
    <View style={heroStyles.cluster} pointerEvents="none">
      <MaterialIcons
        name="star"
        size={14}
        color="#F06A9A"
        style={[heroStyles.sparkle, { top: 18, left: 52 }]}
      />
      <MaterialIcons
        name="star"
        size={18}
        color="#F48AAF"
        style={[heroStyles.sparkle, { top: 42, right: 48 }]}
      />
      <MaterialIcons
        name="star"
        size={12}
        color="#F9A8C4"
        style={[heroStyles.sparkle, { bottom: 28, left: 72 }]}
      />
      <View style={heroStyles.mainStarWrap}>
        <LinearGradient
          colors={["#FFB8D0", "#FF6B9D", "#E91E8C"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={heroStyles.mainStarBg}
        >
          <MaterialIcons name="star" size={52} color="#FFFFFF" />
        </LinearGradient>
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  cluster: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  sparkle: {
    position: "absolute",
    opacity: 0.95,
  },
  medallionOuter: {
    shadowColor: "#B8860B",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  medallion: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
  },
  lifetimeMedallion: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  lifetimeRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: "rgba(184, 134, 11, 0.35)",
  },
});

export function FreeStagingUsageBadge() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { languageId, t } = useLanguage();
  const { colors, isDark, ambientShadow, primaryGlowShadow } = useTheme();
  const [access, setAccess] = useState<StagingAccessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback((options?: { force?: boolean }) => {
    setLoading(true);
    void loadBadgeAccess(user?.id ?? null, options).then((result) => {
      setAccess(result);
      setLoading(false);
    });
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(
    () =>
      subscribeSubscriptionChange(() => {
        refresh({ force: true });
      }),
    [refresh]
  );

  useEffect(() => {
    setModalOpen(false);
  }, [access?.isPro, access?.isLifetime, access?.planId]);

  const modalStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.42)",
          justifyContent: "center",
          paddingHorizontal: 32,
        },
        card: {
          borderRadius: 26,
          overflow: "hidden",
          backgroundColor: isDark ? colors.surfaceContainerLow : "#FFFFFF",
          maxWidth: 340,
          width: "100%",
          alignSelf: "center",
        },
        header: {
          position: "relative",
          paddingTop: 12,
          paddingBottom: 20,
          paddingHorizontal: 20,
          alignItems: "center",
        },
        headerTitle: {
          fontFamily: Manrope.bold,
          fontSize: 20,
          letterSpacing: -0.3,
          marginTop: 12,
          textAlign: "center",
        },
        headerTagline: {
          fontFamily: Manrope.medium,
          fontSize: 13,
          marginTop: 6,
          textAlign: "center",
          opacity: 0.88,
        },
        body: {
          paddingHorizontal: 22,
          paddingTop: 18,
          paddingBottom: 22,
        },
        paragraph: {
          fontFamily: Manrope.medium,
          fontSize: 15,
          lineHeight: 22,
          color: isDark ? colors.onSurface : "#1A1A1A",
          marginBottom: 14,
        },
        muted: {
          fontFamily: Manrope.medium,
          fontSize: 13,
          lineHeight: 19,
          color: colors.onSurfaceVariant,
          marginBottom: 12,
        },
        modalTitle: {
          fontFamily: Manrope.bold,
          fontSize: 18,
          marginBottom: 4,
        },
      }),
    [colors, isDark]
  );

  if (loading && !access) {
    return (
      <View style={[styles.chip, styles.loadingChip]}>
        <Text style={styles.loadingText}>…</Text>
      </View>
    );
  }

  if (!access) {
    return null;
  }

  const closeModal = () => setModalOpen(false);

  if (access.isPro) {
    const planId: SubscriptionPlanId = access.planId ?? "year";
    const isLifetime = access.isLifetime;
    const lifetimeIconColor = isDark
      ? theme.lifetimeIconDark
      : theme.lifetimeIconLight;
    const formattedDate =
      access.expiresAt != null
        ? formatSubscriptionDate(access.expiresAt, languageId)
        : null;
    const proBody =
      isLifetime
        ? t("pro.modalBodyLifetime")
        : formattedDate != null
          ? access.willRenew
            ? t("pro.modalBodyRenewal", { date: formattedDate })
            : t("pro.modalBodyExpires", { date: formattedDate })
          : t("pro.badgeA11y");
    const proTitle = t(proModalTitleKey(planId));
    const badgeA11y = isLifetime
      ? t("pro.badgeA11yLifetime")
      : t("pro.badgeA11y");

    const onManage = () => {
      closeModal();
      void openSubscriptionManagement().then((opened) => {
        if (opened) return;
        Alert.alert(
          t("subscription.manageFailedTitle"),
          isExpoGoClient()
            ? t("subscription.manageExpoGoBody")
            : t("subscription.manageFailedBody")
        );
      });
    };

    const onViewMembership = () => {
      closeModal();
      navigation.navigate("SubscriptionPlans");
    };

    return (
      <>
        <Pressable
          onPress={() => setModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={badgeA11y}
          style={({ pressed }) => [
            styles.chip,
            isLifetime ? styles.lifetimeChip : styles.proChip,
            pressed && styles.chipPressed,
          ]}
        >
          {isLifetime ? (
            <LinearGradient
              colors={
                isDark
                  ? [...theme.lifetimeGradientDark]
                  : [...theme.lifetimeGradient]
              }
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[
                styles.lifetimeChipInner,
                {
                  borderColor: isDark
                    ? "rgba(255, 213, 79, 0.55)"
                    : theme.proBorder,
                },
              ]}
            >
              <View style={styles.row}>
                <MaterialIcons
                  name="workspace-premium"
                  size={17}
                  color={lifetimeIconColor}
                />
                <MaterialIcons
                  name="all-inclusive"
                  size={17}
                  color={lifetimeIconColor}
                />
              </View>
            </LinearGradient>
          ) : (
            <View style={styles.proChipInner}>
              <MaterialIcons
                name="workspace-premium"
                size={18}
                color={theme.proFg}
              />
            </View>
          )}
        </Pressable>

        <Modal
          visible={modalOpen}
          transparent
          animationType="fade"
          onRequestClose={closeModal}
          statusBarTranslucent
        >
          <Pressable style={modalStyles.backdrop} onPress={closeModal}>
            <Pressable
              style={[modalStyles.card, ambientShadow]}
              onPress={() => {}}
            >
              <View style={modalStyles.header}>
                <LinearGradient
                  colors={
                    isLifetime
                      ? isDark
                        ? [...theme.lifetimeModalGradientDark]
                        : [...theme.lifetimeModalGradient]
                      : isDark
                        ? [...theme.proModalGradientDark]
                        : [...theme.proModalGradient]
                  }
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <ModalCloseButton
                  onPress={closeModal}
                  a11y={t("pro.modalCloseA11y")}
                  isDark={isDark}
                />
                {isLifetime ? (
                  <ModalLifetimeHero isDark={isDark} />
                ) : (
                  <ModalProHero isDark={isDark} />
                )}
                <Text
                  style={[
                    modalStyles.headerTitle,
                    {
                      color: isDark ? "#FFF8E7" : isLifetime ? "#3E2723" : "#2B2E26",
                    },
                  ]}
                >
                  {proTitle}
                </Text>
                {isLifetime ? (
                  <Text
                    style={[
                      modalStyles.headerTagline,
                      { color: isDark ? "#E8D5A8" : "#5D4E37" },
                    ]}
                  >
                    {t("pro.modalLifetimeTagline")}
                  </Text>
                ) : null}
              </View>

              <View style={modalStyles.body}>
                <Text style={modalStyles.paragraph}>{proBody}</Text>
                {isLifetime ? (
                  <>
                    <Text style={modalStyles.muted}>
                      {t("subscription.lifetimeNoRenewal")}
                    </Text>
                    <PrimaryModalButton
                      label={t("pro.modalViewMembership")}
                      onPress={onViewMembership}
                      colors={colors}
                      glowShadow={primaryGlowShadow}
                    />
                  </>
                ) : (
                  <PrimaryModalButton
                    label={t("pro.modalManage")}
                    onPress={onManage}
                    colors={colors}
                    glowShadow={primaryGlowShadow}
                  />
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  const limit = access.dailyLimit || FREE_STAGING_DAILY_LIMIT;
  const displayRemaining = Math.max(0, limit - access.dailyCount);
  const exhausted = displayRemaining <= 0 && !access.allowed;
  const countLabel = String(displayRemaining);
  const a11y = t("usage.remainingBanner", { remaining: displayRemaining });

  const onUpgrade = () => {
    closeModal();
    navigation.navigate("SubscriptionPlans");
  };

  return (
    <>
      <Pressable
        onPress={() => setModalOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={({ pressed }) => [
          styles.chip,
          styles.freeChip,
          exhausted && styles.freeChipExhausted,
          pressed && styles.chipPressed,
        ]}
      >
        <View style={styles.row}>
          <MaterialIcons
            name="star"
            size={17}
            color={exhausted ? "#B3261E" : theme.freeFg}
          />
          <Text
            style={[
              styles.count,
              { color: exhausted ? "#B3261E" : theme.freeFg },
            ]}
          >
            {countLabel}
          </Text>
        </View>
      </Pressable>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <Pressable style={modalStyles.backdrop} onPress={closeModal}>
          <Pressable
            style={[modalStyles.card, ambientShadow]}
            onPress={() => {}}
          >
            <View style={modalStyles.header}>
              <LinearGradient
                colors={[...theme.freeModalGradient]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <ModalCloseButton
                onPress={closeModal}
                a11y={t("usage.modalCloseA11y")}
                isDark={isDark}
              />
              <ModalStarHero />
            </View>

            <View style={modalStyles.body}>
              <Text style={[modalStyles.paragraph, modalStyles.modalTitle]}>
                {t("subscription.settingsSubtitleFree")}
              </Text>
              <Text style={modalStyles.paragraph}>
                {t("usage.remainingBanner", { remaining: displayRemaining })}
              </Text>
              <Text style={modalStyles.paragraph}>
                {t("usage.modalParagraph1", { limit })}
              </Text>
              <Text style={modalStyles.paragraph}>
                {t("usage.modalParagraph2")}
              </Text>
              {access.devUnlimitedFreeTier ? (
                <Text style={modalStyles.muted}>{t("usage.modalDevBypass")}</Text>
              ) : null}

              <UpgradeModalButton
                label={t("usage.modalUpgrade")}
                onPress={onUpgrade}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    minWidth: 40,
    minHeight: 32,
    borderRadius: radius.full,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  chipPressed: {
    opacity: 0.88,
  },
  loadingChip: {
    backgroundColor: theme.freeBg,
    borderWidth: 1,
    borderColor: theme.freeBorder,
    paddingHorizontal: 12,
  },
  loadingText: {
    fontFamily: Manrope.bold,
    fontSize: 16,
    color: theme.freeFg,
    lineHeight: 20,
  },
  freeChip: {
    backgroundColor: theme.freeBg,
    borderWidth: 1,
    borderColor: theme.freeBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  freeChipExhausted: {
    backgroundColor: "#FCEAE8",
    borderColor: "#B3261E",
  },
  proChip: {
    backgroundColor: theme.proBg,
    borderWidth: 1,
    borderColor: theme.proBorder,
  },
  proChipInner: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  lifetimeChip: {
    borderWidth: 1,
    borderColor: theme.proBorder,
    shadowColor: "#FFB300",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  lifetimeChipInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  count: {
    fontFamily: Manrope.bold,
    fontSize: 15,
    letterSpacing: -0.2,
    minWidth: 10,
    textAlign: "center",
  },
});
