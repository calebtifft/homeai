import { Ionicons } from "@expo/vector-icons";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { radius } from "../theme/curatedCanvas";

const NODE = 28;
const RING = 3;

type ConfigureStepperProps = {
  currentStep: number;
  labels: string[];
  onPressStep?: (index: number) => void;
};

export function ConfigureStepper({
  currentStep,
  labels,
  onPressStep,
}: ConfigureStepperProps) {
  const { colors, typography, isDark } = useTheme();
  const n = labels.length;
  const previousStepRef = useRef(currentStep);
  const activeNodeScale = useRef(new Animated.Value(1)).current;
  const connectorProgress = useRef(new Animated.Value(1)).current;
  const [animatingConnectorIndex, setAnimatingConnectorIndex] = useState<number | null>(
    null
  );

  useEffect(() => {
    const previousStep = previousStepRef.current;
    if (currentStep > previousStep) {
      setAnimatingConnectorIndex(previousStep);
      connectorProgress.setValue(0);
      activeNodeScale.setValue(0.9);
      Animated.parallel([
        Animated.timing(connectorProgress, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.spring(activeNodeScale, {
          toValue: 1,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setAnimatingConnectorIndex(null);
      });
    } else {
      activeNodeScale.setValue(1);
      connectorProgress.setValue(1);
      setAnimatingConnectorIndex(null);
    }
    previousStepRef.current = currentStep;
  }, [activeNodeScale, connectorProgress, currentStep]);

  const stepperMuted = useMemo(
    () => ({
      linePending: isDark
        ? "rgba(255, 255, 255, 0.16)"
        : "rgba(177, 177, 188, 0.45)",
      ringPending: isDark
        ? "rgba(255, 255, 255, 0.22)"
        : "rgba(177, 177, 188, 0.55)",
    }),
    [isDark]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          paddingHorizontal: 8,
          paddingVertical: 12,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
        },
        nodeHit: {
          alignItems: "center",
          justifyContent: "center",
        },
        nodeHitPressed: {
          opacity: 0.85,
        },
        node: {
          width: NODE,
          height: NODE,
          borderRadius: NODE / 2,
          alignItems: "center",
          justifyContent: "center",
        },
        nodeFilled: {
          backgroundColor: colors.primary,
        },
        nodeCurrentRing: {
          borderWidth: RING,
          borderColor: colors.primary,
          backgroundColor: colors.surface,
        },
        nodeUpcomingRing: {
          borderWidth: 2,
          borderColor: stepperMuted.ringPending,
          backgroundColor: colors.surface,
        },
        connector: {
          flex: 1,
          height: 2,
          minWidth: 8,
          maxHeight: 2,
          alignSelf: "center",
          marginHorizontal: 2,
          borderRadius: 1,
          overflow: "hidden",
        },
        connectorDone: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.primary,
        },
        connectorPending: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: stepperMuted.linePending,
        },
        connectorAnimatedFill: {
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          backgroundColor: colors.primary,
        },
        labelRow: {
          flexDirection: "row",
          marginTop: 8,
          width: "100%",
        },
        label: {
          ...typography.caption,
          flex: 1,
          textAlign: "center",
          color: colors.onSurfaceVariant,
          fontSize: 10,
        },
        labelActive: {
          color: colors.primary,
          fontWeight: "600",
        },
        labelDone: {
          color: colors.onSurfaceVariant,
        },
      }),
    [colors, typography, stepperMuted]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {labels.map((_, i) => (
          <Fragment key={i}>
            <Pressable
              onPress={() => {
                if (i < currentStep) onPressStep?.(i);
              }}
              disabled={i > currentStep}
              style={({ pressed }) => [
                styles.nodeHit,
                pressed && i < currentStep && styles.nodeHitPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}: ${labels[i]}`}
              accessibilityState={{
                disabled: i > currentStep,
                selected: i === currentStep,
              }}
            >
              {i < currentStep ? (
                <View style={[styles.node, styles.nodeFilled]}>
                  <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
                </View>
              ) : i === currentStep ? (
                <Animated.View
                  style={[
                    styles.node,
                    styles.nodeCurrentRing,
                    { transform: [{ scale: activeNodeScale }] },
                  ]}
                />
              ) : (
                <View style={[styles.node, styles.nodeUpcomingRing]} />
              )}
            </Pressable>
            {i < n - 1 && (
              <View style={styles.connector}>
                <View
                  style={currentStep > i ? styles.connectorDone : styles.connectorPending}
                />
                {animatingConnectorIndex === i && currentStep > i ? (
                  <Animated.View
                    style={[
                      styles.connectorAnimatedFill,
                      {
                        width: connectorProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                ) : null}
              </View>
            )}
          </Fragment>
        ))}
      </View>
      <View style={styles.labelRow}>
        {labels.map((label, i) => (
          <Text
            key={label}
            style={[
              styles.label,
              i === currentStep && styles.labelActive,
              i < currentStep && styles.labelDone,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}
