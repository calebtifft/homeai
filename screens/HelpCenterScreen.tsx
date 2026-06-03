import { MaterialIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackScreenHeader } from "../components/StackScreenHeader";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import type { StringKey } from "../locales/strings";
import type { RootStackParamList } from "../types";
import {
  Manrope,
  radius,
  type ThemePalette,
  type ThemeTypography,
} from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "HelpCenter">;

type FaqCategoryId =
  | "gettingStarted"
  | "photos"
  | "interior"
  | "exterior"
  | "walls"
  | "billing"
  | "account"
  | "trouble";

type FaqItem = { id: string; qKey: StringKey; aKey: StringKey };

type FaqCategory = {
  id: FaqCategoryId;
  titleKey: StringKey;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  items: FaqItem[];
};

// Curated FAQ taxonomy — keys map 1:1 to `help.q.*.q` / `help.q.*.a` in `locales/strings.ts`.
const FAQ_CATEGORIES: readonly FaqCategory[] = [
  {
    id: "gettingStarted",
    titleKey: "help.catGettingStarted",
    icon: "auto-awesome",
    items: [
      { id: "howItWorks", qKey: "help.q.howItWorks.q", aKey: "help.q.howItWorks.a" },
      { id: "modes", qKey: "help.q.modes.q", aKey: "help.q.modes.a" },
      { id: "empty", qKey: "help.q.empty.q", aKey: "help.q.empty.a" },
    ],
  },
  {
    id: "photos",
    titleKey: "help.catPhotos",
    icon: "photo-camera",
    items: [
      { id: "photoTips", qKey: "help.q.photoTips.q", aKey: "help.q.photoTips.a" },
    ],
  },
  {
    id: "interior",
    titleKey: "help.catInterior",
    icon: "weekend",
    items: [
      { id: "style", qKey: "help.q.style.q", aKey: "help.q.style.a" },
    ],
  },
  {
    id: "exterior",
    titleKey: "help.catExterior",
    icon: "home-work",
    items: [
      {
        id: "exteriorScene",
        qKey: "help.q.exteriorScene.q",
        aKey: "help.q.exteriorScene.a",
      },
    ],
  },
  {
    id: "walls",
    titleKey: "help.catWalls",
    icon: "format-paint",
    items: [
      { id: "wallsScope", qKey: "help.q.wallsScope.q", aKey: "help.q.wallsScope.a" },
      {
        id: "wallsTreatment",
        qKey: "help.q.wallsTreatment.q",
        aKey: "help.q.wallsTreatment.a",
      },
    ],
  },
  {
    id: "billing",
    titleKey: "help.catBilling",
    icon: "workspace-premium",
    items: [
      { id: "subs", qKey: "help.q.subs.q", aKey: "help.q.subs.a" },
      { id: "restore", qKey: "help.q.restore.q", aKey: "help.q.restore.a" },
    ],
  },
  {
    id: "account",
    titleKey: "help.catAccount",
    icon: "shield",
    items: [
      { id: "privacy", qKey: "help.q.privacy.q", aKey: "help.q.privacy.a" },
    ],
  },
  {
    id: "trouble",
    titleKey: "help.catTrouble",
    icon: "build",
    items: [
      { id: "failed", qKey: "help.q.failed.q", aKey: "help.q.failed.a" },
      { id: "dark", qKey: "help.q.dark.q", aKey: "help.q.dark.a" },
    ],
  },
];

type HelpStyles = ReturnType<typeof createHelpStyles>;

function createHelpStyles(
  colors: ThemePalette,
  typography: ThemeTypography,
  ghostBorder: ViewStyle,
  ambientShadow: ViewStyle,
  primaryOverlay: { o08: string }
) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      maxWidth: 448,
      width: "100%",
      alignSelf: "center",
    },
    lead: {
      ...typography.body,
      color: colors.onSurfaceVariant,
      marginTop: 8,
      marginBottom: 14,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.full,
      paddingLeft: 14,
      paddingRight: 6,
      height: 44,
      ...ghostBorder,
    },
    searchInput: {
      flex: 1,
      fontFamily: Manrope.medium,
      fontSize: 15,
      color: colors.onSurface,
      paddingHorizontal: 8,
      paddingVertical: 0,
    },
    searchIcon: { marginRight: 2 },
    clearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionTitle: {
      ...typography.label,
      fontSize: 11,
      letterSpacing: 1.15,
      marginTop: 22,
      marginBottom: 10,
      marginLeft: 2,
    },
    iconTile: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: primaryOverlay.o08,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 22,
      marginBottom: 10,
    },
    sectionHeaderTitle: {
      ...typography.label,
      fontSize: 13,
      letterSpacing: 0.4,
      color: colors.onSurface,
      flex: 1,
    },
    qaCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      ...ghostBorder,
      ...ambientShadow,
      marginBottom: 10,
      overflow: "hidden",
    },
    qaRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    qaQuestion: {
      flex: 1,
      fontFamily: Manrope.semiBold,
      fontSize: 15,
      letterSpacing: -0.1,
      color: colors.onSurface,
      paddingRight: 10,
    },
    qaBodyWrap: {
      paddingHorizontal: 14,
      paddingBottom: 16,
    },
    qaBodyDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.outlineVariant,
      marginBottom: 12,
      marginHorizontal: -14,
    },
    qaBody: {
      ...typography.body,
      color: colors.onSurfaceVariant,
      lineHeight: 22,
    },
    chevron: {
      transform: [{ rotate: "0deg" }],
    },
    emptyWrap: {
      paddingVertical: 36,
      alignItems: "center",
    },
    emptyTitle: {
      fontFamily: Manrope.bold,
      fontSize: 16,
      color: colors.onSurface,
      marginTop: 12,
    },
    emptyBody: {
      ...typography.body,
      color: colors.onSurfaceVariant,
      textAlign: "center",
      marginTop: 6,
      maxWidth: 320,
    },
    contactCard: {
      backgroundColor: colors.primaryContainer,
      borderRadius: radius.xl,
      padding: 18,
      marginTop: 24,
    },
    contactTitle: {
      fontFamily: Manrope.bold,
      fontSize: 16,
      color: colors.onPrimaryContainer,
    },
    contactBody: {
      fontFamily: Manrope.medium,
      fontSize: 13,
      color: colors.onPrimaryContainer,
      opacity: 0.86,
      marginTop: 4,
    },
    contactCta: {
      alignSelf: "flex-start",
      marginTop: 12,
      paddingHorizontal: 16,
      height: 38,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    contactCtaText: {
      fontFamily: Manrope.semiBold,
      fontSize: 13,
      color: colors.onPrimary,
    },
  });
}

function HelpCategorySection({
  category,
  visibleItems,
  expandedId,
  setExpandedId,
  colors,
  styles,
  t,
  chevronColor,
}: {
  category: FaqCategory;
  visibleItems: FaqItem[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  colors: ThemePalette;
  styles: HelpStyles;
  t: ReturnType<typeof useLanguage>["t"];
  chevronColor: string;
}) {
  if (visibleItems.length === 0) return null;
  return (
    <View>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.iconTile}>
          <MaterialIcons name={category.icon} size={20} color={colors.primary} />
        </View>
        <Text style={styles.sectionHeaderTitle}>{t(category.titleKey)}</Text>
      </View>
      {visibleItems.map((item) => (
        <FaqRow
          key={item.id}
          item={item}
          expanded={expandedId === item.id}
          onToggle={() =>
            setExpandedId(expandedId === item.id ? null : item.id)
          }
          styles={styles}
          t={t}
          chevronColor={chevronColor}
        />
      ))}
    </View>
  );
}

function FaqRow({
  item,
  expanded,
  onToggle,
  styles,
  t,
  chevronColor,
}: {
  item: FaqItem;
  expanded: boolean;
  onToggle: () => void;
  styles: HelpStyles;
  t: ReturnType<typeof useLanguage>["t"];
  chevronColor: string;
}) {
  const rot = useMemo(() => new Animated.Value(expanded ? 1 : 0), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive a 0 → 1 spring whenever the row toggles, so the chevron rotates smoothly.
  Animated.timing(rot, {
    toValue: expanded ? 1 : 0,
    duration: 180,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start();

  const rotate = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.qaCard}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.qaRow, pressed && { opacity: 0.92 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.qaQuestion}>{t(item.qKey)}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <MaterialIcons name="expand-more" size={22} color={chevronColor} />
        </Animated.View>
      </Pressable>
      {expanded ? (
        <View style={styles.qaBodyWrap}>
          <View style={styles.qaBodyDivider} />
          <Text style={styles.qaBody}>{t(item.aKey)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function HelpCenterScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const {
    colors,
    typography,
    ghostBorder,
    ambientShadow,
    primaryOverlay,
    isDark,
  } = useTheme();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      createHelpStyles(
        colors,
        typography,
        ghostBorder,
        ambientShadow,
        primaryOverlay
      ),
    [colors, typography, ghostBorder, ambientShadow, primaryOverlay]
  );

  const chevronColor = isDark
    ? "rgba(200, 206, 190, 0.55)"
    : "rgba(87, 92, 82, 0.55)";

  // Pre-translate to compare against the search query in the active locale.
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) {
      return FAQ_CATEGORIES.map((c) => ({ category: c, items: c.items }));
    }
    return FAQ_CATEGORIES.map((c) => {
      const items = c.items.filter((item) => {
        const blob =
          `${t(item.qKey)}\n${t(item.aKey)}\n${t(c.titleKey)}`.toLocaleLowerCase();
        return blob.includes(q);
      });
      return { category: c, items };
    }).filter((bucket) => bucket.items.length > 0);
  }, [query, t]);

  const onContact = useCallback(() => {
    navigation.navigate("ContactSupport");
  }, [navigation]);

  return (
    <View style={styles.root}>
      <StackScreenHeader title={t("help.title")} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>{t("help.subtitle")}</Text>
        <View style={styles.searchWrap}>
          <MaterialIcons
            name="search"
            size={18}
            color={chevronColor}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={t("help.searchPlaceholder")}
            placeholderTextColor={chevronColor}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              style={styles.clearBtn}
              hitSlop={6}
              accessibilityRole="button"
            >
              <MaterialIcons name="close" size={18} color={chevronColor} />
            </Pressable>
          ) : null}
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialIcons
              name="search-off"
              size={40}
              color={colors.onSurfaceVariant}
            />
            <Text style={styles.emptyTitle}>{t("help.emptyTitle")}</Text>
            <Text style={styles.emptyBody}>{t("help.emptyBody")}</Text>
          </View>
        ) : (
          filtered.map(({ category, items }) => (
            <HelpCategorySection
              key={category.id}
              category={category}
              visibleItems={items}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              colors={colors}
              styles={styles}
              t={t}
              chevronColor={chevronColor}
            />
          ))
        )}

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>{t("help.contactCtaTitle")}</Text>
          <Text style={styles.contactBody}>{t("help.contactCtaBody")}</Text>
          <Pressable
            onPress={onContact}
            style={({ pressed }) => [
              styles.contactCta,
              pressed && { opacity: 0.92 },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.contactCtaText}>
              {t("help.contactCtaButton")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
