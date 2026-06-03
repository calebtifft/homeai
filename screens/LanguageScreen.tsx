import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  LayoutAnimation,
  ListRenderItem,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { StackScreenHeader } from "../components/StackScreenHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LANGUAGES, type LanguageId } from "../constants/languages";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { translate } from "../locales/strings";
import type { RootStackParamList } from "../types";
import { Manrope, radius, type ThemePalette } from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "Language">;

function createLanguageStyles(colors: ThemePalette) {
  return StyleSheet.create({
    list: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
      maxWidth: 448,
      width: "100%",
      alignSelf: "center",
    },
    /** Mirrors `SubscriptionPlansScreen` plan rows: idle vs selected border only. */
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 76,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: radius.lg,
      marginBottom: 12,
      borderWidth: 1.5,
      overflow: "hidden",
    },
    rowIdle: {
      backgroundColor: colors.surfaceContainerLow,
      borderColor: "transparent",
    },
    rowSelected: {
      backgroundColor: colors.surfaceContainerLow,
      borderColor: colors.primaryDim,
    },
    flagBubble: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceContainer,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    flagEmoji: {
      fontSize: 26,
    },
    label: {
      flex: 1,
      paddingRight: 12,
      fontFamily: Manrope.bold,
      fontSize: 17,
      letterSpacing: -0.2,
      color: colors.onSurface,
      lineHeight: 22,
    },
    headerBtn: {
      width: 34,
      height: 34,
      marginRight: 4,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.primaryContainer,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOpacity: 0.18,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
  });
}

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental != null
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function LanguageOptionRow({
  item,
  selected,
  onSelect,
  styles,
}: {
  item: (typeof LANGUAGES)[number];
  selected: boolean;
  onSelect: () => void;
  styles: ReturnType<typeof createLanguageStyles>;
}) {
  const { isDark } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const prevSelected = useRef(false);

  const androidRipple =
    Platform.OS === "android"
      ? {
          color: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.07)",
        }
      : undefined;

  useEffect(() => {
    if (selected && !prevSelected.current) {
      scale.setValue(0.986);
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 132,
        useNativeDriver: true,
      }).start();
    }
    prevSelected.current = selected;
  }, [selected, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onSelect}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        android_ripple={androidRipple}
        style={({ pressed }) => [
          styles.row,
          selected ? styles.rowSelected : styles.rowIdle,
          pressed &&
            (Platform.OS === "ios"
              ? { opacity: 0.9, transform: [{ scale: 0.985 }] }
              : { opacity: 0.97 }),
        ]}
      >
        <View style={styles.flagBubble}>
          <Text style={styles.flagEmoji}>{item.flag}</Text>
        </View>
        <Text style={styles.label} numberOfLines={2}>
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function LanguageScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { languageId, setLanguageId, t, queueLanguageSavedToast } = useLanguage();
  const { colors } = useTheme();
  const [pendingId, setPendingId] = useState<LanguageId>(languageId);

  const styles = useMemo(() => createLanguageStyles(colors), [colors]);

  useFocusEffect(
    useCallback(() => {
      setPendingId(languageId);
    }, [languageId])
  );

  const onConfirm = useCallback(async () => {
    await setLanguageId(pendingId);
    queueLanguageSavedToast(translate(pendingId, "language.saved"));
    navigation.goBack();
  }, [pendingId, setLanguageId, navigation, queueLanguageSavedToast]);

  const selectLanguage = useCallback((id: LanguageId) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        180,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );
    setPendingId(id);
  }, []);

  const renderItem: ListRenderItem<(typeof LANGUAGES)[number]> = useCallback(
    ({ item }) => (
      <LanguageOptionRow
        item={item}
        selected={item.id === pendingId}
        onSelect={() => selectLanguage(item.id)}
        styles={styles}
      />
    ),
    [pendingId, selectLanguage, styles]
  );

  const keyExtractor = useCallback((item: (typeof LANGUAGES)[number]) => item.id, []);

  const saveControl = (
    <Pressable
      onPress={onConfirm}
      style={({ pressed }) => [
        styles.headerBtn,
        pressed && { opacity: 0.88 },
      ]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t("language.saveA11y")}
    >
      <MaterialIcons name="check" size={18} color={colors.onPrimary} />
    </Pressable>
  );

  return (
    <View style={[styles.list, { paddingBottom: insets.bottom }]}>
      <StackScreenHeader title={t("language.title")} right={saveControl} />
      <FlatList
        data={[...LANGUAGES]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
