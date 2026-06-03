import "react-native-url-polyfill/auto";

import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { NavigationContainer } from "@react-navigation/native";
import { navigationRef } from "./navigation/navigationRef";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { LogBox, Platform, View } from "react-native";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { ConfigureScreen } from "./screens/ConfigureScreen";
import { ContactSupportScreen } from "./screens/ContactSupportScreen";
import { HelpCenterScreen } from "./screens/HelpCenterScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { HistoryDetailScreen } from "./screens/HistoryDetailScreen";
import { ProcessingScreen } from "./screens/ProcessingScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { LanguageScreen } from "./screens/LanguageScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SubscriptionPlansScreen } from "./screens/SubscriptionPlansScreen";
import { PrivacySecurityScreen } from "./screens/PrivacySecurityScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { getOnboardingComplete } from "./services/onboardingPreferences";
import {
  flushPendingNotificationNavigation,
  registerNotificationNavigationListeners,
} from "./services/notificationNavigation";
import {
  ensureAndroidStagingNotificationChannel,
  ensureNotificationsReady,
  registerStagingNotificationHandler,
} from "./services/stagingNotifications";
import { buildAppNavigationTheme } from "./theme/navigationTheme";
import type { RootStackParamList } from "./types";

SplashScreen.preventAutoHideAsync();

// Supabase auth-js calls `console.error(err)` from `_emitInitialSession` when the
// very first session load can't reach the auth server (common on iPhone right after
// launch / Wi-Fi handoff). The app handles those failures gracefully — silence the
// noisy dev-only LogBox overlay so they don't look like real crashes.
if (__DEV__) {
  LogBox.ignoreLogs([
    /AuthRetryableFetchError/,
    /network request failed/i,
    /"status":\s*503/,
  ]);
}

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator({
  initialRouteName,
}: {
  initialRouteName: keyof RootStackParamList;
}) {
  const { colors, isDark } = useTheme();
  const navigationTheme = useMemo(
    () => buildAppNavigationTheme(colors, isDark),
    [colors, isDark]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        onReady={flushPendingNotificationNavigation}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack.Navigator
          initialRouteName={initialRouteName}
          screenOptions={{
            headerTitleStyle: {
              fontFamily: "Manrope_700Bold",
              fontSize: 17,
              color: colors.onSurface,
            },
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.primary,
            contentStyle: { backgroundColor: colors.surface },
          }}
        >
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ headerShown: false, freezeOnBlur: true }}
          />
          <Stack.Screen
            name="HistoryDetail"
            component={HistoryDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Language"
            component={LanguageScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PrivacySecurity"
            component={PrivacySecurityScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SubscriptionPlans"
            component={SubscriptionPlansScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="HelpCenter"
            component={HelpCenterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ContactSupport"
            component={ContactSupportScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Configure"
            component={ConfigureScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Processing"
            component={ProcessingScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Result"
            component={ResultScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

function RootNavigatorGate() {
  const { colors } = useTheme();
  const [bootReady, setBootReady] = useState(false);
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList>("Home");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const done = await getOnboardingComplete();
        if (!cancelled) {
          setInitialRoute(done ? "Home" : "Onboarding");
        }
      } finally {
        if (!cancelled) setBootReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootReady) {
    return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  }

  return <RootNavigator initialRouteName={initialRoute} />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    registerStagingNotificationHandler();
    void ensureAndroidStagingNotificationChannel();
    void ensureNotificationsReady();
    return registerNotificationNavigationListeners();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <RootNavigatorGate />
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
