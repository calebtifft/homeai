import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { normalizePickedImageUri } from "../services/pickedImage";
import {
  appendLocalHistoryItem,
  claimStagingPipeline,
  historyStagingAttemptKey,
  patchLocalStagingSessionLabels,
  releaseStagingPipeline,
  stablePendingHistoryId,
  removeLocalHistoryItemById,
  type HistoryItem,
} from "../services/history";
import { formatStagingError, generateStagedImage } from "../services/staging";
import {
  ensureNotificationsReady,
  notifyStagingCompleteIfBackgrounded,
} from "../services/stagingNotifications";
import { recordStagingCompletion } from "../services/stagingUsage";
import { uploadStagingSession } from "../services/supabaseStorage";
import type { RootStackParamList } from "../types";

/** Bump when this module’s runtime contract changes (helps bust stale Metro lazy chunks). Rev 6: background notify + no cancel on leave. */
export const PROCESSING_SCREEN_MODULE_REV = 10;

type Props = NativeStackScreenProps<RootStackParamList, "Processing">;
const PROCESSING_TIMEOUT_MS = 120 * 1000;

function leaveProcessing(nav: Props["navigation"]) {
  if (nav.canGoBack()) {
    nav.goBack();
    return;
  }
  nav.navigate("Home");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error("Processing timed out. Please try again."));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(id);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(id);
        reject(error);
      });
  });
}

/** Stable identity for one staging run — exclude language/theme/navigation identity churn. */
function stagingJobKeyFromParams(params: Props["route"]["params"]): string {
  if (params.designMode === "exterior") {
    return JSON.stringify({
      imageUri: params.imageUri,
      designMode: "exterior" as const,
      exteriorSceneType: params.exteriorSceneType,
      exteriorStyle: params.exteriorStyle,
      photoMode: params.photoMode ?? "",
      paletteId: params.paletteId ?? "",
    });
  }
  if (params.designMode === "walls") {
    return JSON.stringify({
      imageUri: params.imageUri,
      designMode: "walls" as const,
      wallTreatment: params.wallTreatment,
      wallStyle: params.wallStyle,
      wallColorHex: params.wallColorHex ?? "",
      wallCustomPrompt: params.wallCustomPrompt ?? "",
      photoMode: params.photoMode ?? "",
      paletteId: params.paletteId ?? "",
    });
  }
  return JSON.stringify({
    imageUri: params.imageUri,
    designMode: "interior" as const,
    roomType: params.roomType,
    style: params.style,
    photoMode: params.photoMode ?? "",
    paletteId: params.paletteId ?? "",
  });
}

function pendingHistoryStubFromParams(
  params: Props["route"]["params"]
): HistoryItem {
  const isExterior = params.designMode === "exterior";
  const isWalls = params.designMode === "walls";
  return {
    id: "pending",
    imageUrl: params.imageUri,
    originalUri: params.imageUri,
    sourceUri: params.imageUri,
    status: "pending",
    designMode: isExterior ? "exterior" : isWalls ? "walls" : "interior",
    roomType: isExterior || isWalls ? undefined : params.roomType,
    style: isExterior || isWalls ? undefined : params.style,
    exteriorSceneType: isExterior ? params.exteriorSceneType : undefined,
    exteriorStyle: isExterior ? params.exteriorStyle : undefined,
    wallTreatment: isWalls ? params.wallTreatment : undefined,
    wallStyle: isWalls ? params.wallStyle : undefined,
    wallColorHex: isWalls ? params.wallColorHex : undefined,
    wallCustomPrompt: isWalls ? params.wallCustomPrompt : undefined,
    paletteId: params.paletteId,
  };
}

async function resolveStagingImageUri(imageUri: string): Promise<string> {
  if (Platform.OS === "web" || /^https?:\/\//i.test(imageUri)) {
    return imageUri;
  }
  return normalizePickedImageUri(imageUri);
}

export function ProcessingScreen({ route, navigation }: Props) {
  const params = route.params;
  const { user } = useAuth();
  const userIdRef = useRef<string | null>(user?.id ?? null);
  userIdRef.current = user?.id ?? null;
  const processingGenerationRef = useRef(0);
  const backgroundedRef = useRef(false);
  const completedRef = useRef(false);
  const { languageId, t } = useLanguage();
  const languageIdRef = useRef(languageId);
  const tRef = useRef(t);
  const navigationRef = useRef(navigation);
  languageIdRef.current = languageId;
  tRef.current = t;
  navigationRef.current = navigation;

  const stagingJobKey = useMemo(() => stagingJobKeyFromParams(params), [
    params.imageUri,
    params.designMode,
    params.designMode === "exterior"
      ? params.exteriorSceneType
      : params.designMode === "walls"
        ? params.wallTreatment
        : params.roomType,
    params.designMode === "exterior"
      ? params.exteriorStyle
      : params.designMode === "walls"
        ? params.wallStyle
        : params.style,
    params.designMode === "walls" ? params.wallColorHex : undefined,
    params.designMode === "walls" ? params.wallCustomPrompt : undefined,
    params.photoMode,
    params.paletteId,
  ]);

  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.surface,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 32,
        },
        title: {
          marginTop: 24,
          fontSize: 20,
          fontWeight: "600",
          color: colors.onSurface,
          textAlign: "center",
        },
        sub: {
          marginTop: 12,
          fontSize: 15,
          lineHeight: 22,
          color: colors.onSurfaceVariant,
          textAlign: "center",
          maxWidth: 300,
        },
        continueBtn: {
          marginTop: 18,
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: colors.surfaceContainerLow,
        },
        continueBtnText: {
          color: colors.primary,
          fontSize: 14,
          fontWeight: "600",
        },
      }),
    [colors]
  );

  const stagingAttemptKey = useMemo(
    () => historyStagingAttemptKey(pendingHistoryStubFromParams(params)),
    [stagingJobKey]
  );

  const pendingId = useMemo(
    () => stablePendingHistoryId(pendingHistoryStubFromParams(params)),
    [stagingJobKey]
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        backgroundedRef.current = true;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const myGeneration = ++processingGenerationRef.current;
    completedRef.current = false;
    const isStale = () => myGeneration !== processingGenerationRef.current;

    claimStagingPipeline(stagingAttemptKey, myGeneration);

    const finishPipeline = () => {
      releaseStagingPipeline(stagingAttemptKey, myGeneration);
    };

    const watchdogId = setTimeout(() => {
      if (isStale() || completedRef.current) return;
      completedRef.current = true;
      finishPipeline();
      void removeLocalHistoryItemById(pendingId);
      const tr = tRef.current;
      const nav = navigationRef.current;
      Alert.alert(tr("processing.title"), tr("processing.timeoutBody"), [
        { text: tr("common.ok"), onPress: () => leaveProcessing(nav) },
      ]);
    }, PROCESSING_TIMEOUT_MS);

    (async () => {
      try {
        if (Platform.OS !== "web") {
          void ensureNotificationsReady().catch(() => {
            /* non-fatal */
          });
        }

        const isExterior = params.designMode === "exterior";
        const isWalls = params.designMode === "walls";

        if (isStale()) return;

        const { resolveStagingAccess } = await import(
          "../services/subscriptionAccess"
        );
        const access = await resolveStagingAccess(userIdRef.current);
        if (!access.allowed) {
          finishPipeline();
          await removeLocalHistoryItemById(pendingId);
          if (isStale()) return;
          completedRef.current = true;
          const tr = tRef.current;
          const nav = navigationRef.current;
          Alert.alert(
            tr("usage.limitTitle"),
            tr("usage.limitBody", { limit: access.dailyLimit }),
            [
              {
                text: tr("configure.back"),
                style: "cancel",
                onPress: () => leaveProcessing(nav),
              },
              {
                text: tr("usage.subscribeCta"),
                onPress: () => {
                  leaveProcessing(nav);
                  nav.navigate("SubscriptionPlans");
                },
              },
            ]
          );
          return;
        }

        const stagingUri = await resolveStagingImageUri(params.imageUri);

        if (isStale()) return;

        await appendLocalHistoryItem({
          id: pendingId,
          imageUrl: stagingUri,
          originalUri: stagingUri,
          sourceUri: stagingUri,
          status: "pending",
          designMode: isExterior ? "exterior" : isWalls ? "walls" : "interior",
          roomType: isExterior || isWalls ? undefined : params.roomType,
          style: isExterior || isWalls ? undefined : params.style,
          exteriorSceneType: isExterior ? params.exteriorSceneType : undefined,
          exteriorStyle: isExterior ? params.exteriorStyle : undefined,
          wallTreatment: isWalls ? params.wallTreatment : undefined,
          wallStyle: isWalls ? params.wallStyle : undefined,
          wallColorHex: isWalls ? params.wallColorHex : undefined,
          wallCustomPrompt: isWalls ? params.wallCustomPrompt : undefined,
          paletteId: params.paletteId,
          createdAt: new Date().toISOString(),
        });

        if (isStale()) return;

        const generatedUri = await withTimeout(
          generateStagedImage(
            isExterior
              ? {
                  imageUri: stagingUri,
                  designMode: "exterior",
                  exteriorSceneType: params.exteriorSceneType,
                  exteriorStyle: params.exteriorStyle,
                  photoMode: params.photoMode,
                  paletteId: params.paletteId,
                }
              : isWalls
                ? {
                    imageUri: stagingUri,
                    designMode: "walls",
                    wallTreatment: params.wallTreatment,
                    wallStyle: params.wallStyle,
                    wallColorHex: params.wallColorHex,
                    wallCustomPrompt: params.wallCustomPrompt,
                    photoMode: params.photoMode,
                    paletteId: params.paletteId,
                  }
                : {
                    imageUri: stagingUri,
                    designMode: "interior",
                    roomType: params.roomType,
                    style: params.style,
                    photoMode: params.photoMode,
                    paletteId: params.paletteId,
                  }
          ),
          PROCESSING_TIMEOUT_MS
        );

        const leftProcessingFlow = backgroundedRef.current;

        const canShowResult =
          !leftProcessingFlow && myGeneration === processingGenerationRef.current;

        if (canShowResult) {
          const nav = navigationRef.current;
          if (isExterior) {
            nav.replace("Result", {
              originalUri: stagingUri,
              generatedUri,
              designMode: "exterior",
              exteriorSceneType: params.exteriorSceneType,
              exteriorStyle: params.exteriorStyle,
              photoMode: params.photoMode,
              paletteId: params.paletteId,
            });
          } else if (isWalls) {
            nav.replace("Result", {
              originalUri: stagingUri,
              generatedUri,
              designMode: "walls",
              wallTreatment: params.wallTreatment,
              wallStyle: params.wallStyle,
              wallColorHex: params.wallColorHex,
              wallCustomPrompt: params.wallCustomPrompt,
              photoMode: params.photoMode,
              paletteId: params.paletteId,
            });
          } else {
            nav.replace("Result", {
              originalUri: stagingUri,
              generatedUri,
              designMode: "interior",
              roomType: params.roomType,
              style: params.style,
              photoMode: params.photoMode,
              paletteId: params.paletteId,
            });
          }
        }

        clearTimeout(watchdogId);

        // User left Processing intentionally — finish job even if the screen unmounted.
        const finishThisJob =
          myGeneration === processingGenerationRef.current || leftProcessingFlow;
        if (!finishThisJob) {
          return;
        }

        completedRef.current = true;
        finishPipeline();
        void recordStagingCompletion().catch(() => {
          /* non-fatal */
        });

        void Image.prefetch(generatedUri).catch(() => {
          /* non-fatal */
        });

        void (async () => {
          if (leftProcessingFlow || AppState.currentState !== "active") {
            await notifyStagingCompleteIfBackgrounded(languageIdRef.current, {
              showWhileForeground: leftProcessingFlow,
            }).catch(() => {
              /* non-fatal */
            });
          }

          await appendLocalHistoryItem(
            isExterior
              ? {
                  id: pendingId,
                  imageUrl: generatedUri,
                  originalUri: stagingUri,
                  sourceUri: generatedUri,
                  status: "completed",
                  designMode: "exterior",
                  exteriorSceneType: params.exteriorSceneType,
                  exteriorStyle: params.exteriorStyle,
                  paletteId: params.paletteId,
                  createdAt: new Date().toISOString(),
                }
              : isWalls
                ? {
                    id: pendingId,
                    imageUrl: generatedUri,
                    originalUri: stagingUri,
                    sourceUri: generatedUri,
                    status: "completed",
                    designMode: "walls",
                    wallTreatment: params.wallTreatment,
                    wallStyle: params.wallStyle,
                    wallColorHex: params.wallColorHex,
                    wallCustomPrompt: params.wallCustomPrompt,
                    paletteId: params.paletteId,
                    createdAt: new Date().toISOString(),
                  }
                : {
                    id: pendingId,
                    imageUrl: generatedUri,
                    originalUri: stagingUri,
                    sourceUri: generatedUri,
                    status: "completed",
                    designMode: "interior",
                    roomType: params.roomType,
                    style: params.style,
                    paletteId: params.paletteId,
                    createdAt: new Date().toISOString(),
                  }
          );

          const uploaded = await uploadStagingSession(
            stagingUri,
            generatedUri,
            isExterior
              ? {
                  designMode: "exterior",
                  exteriorSceneType: params.exteriorSceneType,
                  exteriorStyle: params.exteriorStyle,
                  photoMode: params.photoMode,
                  paletteId: params.paletteId,
                }
              : isWalls
                ? {
                    designMode: "walls",
                    wallTreatment: params.wallTreatment,
                    wallStyle: params.wallStyle,
                    wallColorHex: params.wallColorHex,
                    wallCustomPrompt: params.wallCustomPrompt,
                    photoMode: params.photoMode,
                    paletteId: params.paletteId,
                  }
                : {
                    designMode: "interior",
                    roomType: params.roomType,
                    style: params.style,
                    photoMode: params.photoMode,
                    paletteId: params.paletteId,
                  }
          ).catch((err) => {
            console.warn("[HomeAI] Supabase upload failed", err);
            return null;
          });

          if (uploaded?.folder && generatedUri) {
            try {
              await patchLocalStagingSessionLabels({
                matchId: pendingId,
                stagingOutputUri: generatedUri,
                sessionFolder: uploaded.folder,
                serverSessionId: uploaded.sessionId,
              });
            } catch {
              /* non-fatal */
            }
          }

          if (__DEV__) {
            if (uploaded) {
              console.log("[HomeAI] Supabase upload OK", uploaded);
            } else {
              console.warn(
                "[HomeAI] Supabase upload skipped (check auth/session and env vars)."
              );
            }
          }
        })();
      } catch (e) {
        clearTimeout(watchdogId);
        finishPipeline();
        await removeLocalHistoryItemById(pendingId);
        const isCurrentRun = myGeneration === processingGenerationRef.current;
        if (!isCurrentRun) {
          return;
        }
        completedRef.current = true;
        const { title, message } = formatStagingError(e, languageIdRef.current);
        const tr = tRef.current;
        const nav = navigationRef.current;
        const errDetail = e instanceof Error ? e.message : String(e ?? "unknown");
        console.error("[HomeAI] Processing failed:", errDetail, e);
        Alert.alert(title, message, [
          { text: tr("common.ok"), onPress: () => leaveProcessing(nav) },
        ]);
      }
    })();

    return () => {
      // Leaving via "Continue in background" must not cancel the in-flight staging job.
      if (!backgroundedRef.current) {
        processingGenerationRef.current += 1;
      }
      if (!backgroundedRef.current) {
        releaseStagingPipeline(stagingAttemptKey, myGeneration);
      }
      clearTimeout(watchdogId);
    };
  }, [stagingJobKey, stagingAttemptKey, pendingId]);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.title}>{t("processing.title")}</Text>
      <Text style={styles.sub}>{t("processing.subtitle")}</Text>
      <Pressable
        onPress={() => {
          backgroundedRef.current = true;
          navigation.navigate("Home");
        }}
        style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.86 }]}
      >
        <Text style={styles.continueBtnText}>{t("processing.continueInBackground")}</Text>
      </Pressable>
    </View>
  );
}
