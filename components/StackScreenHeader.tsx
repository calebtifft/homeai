import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { Manrope } from "../theme/curatedCanvas";

type Props = {
  title: string;
  /** e.g. Language screen save — keep width stable so title stays centered. */
  right?: ReactNode;
  /** When true, no back control (e.g. Result flow end — matches native `headerLeft: null`). */
  hideBack?: boolean;
};

const ROW_H = 44;
const SIDE_W = 48;

/**
 * In-screen header for stack routes where the native bar mis-insets (notch / status bar)
 * or misses touches. Uses real safe-area top padding + explicit back control.
 */
export function StackScreenHeader({ title, right, hideBack }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const showBack = !hideBack && navigation.canGoBack();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top,
          backgroundColor: colors.surface,
          borderBottomColor: colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.side}>
          {showBack ? (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              style={({ pressed }) => [
                styles.iconTap,
                pressed && { opacity: 0.82 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
        <Text
          style={[styles.title, { color: colors.onSurface }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={[styles.side, styles.sideRight]}>{right ?? null}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: ROW_H,
    paddingHorizontal: 2,
  },
  side: {
    width: SIDE_W,
    justifyContent: "center",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    fontFamily: Manrope.bold,
    fontSize: 17,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  iconTap: {
    width: ROW_H,
    height: ROW_H,
    alignItems: "center",
    justifyContent: "center",
  },
});
