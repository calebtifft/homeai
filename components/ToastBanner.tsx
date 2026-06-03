import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { Manrope, radius } from "../theme/curatedCanvas";

type ToastVariant = "success" | "error";

type ToastBannerProps = {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
};

/**
 * Non-blocking bottom notice (toast-style). Pair with parent state + auto-dismiss timer.
 */
export function ToastBanner({
  visible,
  message,
  variant = "success",
}: ToastBannerProps) {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 20,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  if (!message) {
    return null;
  }

  const isError = variant === "error";
  const bg = isError ? colors.surfaceContainerHighest : colors.primaryContainer;
  const fg = isError ? colors.onSurface : colors.onPrimaryContainer;
  const iconColor = isError ? colors.primary : colors.primaryDim;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, 12) + 8,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.banner, { backgroundColor: bg }]}>
        <MaterialIcons
          name={isError ? "error-outline" : "check-circle"}
          size={22}
          color={iconColor}
        />
        <Text
          style={[
            styles.text,
            typography.bodySm,
            { color: fg, fontFamily: Manrope.semiBold },
          ]}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 400,
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  text: {
    flex: 1,
    lineHeight: 20,
  },
});
