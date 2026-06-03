import { MaterialIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
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
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import type { StringKey } from "../locales/strings";
import type { RootStackParamList } from "../types";
import packageJson from "../package.json";
import {
  Manrope,
  radius,
  type ThemePalette,
  type ThemeTypography,
} from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "ContactSupport">;

const SUPPORT_EMAIL = "homeai.m@outlook.com";

type Topic = "question" | "bug" | "billing" | "feature" | "other";

const TOPICS: readonly { id: Topic; labelKey: StringKey }[] = [
  { id: "question", labelKey: "contact.topicQuestion" },
  { id: "bug", labelKey: "contact.topicBug" },
  { id: "billing", labelKey: "contact.topicBilling" },
  { id: "feature", labelKey: "contact.topicFeature" },
  { id: "other", labelKey: "contact.topicOther" },
];

// Light-weight email regex — good enough to catch obvious typos without
// rejecting unusual but valid addresses (full RFC validation isn't worth it).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactStyles = ReturnType<typeof createContactStyles>;

function createContactStyles(
  colors: ThemePalette,
  typography: ThemeTypography,
  ghostBorder: ViewStyle,
  ambientShadow: ViewStyle
) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 36,
      maxWidth: 448,
      width: "100%",
      alignSelf: "center",
    },
    lead: {
      ...typography.body,
      color: colors.onSurfaceVariant,
      marginTop: 8,
      marginBottom: 16,
    },
    fieldLabel: {
      ...typography.label,
      fontSize: 11,
      letterSpacing: 1.15,
      color: colors.onSurfaceVariant,
      marginBottom: 8,
      marginLeft: 2,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -3,
      marginBottom: 16,
    },
    chip: {
      height: 34,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: "center",
      justifyContent: "center",
      margin: 3,
    },
    chipActive: {
      backgroundColor: colors.primary,
    },
    chipText: {
      fontFamily: Manrope.semiBold,
      fontSize: 13,
      color: colors.onSurfaceVariant,
    },
    chipTextActive: { color: colors.onPrimary },
    input: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: Manrope.medium,
      fontSize: 15,
      color: colors.onSurface,
      ...ghostBorder,
      marginBottom: 16,
    },
    textarea: {
      minHeight: 132,
      textAlignVertical: "top",
    },
    diagCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 14,
      ...ghostBorder,
    },
    diagToggleRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    diagToggleLabelWrap: { flex: 1, marginRight: 12 },
    diagToggleLabel: {
      fontFamily: Manrope.semiBold,
      fontSize: 15,
      color: colors.onSurface,
    },
    diagHint: {
      ...typography.body,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    diagShowBtn: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12,
      alignSelf: "flex-start",
    },
    diagShowText: {
      fontFamily: Manrope.semiBold,
      fontSize: 12,
      color: colors.primary,
      letterSpacing: 0.4,
      marginRight: 4,
      textTransform: "uppercase" as const,
    },
    diagList: {
      marginTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.outlineVariant,
      paddingTop: 12,
    },
    diagListRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    diagListKey: {
      fontFamily: Manrope.medium,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    diagListVal: {
      fontFamily: Manrope.semiBold,
      fontSize: 12,
      color: colors.onSurface,
      maxWidth: 220,
      textAlign: "right",
    },
    submit: {
      height: 52,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginTop: 8,
      ...ambientShadow,
    },
    submitDisabled: {
      backgroundColor: colors.surfaceContainerHigh,
    },
    submitText: {
      fontFamily: Manrope.bold,
      fontSize: 16,
      color: colors.onPrimary,
      marginLeft: 8,
    },
    submitTextDisabled: { color: colors.onSurfaceVariant },
    altWrap: {
      marginTop: 18,
      alignItems: "center",
    },
    altLine: {
      ...typography.body,
      color: colors.onSurfaceVariant,
      fontSize: 12,
    },
    altEmail: {
      fontFamily: Manrope.semiBold,
      fontSize: 13,
      color: colors.primary,
      marginTop: 2,
    },
    // Custom switch geometry (mirrors SettingsSwitch but inline to keep this screen self-contained).
    switchTrack: { width: 51, height: 31, borderRadius: 16, overflow: "hidden" },
    switchTrackBase: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerHigh,
    },
    switchTrackOn: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      backgroundColor: colors.primaryContainer,
    },
    switchThumbRail: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      justifyContent: "center",
      paddingHorizontal: 2,
      zIndex: 1,
    },
    switchThumb: {
      width: 27,
      height: 27,
      borderRadius: 27 / 2,
      backgroundColor: colors.surfaceContainerLowest,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
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

const SWITCH_THUMB_TRAVEL = 51 - 2 * 2 - 27;

function InlineSwitch({
  value,
  onValueChange,
  styles,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  styles: ContactStyles;
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
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SWITCH_THUMB_TRAVEL],
  });
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={styles.switchTrack}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View pointerEvents="none" style={styles.switchTrackBase} />
      <Animated.View
        pointerEvents="none"
        style={[styles.switchTrackOn, { opacity: progress }]}
      />
      <View pointerEvents="box-none" style={styles.switchThumbRail}>
        <Animated.View
          pointerEvents="none"
          style={[styles.switchThumb, { transform: [{ translateX }] }]}
        />
      </View>
    </Pressable>
  );
}

export function ContactSupportScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { t, languageId } = useLanguage();
  const { user } = useAuth();
  const { colors, typography, ghostBorder, ambientShadow } = useTheme();
  const styles = useMemo(
    () => createContactStyles(colors, typography, ghostBorder, ambientShadow),
    [colors, typography, ghostBorder, ambientShadow]
  );

  const initialTopic: Topic = route.params?.topicHint ?? "question";
  const [topic, setTopic] = useState<Topic>(initialTopic);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState(user?.email ?? "");
  const [includeDiag, setIncludeDiag] = useState(true);
  const [diagOpen, setDiagOpen] = useState(false);

  const accountLabel = useMemo(() => {
    if (user?.email) return user.email;
    if (user?.id) return user.id.slice(0, 8);
    return t("contact.diagAccountAnon");
  }, [user, t]);

  const diagnostics = useMemo(
    () => ({
      appVersion: packageJson.version,
      platform: Platform.OS,
      osVersion: String(Platform.Version ?? ""),
      locale: languageId,
      account: accountLabel,
    }),
    [languageId, accountLabel]
  );

  const buildEmailBody = useCallback(() => {
    const topicLabel = t(
      TOPICS.find((x) => x.id === topic)?.labelKey ?? "contact.topicQuestion"
    );
    const lines: string[] = [
      message.trim(),
      "",
      "—",
      `${t("contact.topicLabel")}: ${topicLabel}`,
    ];
    if (replyEmail.trim()) {
      lines.push(`${t("contact.replyLabel")}: ${replyEmail.trim()}`);
    }
    if (includeDiag) {
      lines.push(
        "",
        `${t("contact.diagAppVersion")}: ${diagnostics.appVersion}`,
        `${t("contact.diagPlatform")}: ${diagnostics.platform}`,
        `${t("contact.diagOsVersion")}: ${diagnostics.osVersion}`,
        `${t("contact.diagLocale")}: ${diagnostics.locale}`,
        `${t("contact.diagAccount")}: ${diagnostics.account}`
      );
    }
    return lines.join("\n");
  }, [t, topic, message, replyEmail, includeDiag, diagnostics]);

  const canSubmit =
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    (replyEmail.trim() === "" || EMAIL_RE.test(replyEmail.trim()));

  const onSubmit = useCallback(async () => {
    if (subject.trim().length === 0 || message.trim().length === 0) {
      Alert.alert(
        t("contact.validationTitle"),
        t("contact.validationFieldsMissing")
      );
      return;
    }
    if (replyEmail.trim() && !EMAIL_RE.test(replyEmail.trim())) {
      Alert.alert(
        t("contact.validationTitle"),
        t("contact.validationEmail")
      );
      return;
    }
    const topicLabel = t(
      TOPICS.find((x) => x.id === topic)?.labelKey ?? "contact.topicQuestion"
    );
    const subjectLine = `[${topicLabel}] ${subject.trim()}`;
    const body = buildEmailBody();
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subjectLine
    )}&body=${encodeURIComponent(body)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) {
        await Linking.openURL(url);
        navigation.goBack();
        return;
      }
    } catch {
      // fall through to the manual-copy fallback below
    }
    Alert.alert(
      t("contact.mailerUnavailableTitle"),
      t("contact.mailerUnavailableBody", { email: SUPPORT_EMAIL })
    );
  }, [subject, message, replyEmail, topic, buildEmailBody, t, navigation]);

  const onEmailPress = useCallback(() => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }, []);

  return (
    <View style={styles.root}>
      <StackScreenHeader title={t("contact.title")} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 36 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>{t("contact.lead")}</Text>

          <Text style={styles.fieldLabel}>{t("contact.topicLabel")}</Text>
          <View style={styles.chipsRow}>
            {TOPICS.map((opt) => {
              const active = opt.id === topic;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setTopic(opt.id)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>{t("contact.subjectLabel")}</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder={t("contact.subjectPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            returnKeyType="next"
            maxLength={120}
          />

          <Text style={styles.fieldLabel}>{t("contact.messageLabel")}</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={message}
            onChangeText={setMessage}
            placeholder={t("contact.messagePlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
            numberOfLines={6}
            maxLength={3000}
          />

          <Text style={styles.fieldLabel}>{t("contact.replyLabel")}</Text>
          <TextInput
            style={styles.input}
            value={replyEmail}
            onChangeText={setReplyEmail}
            placeholder={t("contact.replyPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="email"
          />

          <View style={styles.diagCard}>
            <View style={styles.diagToggleRow}>
              <View style={styles.diagToggleLabelWrap}>
                <Text style={styles.diagToggleLabel}>
                  {t("contact.diagToggle")}
                </Text>
                <Text style={styles.diagHint}>{t("contact.diagHint")}</Text>
              </View>
              <InlineSwitch
                value={includeDiag}
                onValueChange={setIncludeDiag}
                styles={styles}
              />
            </View>

            {includeDiag ? (
              <Pressable
                onPress={() => setDiagOpen((v) => !v)}
                style={styles.diagShowBtn}
                accessibilityRole="button"
                accessibilityState={{ expanded: diagOpen }}
              >
                <Text style={styles.diagShowText}>
                  {diagOpen
                    ? t("contact.diagHide")
                    : t("contact.diagShow")}
                </Text>
                <MaterialIcons
                  name={diagOpen ? "expand-less" : "expand-more"}
                  size={18}
                  color={colors.primary}
                />
              </Pressable>
            ) : null}

            {includeDiag && diagOpen ? (
              <View style={styles.diagList}>
                <DiagRow
                  k={t("contact.diagAppVersion")}
                  v={diagnostics.appVersion}
                  styles={styles}
                />
                <DiagRow
                  k={t("contact.diagPlatform")}
                  v={diagnostics.platform}
                  styles={styles}
                />
                <DiagRow
                  k={t("contact.diagOsVersion")}
                  v={diagnostics.osVersion}
                  styles={styles}
                />
                <DiagRow
                  k={t("contact.diagLocale")}
                  v={diagnostics.locale}
                  styles={styles}
                />
                <DiagRow
                  k={t("contact.diagAccount")}
                  v={diagnostics.account}
                  styles={styles}
                />
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              pressed && canSubmit && { opacity: 0.92 },
            ]}
            accessibilityRole="button"
          >
            <MaterialIcons
              name="send"
              size={18}
              color={canSubmit ? colors.onPrimary : colors.onSurfaceVariant}
            />
            <Text
              style={[
                styles.submitText,
                !canSubmit && styles.submitTextDisabled,
              ]}
            >
              {t("contact.submit")}
            </Text>
          </Pressable>

          <View style={styles.altWrap}>
            <Text style={styles.altLine}>{t("contact.altLine")}</Text>
            <Pressable onPress={onEmailPress} hitSlop={8}>
              <Text style={styles.altEmail}>{SUPPORT_EMAIL}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function DiagRow({
  k,
  v,
  styles,
}: {
  k: string;
  v: string;
  styles: ContactStyles;
}) {
  return (
    <View style={styles.diagListRow}>
      <Text style={styles.diagListKey}>{k}</Text>
      <Text style={styles.diagListVal} numberOfLines={1}>
        {v}
      </Text>
    </View>
  );
}
