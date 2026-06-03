import { MaterialIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackScreenHeader } from "../components/StackScreenHeader";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { openLegalDocument } from "../services/openLegalDocument";
import type { RootStackParamList } from "../types";
import { Manrope, radius } from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "PrivacySecurity">;

type LegalRow = {
  id: "terms" | "privacy";
  labelKey: "legal.terms" | "legal.privacy";
  icon: keyof typeof MaterialIcons.glyphMap;
};

const ROWS: LegalRow[] = [
  { id: "privacy", labelKey: "legal.privacy", icon: "shield" },
  { id: "terms", labelKey: "legal.terms", icon: "description" },
];

export function PrivacySecurityScreen({}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, typography, ghostBorder } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.surface },
        content: {
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: insets.bottom + 28,
          maxWidth: 448,
          width: "100%",
          alignSelf: "center",
        },
        lead: {
          ...typography.body,
          color: colors.onSurfaceVariant,
          marginBottom: 20,
          lineHeight: 22,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceContainerLow,
          marginBottom: 10,
        },
        rowPressed: { opacity: 0.9 },
        rowIcon: {
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primaryContainer,
        },
        rowLabel: {
          flex: 1,
          fontFamily: Manrope.semiBold,
          fontSize: 16,
          color: colors.onSurface,
        },
      }),
    [colors, insets.bottom, typography.body]
  );

  const openDoc = useCallback(
    (id: LegalRow["id"]) => {
      void openLegalDocument(id, {
        unavailableTitle: t("legal.openFailedTitle"),
        unavailableBody: t("legal.openFailedBody"),
      });
    },
    [t]
  );

  return (
    <View style={styles.root}>
      <StackScreenHeader title={t("settings.rowPrivacy")} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>{t("legal.privacyLead")}</Text>
        {ROWS.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => openDoc(row.id)}
            style={({ pressed }) => [
              styles.row,
              ghostBorder,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
          >
            <View style={styles.rowIcon}>
              <MaterialIcons name={row.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.rowLabel}>{t(row.labelKey)}</Text>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.onSurfaceVariant}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
