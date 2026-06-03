import type { ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { radius } from "../theme/curatedCanvas";

type StylePillProps = {
  label: string;
  icon: ReactNode;
  selected: boolean;
  onPress: () => void;
};

export function StylePill({ label, icon, selected, onPress }: StylePillProps) {
  const { colors, typography, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          width: "100%",
          maxWidth: 400,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: radius.lg,
          marginBottom: 10,
          borderWidth: 1,
        },
        rowIdle: {
          backgroundColor: colors.surfaceContainerLow,
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.12)"
            : "rgba(177, 177, 188, 0.2)",
        },
        rowSelected: {
          backgroundColor: colors.primary,
          borderColor: colors.primaryDim,
        },
        pressed: {
          opacity: 0.92,
          transform: [{ scale: 0.995 }],
        },
        iconSlot: {
          width: 44,
          height: 44,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
        },
        iconSlotIdle: {
          backgroundColor: colors.surfaceContainer,
        },
        iconSlotSelected: {
          backgroundColor: "rgba(255,255,255,0.2)",
        },
        label: {
          flex: 1,
        },
        labelIdle: {
          color: colors.onSurface,
        },
        labelSelected: {
          color: colors.onPrimary,
        },
        trailSpacer: {
          width: 24,
          height: 24,
        },
      }),
    [colors, isDark, typography]
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : styles.rowIdle,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.iconSlot,
          selected ? styles.iconSlotSelected : styles.iconSlotIdle,
        ]}
      >
        {icon}
      </View>
      <Text
        style={[
          typography.titleSm,
          styles.label,
          selected ? styles.labelSelected : styles.labelIdle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? (
        <MaterialIcons name="check-circle" size={24} color={colors.onPrimary} />
      ) : (
        <View style={styles.trailSpacer} />
      )}
    </Pressable>
  );
}
