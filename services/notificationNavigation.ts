import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { navigateFromNotification } from "../navigation/navigationRef";

type NotificationRoute = "History" | "Home";

let pendingRoute: NotificationRoute | null = null;

function routeFromData(data: unknown): NotificationRoute | null {
  if (data == null || typeof data !== "object") return null;
  const route = (data as { route?: string }).route;
  if (route === "History" || route === "Home") return route;
  return null;
}

function deliverRoute(route: NotificationRoute): void {
  if (navigateFromNotification(route)) {
    pendingRoute = null;
    return;
  }
  pendingRoute = route;
}

function handleNotificationResponse(
  response: Notifications.NotificationResponse | null
): void {
  if (!response) return;
  const route = routeFromData(response.notification.request.content.data);
  if (route) deliverRoute(route);
}

/** Call from NavigationContainer onReady so cold-start taps reach History. */
export function flushPendingNotificationNavigation(): void {
  if (!pendingRoute) return;
  deliverRoute(pendingRoute);
}

/** Wire notification taps (and cold-start opens) to in-app navigation. */
export function registerNotificationNavigationListeners(): () => void {
  if (Platform.OS === "web") return () => {};

  void Notifications.getLastNotificationResponseAsync().then((last) => {
    handleNotificationResponse(last);
  });

  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    handleNotificationResponse(res);
  });

  return () => sub.remove();
}
