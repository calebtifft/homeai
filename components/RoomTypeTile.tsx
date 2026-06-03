import type { ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { radius } from "../theme/curatedCanvas";

type RoomTypeTileProps = {
  label: string;
  icon: ReactNode;
  selected: boolean;
  onPress: () => void;
};

export function RoomTypeTile({
  label,
  icon,
  selected,
  onPress,
}: RoomTypeTileProps) {
  const { colors, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        tile: {
          width: "48%",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 14,
          paddingHorizontal: 12,
          borderRadius: radius.xl,
          marginBottom: 12,
        },
        tileIdle: {
          backgroundColor: colors.surfaceContainerLow,
        },
        tileSelected: {
          backgroundColor: colors.primary,
        },
        pressed: {
          opacity: 0.92,
          transform: [{ scale: 0.98 }],
        },
        iconSlot: {
          width: 44,
          height: 44,
          borderRadius: 22,
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
      }),
    [colors]
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected ? styles.tileSelected : styles.tileIdle,
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
          typography.controlLabel,
          styles.label,
          selected ? styles.labelSelected : styles.labelIdle,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}
