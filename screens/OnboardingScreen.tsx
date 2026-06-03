import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  type ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppLogo } from "../components/AppLogo";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { setOnboardingComplete } from "../services/onboardingPreferences";
import type { RootStackParamList } from "../types";
import { Manrope, radius } from "../theme/curatedCanvas";

const PAGE_COUNT = 3;

function OnboardingPageScroll({
  pageWidth,
  bottomReserve,
  children,
}: {
  pageWidth: number;
  bottomReserve: number;
  children: ReactNode;
}) {
  return (
    <View style={{ width: pageWidth, flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 12 + bottomReserve,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        bounces
        alwaysBounceVertical={false}
        nestedScrollEnabled
        contentInsetAdjustmentBehavior="never"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useLanguage();
  const { colors, typography } = useTheme();
  const pageWidth = windowWidth;
  const listRef = useRef<FlatList<number> | null>(null);
  const [page, setPage] = useState(0);

  const finish = useCallback(async () => {
    await setOnboardingComplete();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Home" }],
      })
    );
  }, [navigation]);

  const goNext = useCallback(() => {
    if (page >= PAGE_COUNT - 1) {
      void finish();
      return;
    }
    const next = page + 1;
    listRef.current?.scrollToOffset({
      offset: next * pageWidth,
      animated: true,
    });
    setPage(next);
  }, [page, pageWidth, finish]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / pageWidth);
      setPage(Math.max(0, Math.min(PAGE_COUNT - 1, next)));
    },
    [pageWidth]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.surface,
        },
        topBar: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: 16,
          paddingBottom: 8,
          minHeight: 44,
        },
        skip: {
          paddingVertical: 8,
          paddingHorizontal: 12,
        },
        skipLabel: {
          fontFamily: Manrope.semiBold,
          fontSize: 15,
          color: colors.primary,
        },
        logoBlock: {
          alignItems: "center",
          marginBottom: 20,
        },
        title: {
          fontFamily: Manrope.bold,
          fontSize: 26,
          letterSpacing: -0.5,
          color: colors.onSurface,
          textAlign: "center",
          marginBottom: 10,
        },
        lead: {
          ...typography.body,
          fontSize: 16,
          lineHeight: 24,
          color: colors.onSurfaceVariant,
          textAlign: "center",
          marginBottom: 22,
        },
        statRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          marginHorizontal: -5,
          marginBottom: 22,
        },
        statChip: {
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: radius.full,
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.outlineVariant,
          marginHorizontal: 5,
          marginBottom: 10,
        },
        statLabel: {
          fontFamily: Manrope.semiBold,
          fontSize: 13,
          color: colors.onSurface,
          textAlign: "center",
        },
        quoteCard: {
          borderRadius: radius.lg,
          padding: 16,
          marginBottom: 12,
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.surfaceContainerHigh,
        },
        quoteStars: {
          flexDirection: "row",
          marginBottom: 8,
        },
        quoteText: {
          ...typography.body,
          fontSize: 15,
          lineHeight: 22,
          color: colors.onSurface,
          fontStyle: "italic",
          marginBottom: 10,
        },
        quoteMeta: {
          fontFamily: Manrope.semiBold,
          fontSize: 13,
          color: colors.onSurfaceVariant,
        },
        disclaimer: {
          ...typography.caption,
          color: colors.onSurfaceVariant,
          textAlign: "center",
          marginTop: 4,
          opacity: 0.85,
        },
        stepRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          marginBottom: 18,
        },
        stepIcon: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.primaryContainer,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
        },
        stepBody: {
          flex: 1,
          paddingTop: 2,
        },
        stepTitle: {
          fontFamily: Manrope.bold,
          fontSize: 16,
          color: colors.onSurface,
          marginBottom: 4,
        },
        stepDesc: {
          ...typography.bodySm,
          color: colors.onSurfaceVariant,
          lineHeight: 20,
        },
        bottom: {
          paddingHorizontal: 24,
          paddingTop: 8,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.outlineVariant,
          backgroundColor: colors.surface,
        },
        dots: {
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 14,
        },
        dot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.surfaceContainerHigh,
        },
        dotActive: {
          backgroundColor: colors.primary,
          width: 22,
        },
        cta: {
          marginBottom: 8,
        },
      }),
    [colors, typography]
  );

  /** Space so last lines aren’t hidden behind the fixed bottom CTA bar. */
  const pageBottomReserve = useMemo(() => {
    const bar = 168;
    return bar + Math.max(insets.bottom, 8);
  }, [insets.bottom]);

  const renderPage: ListRenderItem<number> = useCallback(
    ({ item: index }) => {
      if (index === 0) {
        return (
          <OnboardingPageScroll
            pageWidth={pageWidth}
            bottomReserve={pageBottomReserve}
          >
            <View style={styles.logoBlock}>
              <AppLogo />
            </View>
            <Text style={styles.title}>{t("onboarding.socialTitle")}</Text>
            <Text style={styles.lead}>{t("onboarding.socialLead")}</Text>
            <View style={styles.statRow}>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>{t("onboarding.stat1")}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>{t("onboarding.stat2")}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>{t("onboarding.stat3")}</Text>
              </View>
            </View>
            <View style={styles.quoteCard}>
              <View style={styles.quoteStars}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <MaterialIcons
                    key={i}
                    name="star"
                    size={16}
                    color={colors.primary}
                    style={{ marginRight: i < 4 ? 2 : 0 }}
                  />
                ))}
              </View>
              <Text style={styles.quoteText}>{t("onboarding.quote1")}</Text>
              <Text style={styles.quoteMeta}>{t("onboarding.quote1Meta")}</Text>
            </View>
            <View style={styles.quoteCard}>
              <View style={styles.quoteStars}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <MaterialIcons
                    key={i}
                    name="star"
                    size={16}
                    color={colors.primary}
                    style={{ marginRight: i < 4 ? 2 : 0 }}
                  />
                ))}
              </View>
              <Text style={styles.quoteText}>{t("onboarding.quote2")}</Text>
              <Text style={styles.quoteMeta}>{t("onboarding.quote2Meta")}</Text>
            </View>
            <Text style={styles.disclaimer}>{t("onboarding.socialDisclaimer")}</Text>
          </OnboardingPageScroll>
        );
      }
      if (index === 1) {
        const steps: { icon: keyof typeof MaterialIcons.glyphMap; title: string; body: string }[] =
          [
            {
              icon: "add-photo-alternate",
              title: t("onboarding.step1Title"),
              body: t("onboarding.step1Body"),
            },
            {
              icon: "tune",
              title: t("onboarding.step2Title"),
              body: t("onboarding.step2Body"),
            },
            {
              icon: "auto-awesome",
              title: t("onboarding.step3Title"),
              body: t("onboarding.step3Body"),
            },
            {
              icon: "photo-library",
              title: t("onboarding.step4Title"),
              body: t("onboarding.step4Body"),
            },
          ];
        return (
          <OnboardingPageScroll
            pageWidth={pageWidth}
            bottomReserve={pageBottomReserve}
          >
            <Text style={styles.title}>{t("onboarding.processTitle")}</Text>
            <Text style={styles.lead}>{t("onboarding.processLead")}</Text>
            {steps.map((s) => (
              <View key={s.title} style={styles.stepRow}>
                <View style={styles.stepIcon}>
                  <MaterialIcons name={s.icon} size={24} color={colors.primary} />
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepDesc}>{s.body}</Text>
                </View>
              </View>
            ))}
          </OnboardingPageScroll>
        );
      }
      return (
        <OnboardingPageScroll
          pageWidth={pageWidth}
          bottomReserve={pageBottomReserve}
        >
          <View style={styles.logoBlock}>
            <AppLogo />
          </View>
          <Text style={styles.title}>{t("onboarding.ctaTitle")}</Text>
          <Text style={styles.lead}>{t("onboarding.ctaLead")}</Text>
        </OnboardingPageScroll>
      );
    },
    [colors.primary, pageBottomReserve, pageWidth, styles, t]
  );

  const keyExtractor = useCallback((i: number) => String(i), []);

  const ctaTitle =
    page >= PAGE_COUNT - 1 ? t("onboarding.getStarted") : t("onboarding.next");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => void finish()}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.skipA11y")}
        >
          <Text style={styles.skipLabel}>{t("onboarding.skip")}</Text>
        </Pressable>
      </View>

      <FlatList
        key={pageWidth}
        ref={listRef}
        data={[0, 1, 2]}
        keyExtractor={keyExtractor}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({
          length: pageWidth,
          offset: pageWidth * index,
          index,
        })}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        removeClippedSubviews={Platform.OS === "android"}
        decelerationRate="fast"
        disableIntervalMomentum
      />

      <View
        style={[
          styles.bottom,
          {
            paddingBottom:
              Math.max(insets.bottom, Platform.OS === "ios" ? 10 : 8) +
              (Platform.OS === "ios" ? 6 : 10),
          },
        ]}
      >
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ paddingHorizontal: 4 }}>
              <View style={[styles.dot, i === page && styles.dotActive]} />
            </View>
          ))}
        </View>
        <PrimaryCTA
          title={ctaTitle}
          onPress={goNext}
          style={styles.cta}
        />
      </View>
    </View>
  );
}
