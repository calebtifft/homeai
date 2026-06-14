import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColorPaletteGrid } from "../components/ColorPaletteGrid";
import { ConfigureStepper } from "../components/ConfigureStepper";
import { StackScreenHeader } from "../components/StackScreenHeader";
import { PrimaryCTA } from "../components/PrimaryCTA";
import { RoomTypeTile } from "../components/RoomTypeTile";
import { InteriorStyleGrid } from "../components/InteriorStyleGrid";
import { WallColorGrid } from "../components/WallColorGrid";
import { ColorWheelPicker } from "../components/ColorWheelPicker";
import { DEFAULT_STAGING_PALETTE_ID } from "../constants/colorPalettes";
import {
  EXTERIOR_SCENE_TYPES,
  EXTERIOR_STYLES,
  type ExteriorSceneType,
  type ExteriorStyleType,
} from "../constants/exteriorDesign";
import {
  WALL_QUICK_COLORS,
  WALL_TREATMENT_TYPES,
  DEFAULT_WALL_TREATMENT,
  defaultWallPresetForTreatment,
  getWallPresetSwatch,
  normalizeWallColorHex,
  wallPresetsForTreatment,
  wallQuickColorIdForHex,
  wallTreatmentForPreset,
  type WallQuickColorId,
  type WallStylePresetId,
  type WallTreatmentType,
} from "../constants/wallsDesign";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { normalizePickedImageUri } from "../services/pickedImage";
import {
  isCameraAccessGranted,
  isMediaLibraryAccessGranted,
  shouldOfferPermissionSettings,
} from "../utils/permissions";
import { formatStagingError } from "../services/staging";
import {
  EXTERIOR_SCENE_LABEL_KEY,
  EXTERIOR_STYLE_LABEL_KEY,
} from "../locales/exteriorDesignKeys";
import { PALETTE_LABEL_KEY } from "../locales/paletteLabelKeys";
import { ROOM_TYPE_LABEL_KEY, STYLE_LABEL_KEY } from "../locales/roomStyleKeys";
import {
  WALL_COLOR_LABEL_KEY,
  WALL_PRESET_LABEL_KEY,
  WALL_TREATMENT_LABEL_KEY,
} from "../locales/wallsKeys";
import type {
  DesignMode,
  RootStackParamList,
  RoomType,
  StagingPaletteId,
  StagingPhotoMode,
  StyleType,
} from "../types";
import { Manrope, radius } from "../theme/curatedCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "Configure">;

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

const ROOM_TYPES: RoomType[] = [
  "Living Room",
  "Bedroom",
  "Kitchen",
  "Bathroom",
  "Home Office",
  "Study Room",
  "Restaurant",
];

const STYLES: StyleType[] = [
  "Modern",
  "Contemporary",
  "Traditional",
  "Transitional",
  "Mid-Century",
  "Rustic",
  "Luxe",
  "Minimal",
  "Mediterranean",
  "Biophilic",
  "Airbnb",
  "Soho Style",
  "Rainbow",
  "Cozy",
  "Coastal",
  "Japandi",
  "Cottagecore",
  "Wood",
];

const ROOM_TYPE_ICONS: Record<RoomType, MaterialIconName> = {
  "Living Room": "weekend",
  Bedroom: "bed",
  Kitchen: "kitchen",
  Bathroom: "bathtub",
  "Home Office": "computer",
  "Study Room": "menu-book",
  Restaurant: "restaurant",
};

const WALL_TREATMENT_ICONS: Record<WallTreatmentType, MaterialIconName> = {
  Paint: "format-paint",
  "Accent Wall": "view-quilt",
  Wallpaper: "wallpaper",
  "Wood Paneling": "view-week",
  Tile: "grid-view",
  Mural: "image",
  Custom: "edit",
};

const EXTERIOR_SCENE_ICONS: Record<ExteriorSceneType, MaterialIconName> = {
  "Front Facade": "home",
  "Backyard & Patio": "weekend",
  "Pool & Spa": "water",
  "Garden & Landscaping": "yard",
  "Driveway & Entry": "directions-car",
  "Balcony & Terrace": "hotel",
  "Rooftop Deck": "apartment",
  "Side Yard": "straighten",
  Courtyard: "apps",
  "Commercial Storefront": "location-city",
};

const EXTERIOR_STYLE_ICONS: Record<ExteriorStyleType, MaterialIconName> = {
  "Modern Facade": "business",
  "Contemporary Lines": "layers",
  "Classic Colonial": "menu-book",
  "Mediterranean Villa": "wb-sunny",
  "Craftsman Charm": "home-work",
  "Modern Farmhouse": "park",
  "Coastal Cottage": "water",
  "Desert Modern": "wb-sunny",
  "Industrial Exterior": "layers",
  "Minimal Nordic": "crop-square",
  "Tudor Revival": "menu-book",
  "Spanish Revival": "wb-sunny",
  "Tropical Resort": "water",
  "Japandi Exterior": "balance",
  "Mid-Century Curb": "chair",
  "Rustic Lodge": "forest",
};

const STYLE_ICONS: Record<StyleType, MaterialIconName> = {
  Modern: "business",
  Contemporary: "layers",
  Traditional: "menu-book",
  Transitional: "swap-horiz",
  "Mid-Century": "chair",
  Rustic: "park",
  Luxe: "workspace-premium",
  Minimal: "crop-square",
  Mediterranean: "wb-sunny",
  Biophilic: "eco",
  Airbnb: "hotel",
  "Soho Style": "location-city",
  Rainbow: "color-lens",
  Cozy: "favorite",
  Coastal: "water",
  Japandi: "balance",
  Cottagecore: "yard",
  Wood: "forest",
};

const INTERIOR_EXTERIOR_LAST_STEP = 4;

export function ConfigureScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t, languageId } = useLanguage();
  const designMode: DesignMode = route.params.designMode ?? "interior";
  const isExterior = designMode === "exterior";
  const isWalls = designMode === "walls";
  const [imageUri, setImageUri] = useState<string | null>(route.params.imageUri ?? null);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [step, setStep] = useState(0);
  const [roomType, setRoomType] = useState<RoomType | null>(
    route.params.presetRoomType ?? null
  );
  const [style, setStyle] = useState<StyleType | null>(route.params.presetStyle ?? null);
  const [exteriorScene, setExteriorScene] = useState<ExteriorSceneType | null>(
    route.params.presetExteriorScene ?? null
  );
  const [exteriorStyle, setExteriorStyle] = useState<ExteriorStyleType | null>(
    route.params.presetExteriorStyle ?? null
  );
  const [wallTreatment, setWallTreatment] = useState<WallTreatmentType | null>(
    route.params.presetWallTreatment ??
      (route.params.presetWallStyle
        ? wallTreatmentForPreset(route.params.presetWallStyle)
        : isWalls
          ? DEFAULT_WALL_TREATMENT
          : null)
  );
  const [wallStyleId, setWallStyleId] = useState<WallStylePresetId | null>(
    route.params.presetWallStyle ??
      (route.params.presetWallTreatment
        ? defaultWallPresetForTreatment(route.params.presetWallTreatment)
        : isWalls
          ? defaultWallPresetForTreatment(DEFAULT_WALL_TREATMENT)
          : null)
  );
  const [wallColorInput, setWallColorInput] = useState<string>("");
  const [wallCustomColorActive, setWallCustomColorActive] = useState<boolean>(false);
  const [colorWheelOpen, setColorWheelOpen] = useState<boolean>(false);
  const wallHexInputRef = useRef<TextInput>(null);
  const [wallCustomPrompt, setWallCustomPrompt] = useState<string>("");
  const [paletteId, setPaletteId] = useState<StagingPaletteId>(
    DEFAULT_STAGING_PALETTE_ID
  );
  const [photoMode, setPhotoMode] = useState<StagingPhotoMode>("empty");
  const { colors, typography, ambientShadow, isDark } = useTheme();

  const wallsHasCustomizeStep = wallTreatment === "Custom";
  /** Custom flow skips the Finish preset step; omit that row on review as well. */
  const hideWallsFinishReviewRow =
    wallTreatment === "Custom" || wallStyleId === "custom_paint_color";

  const lastStep = useMemo(
    () => (isWalls ? 3 : INTERIOR_EXTERIOR_LAST_STEP),
    [isWalls]
  );

  const isReviewStep = useMemo(
    () => (isWalls ? step === 3 : step === INTERIOR_EXTERIOR_LAST_STEP),
    [isWalls, step]
  );

  useEffect(() => {
    setStep((s) => (s > lastStep ? lastStep : s));
  }, [lastStep]);

  const normalizedWallColor = useMemo(
    () => normalizeWallColorHex(wallColorInput),
    [wallColorInput]
  );
  const wallColorInputInvalid = wallColorInput.trim().length > 0 && !normalizedWallColor;
  const selectedWallQuickColorId: WallQuickColorId | undefined = useMemo(() => {
    if (!normalizedWallColor) {
      return wallCustomColorActive ? "custom" : undefined;
    }
    return wallQuickColorIdForHex(normalizedWallColor) ?? "custom";
  }, [normalizedWallColor, wallCustomColorActive]);

  const onSelectWallQuickColor = useCallback((id: WallQuickColorId) => {
    if (id === "custom") {
      setWallCustomColorActive(true);
      setColorWheelOpen(true);
      return;
    }
    const hit = WALL_QUICK_COLORS.find((c) => c.id === id);
    if (hit?.hex) {
      setWallColorInput(hit.hex);
      setWallCustomColorActive(false);
    }
  }, []);

  const onConfirmColorWheel = useCallback((hex: string) => {
    setWallColorInput(hex);
    setWallCustomColorActive(true);
    setColorWheelOpen(false);
  }, []);

  const wallQuickColorLabelFor = useCallback(
    (id: WallQuickColorId) => t(WALL_COLOR_LABEL_KEY[id]),
    [t]
  );

  const stepLabels = useMemo(
    () =>
      isWalls
        ? wallsHasCustomizeStep
          ? ([
              t("configure.stepPhoto"),
              t("configure.stepTreatment"),
              t("configure.stepCustom"),
              t("configure.stepReview"),
            ] as const)
          : ([
              t("configure.stepPhoto"),
              t("configure.stepTreatment"),
              t("configure.stepFinish"),
              t("configure.stepReview"),
            ] as const)
        : ([
            t("configure.stepPhoto"),
            isExterior ? t("configure.stepScene") : t("configure.stepRoom"),
            t("configure.stepStyle"),
            t("configure.stepPalette"),
            t("configure.stepReview"),
          ] as const),
    [isExterior, isWalls, t, wallsHasCustomizeStep]
  );

  useEffect(() => {
    setImageUri(route.params.imageUri ?? null);
  }, [route.params.imageUri]);

  // Only apply keys that are still present on the route. `setParams({ imageUri })` can omit
  // preset fields; syncing `presetStyle ?? null` would clear the Explore preset before the style step.
  useEffect(() => {
    const p = route.params;
    if ("presetRoomType" in p) setRoomType(p.presetRoomType ?? null);
    if ("presetStyle" in p) setStyle(p.presetStyle ?? null);
    if ("presetExteriorScene" in p) setExteriorScene(p.presetExteriorScene ?? null);
    if ("presetExteriorStyle" in p) setExteriorStyle(p.presetExteriorStyle ?? null);
    if ("presetWallTreatment" in p && p.presetWallTreatment) {
      setWallTreatment(p.presetWallTreatment);
      if (!p.presetWallStyle) {
        setWallStyleId(defaultWallPresetForTreatment(p.presetWallTreatment));
      }
    }
    if ("presetWallStyle" in p && p.presetWallStyle) {
      setWallStyleId(p.presetWallStyle);
      setWallTreatment(wallTreatmentForPreset(p.presetWallStyle));
    }
  }, [route.params]);

  const onSelectWallTreatment = useCallback((next: WallTreatmentType) => {
    setWallTreatment(next);
    setWallStyleId(defaultWallPresetForTreatment(next));
    if (next !== "Custom") {
      setWallColorInput("");
      setWallCustomPrompt("");
      setWallCustomColorActive(false);
      setColorWheelOpen(false);
    }
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.surface,
        },
        topChrome: {
          backgroundColor: colors.surface,
        },
        stepperWrap: {
          paddingHorizontal: 16,
          paddingBottom: 4,
        },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 24,
        },
        previewWrap: {
          width: "100%",
          maxWidth: 400,
          alignSelf: "center",
          borderRadius: radius.xl,
          overflow: "hidden",
          backgroundColor: colors.surfaceContainer,
          marginBottom: 16,
        },
        photoPreparingOverlay: {
          ...StyleSheet.absoluteFillObject,
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          backgroundColor: "rgba(0,0,0,0.45)",
          zIndex: 2,
        },
        photoPreparingLabel: {
          fontFamily: Manrope.medium,
          fontSize: 14,
          color: "#FFFFFF",
        },
        preview: {
          width: "100%",
          aspectRatio: 4 / 5,
          opacity: 0.95,
        },
        previewGradient: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "45%",
          borderBottomLeftRadius: radius.xl,
          borderBottomRightRadius: radius.xl,
        },
        previewFooter: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        },
        previewTitle: {
          textShadowColor: "rgba(0,0,0,0.35)",
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
        previewMeta: {
          marginTop: 4,
          textShadowColor: "rgba(0,0,0,0.35)",
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
        previewEmpty: {
          justifyContent: "center",
    alignItems: "center",
          backgroundColor: colors.surfaceContainer,
          paddingHorizontal: 24,
        },
        previewEmptyIconWrap: {
          width: 72,
          height: 72,
          borderRadius: 36,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark
            ? "rgba(52, 143, 104, 0.18)"
            : "rgba(52, 143, 104, 0.14)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(52, 143, 104, 0.35)"
            : "rgba(52, 143, 104, 0.3)",
          marginBottom: 14,
        },
        previewEmptyTitle: {
          textAlign: "center",
          marginBottom: 6,
        },
        previewEmptySub: {
          textAlign: "center",
          opacity: 0.84,
          maxWidth: 270,
        },
        editChip: {
          padding: 12,
          borderRadius: radius.xl,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.14)"
            : "rgba(255,255,255,0.82)",
        },
        stepIntro: {
          textAlign: "center",
          opacity: 0.75,
          maxWidth: 400,
    alignSelf: "center",
  },
        photoTipsBox: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          marginTop: 16,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceContainerLow,
          maxWidth: 400,
          alignSelf: "center",
          width: "100%",
        },
        photoTipsTextCol: { flex: 1 },
        photoTipsTitle: { marginBottom: 4 },
        photoTipsBody: { opacity: 0.82, lineHeight: 20 },
        stepTitle: {
          marginBottom: 4,
    width: "100%",
          maxWidth: 400,
    alignSelf: "center",
  },
        stepSubtitle: {
          marginBottom: 16,
    width: "100%",
          maxWidth: 400,
          alignSelf: "center",
  },
        photoModeBlock: {
    width: "100%",
          maxWidth: 400,
          alignSelf: "center",
          marginBottom: 16,
        },
        photoModeLabel: {
          marginBottom: 10,
        },
        photoModeRow: {
          flexDirection: "row",
          gap: 8,
          padding: 4,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
          backgroundColor: colors.surfaceContainerLow,
        },
        photoModeChip: {
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 10,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: "transparent",
          backgroundColor: "transparent",
          alignItems: "center",
        },
        photoModeChipSelected: {
          borderColor: isDark ? "rgba(52, 143, 104, 0.45)" : "rgba(52, 143, 104, 0.35)",
          backgroundColor: colors.primary,
        },
        photoModeChipText: {
          textAlign: "center",
          fontFamily: Manrope.semiBold,
          letterSpacing: 0.1,
          fontSize: 12,
          lineHeight: 18,
        },
        photoModeHint: {
          marginTop: 10,
          opacity: 0.82,
        },
        roomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
          maxWidth: 400,
          alignSelf: "center",
        },
        reviewCard: {
          width: "100%",
          maxWidth: 400,
          alignSelf: "center",
          borderRadius: radius.xl,
          overflow: "hidden",
          backgroundColor: colors.surfaceBright,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
          marginBottom: 16,
        },
        reviewImageBlock: {
          position: "relative",
          width: "100%",
          height: 200,
          backgroundColor: colors.surfaceContainer,
        },
        reviewHeroImage: {
          width: "100%",
          height: "100%",
        },
        reviewImageGradient: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "50%",
        },
        reviewBody: {
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: 22,
          backgroundColor: colors.surfaceBright,
        },
        reviewKicker: {
          marginBottom: 14,
          opacity: 0.85,
        },
        reviewRow: {
          flexDirection: "row",
    alignItems: "center",
          gap: 14,
          paddingVertical: 4,
        },
        reviewIconBubble: {
          width: 48,
          height: 48,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceContainerLow,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.12)"
            : "rgba(177, 177, 188, 0.25)",
        },
        reviewRowTexts: {
          flex: 1,
        },
        reviewPrimaryValue: {
          marginTop: 4,
          letterSpacing: -0.2,
        },
        reviewDivider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.surfaceContainerHigh,
          marginVertical: 14,
        },
        reviewFootnote: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
          maxWidth: 400,
          alignSelf: "center",
          paddingHorizontal: 4,
        },
        reviewFootnoteText: {
          flex: 1,
          opacity: 0.8,
          paddingTop: 1,
        },
        footer: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.surfaceContainerHigh,
          paddingTop: 12,
          backgroundColor: colors.surface,
        },
        backBtn: {
          paddingVertical: 14,
          paddingHorizontal: 8,
          minWidth: 72,
          justifyContent: "center",
        },
        backBtnPressed: {
          opacity: 0.7,
        },
        footerCta: {
          flex: 1,
        },
        footerCtaFull: {
          flex: 1,
          marginLeft: 0,
        },
        wallFinishGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          width: "100%",
          maxWidth: 400,
          alignSelf: "center",
        },
        wallFinishCard: {
          width: "31%",
          minWidth: 92,
          paddingTop: 12,
          paddingBottom: 10,
          paddingHorizontal: 8,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
          backgroundColor: colors.surfaceContainerLowest,
          alignItems: "center",
          position: "relative",
        },
        wallFinishCardSelected: {
          borderColor: colors.primary,
          backgroundColor: isDark
            ? "rgba(115, 134, 86, 0.18)"
            : "rgba(115, 134, 86, 0.10)",
        },
        wallSwatch: {
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.16)"
            : "rgba(0,0,0,0.12)",
          marginBottom: 8,
        },
        wallFinishLabel: {
          fontFamily: Manrope.semiBold,
          fontSize: 12,
          letterSpacing: -0.05,
          textAlign: "center",
          color: colors.onSurface,
        },
        wallFinishCheck: {
          position: "absolute",
          top: 6,
          right: 6,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        wallCustomBlock: {
          width: "100%",
          maxWidth: 400,
          alignSelf: "center",
          gap: 6,
        },
        wallCustomLabel: {
          marginBottom: 6,
        },
        wallCustomLabelTop: {
          marginTop: 18,
        },
        wallQuickColorsHint: {
    marginTop: 8,
          color: colors.onSurfaceVariant,
        },
        wallWheelCta: {
          marginTop: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: isDark
            ? "rgba(115, 134, 86, 0.14)"
            : "rgba(115, 134, 86, 0.08)",
        },
        wallWheelCtaText: {
          color: colors.primary,
        },
        wallHexRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
          backgroundColor: colors.surfaceContainerLow,
        },
        wallHexRowInvalid: {
          borderColor: "#B3261E",
        },
        wallHexPreview: {
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.18)"
            : "rgba(0,0,0,0.14)",
        },
        wallHexInput: {
          flex: 1,
          fontFamily: Manrope.medium,
          fontSize: 15,
          letterSpacing: 0.5,
          paddingVertical: 4,
        },
        wallHexError: {
          marginTop: 4,
          color: "#B3261E",
        },
        wallCustomTextarea: {
          minHeight: 96,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
          backgroundColor: colors.surfaceContainerLow,
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 12,
          fontFamily: Manrope.medium,
          fontSize: 14,
          lineHeight: 20,
          textAlignVertical: "top",
        },
        wallScopeNote: {
          marginTop: 12,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
        },
        wallScopeNoteText: {
          flex: 1,
          opacity: 0.82,
          paddingTop: 1,
        },
      }),
    [colors, isDark]
  );

  const onGenerate = useCallback(() => {
    if (!imageUri) {
      Alert.alert(t("configure.permissionPhotosTitle"), t("configure.permissionPhotosBody"));
      return;
    }

    if (isWalls) {
      if (!wallTreatment || !wallStyleId) {
        Alert.alert(t("configure.permissionPhotosTitle"), t("configure.incompleteSetup"));
        return;
      }
      if (wallTreatment === "Custom" && wallColorInputInvalid) {
        Alert.alert(
          t("configure.permissionPhotosTitle"),
          t("configure.wallsCustomInvalidHex")
        );
        return;
      }
      const trimmedPrompt = wallCustomPrompt.trim();
      navigation.navigate("Processing", {
        imageUri,
        designMode: "walls",
        wallTreatment,
        wallStyle: wallStyleId,
        wallColorHex:
          wallTreatment === "Custom" ? normalizedWallColor ?? undefined : undefined,
        wallCustomPrompt:
          wallTreatment === "Custom" && trimmedPrompt.length > 0
            ? trimmedPrompt
            : undefined,
        photoMode,
        paletteId,
      });
      return;
    }
    if (isExterior) {
      if (!exteriorScene || !exteriorStyle) {
        Alert.alert(t("configure.permissionPhotosTitle"), t("configure.incompleteSetup"));
        return;
      }
      navigation.navigate("Processing", {
        imageUri,
        designMode: "exterior",
        exteriorSceneType: exteriorScene,
        exteriorStyle,
        photoMode,
        paletteId,
      });
      return;
    }
    if (!roomType || !style) {
      Alert.alert(t("configure.permissionPhotosTitle"), t("configure.incompleteSetup"));
      return;
    }
    navigation.navigate("Processing", {
      imageUri,
      designMode: "interior",
      roomType,
      style,
      photoMode,
      paletteId,
    });
  }, [
    exteriorScene,
    exteriorStyle,
    imageUri,
    isExterior,
    isWalls,
    navigation,
    normalizedWallColor,
    paletteId,
    photoMode,
    roomType,
    style,
    t,
    wallColorInputInvalid,
    wallCustomPrompt,
    wallStyleId,
    wallTreatment,
  ]);

  const goNext = useCallback(() => {
    const canProceed =
      step === 0
        ? Boolean(imageUri)
        : step === 1
          ? isWalls
            ? Boolean(wallTreatment)
            : isExterior
              ? Boolean(exteriorScene)
              : Boolean(roomType)
          : step === 2
            ? isWalls
              ? wallsHasCustomizeStep
                ? !wallColorInputInvalid
                : Boolean(wallStyleId)
              : isExterior
                ? Boolean(exteriorStyle)
                : Boolean(style)
            : step === 3
              ? true
              : true;
    if (!canProceed) return;
    setStep((s) => Math.min(s + 1, lastStep));
  }, [
    exteriorScene,
    exteriorStyle,
    imageUri,
    isExterior,
    isWalls,
    roomType,
    step,
    style,
    wallColorInputInvalid,
    wallStyleId,
    wallTreatment,
    wallsHasCustomizeStep,
    lastStep,
  ]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const onPressStep = useCallback(
    (index: number) => {
      const maxReachable =
        !imageUri
          ? 0
          : isWalls
            ? !wallTreatment
              ? 1
              : wallsHasCustomizeStep
                ? wallColorInputInvalid
                  ? 2
                  : lastStep
                : !wallStyleId
                  ? 2
                  : lastStep
            : isExterior
              ? !exteriorScene
                ? 1
                : !exteriorStyle
                  ? 2
                  : lastStep
              : !roomType
                ? 1
                : !style
                  ? 2
                  : lastStep;
      setStep(Math.min(index, maxReachable));
    },
    [
      exteriorScene,
      exteriorStyle,
      imageUri,
      isExterior,
      isWalls,
      roomType,
      style,
      wallColorInputInvalid,
      wallStyleId,
      wallTreatment,
      wallsHasCustomizeStep,
      lastStep,
    ]
  );

  const applyPickedPhoto = useCallback(
    async (rawUri: string) => {
      setPhotoPreparing(true);
      try {
        const uri = await normalizePickedImageUri(rawUri);
        setImageUri(uri);
        navigation.setParams({
          imageUri: uri,
          ...(roomType != null ? { presetRoomType: roomType } : {}),
          ...(style != null ? { presetStyle: style } : {}),
          ...(exteriorScene != null ? { presetExteriorScene: exteriorScene } : {}),
          ...(exteriorStyle != null ? { presetExteriorStyle: exteriorStyle } : {}),
          ...(wallTreatment != null ? { presetWallTreatment: wallTreatment } : {}),
          ...(wallStyleId != null ? { presetWallStyle: wallStyleId } : {}),
        });
      } catch (e) {
        const { title, message } = formatStagingError(e, languageId);
        Alert.alert(title, message);
      } finally {
        setPhotoPreparing(false);
      }
    },
    [
      exteriorScene,
      exteriorStyle,
      languageId,
      navigation,
      roomType,
      style,
      wallStyleId,
      wallTreatment,
    ]
  );

  const iosPickerOptions = useMemo(
    () =>
      Platform.OS === "ios"
        ? {
            preferredAssetRepresentationMode:
              ImagePicker.UIImagePickerPreferredAssetRepresentationMode
                .Compatible,
          }
        : {},
    []
  );

  const onTakePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!isCameraAccessGranted(permission.status)) {
      const buttons: { text: string; style?: "cancel"; onPress?: () => void }[] = [
        { text: t("common.ok"), style: "cancel" },
      ];
      if (shouldOfferPermissionSettings(permission.status, permission.canAskAgain)) {
        buttons.push({
          text: t("settings.notificationsOpenSettings"),
          onPress: () => {
            void Linking.openSettings();
          },
        });
      }
      Alert.alert(
        t("configure.permissionCameraTitle"),
        t("configure.permissionCameraBody"),
        buttons
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      ...iosPickerOptions,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    await applyPickedPhoto(result.assets[0].uri);
  }, [applyPickedPhoto, iosPickerOptions, t]);

  const onChooseFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!isMediaLibraryAccessGranted(permission.status)) {
      const buttons: { text: string; style?: "cancel"; onPress?: () => void }[] = [
        { text: t("common.ok"), style: "cancel" },
      ];
      if (shouldOfferPermissionSettings(permission.status, permission.canAskAgain)) {
        buttons.push({
          text: t("settings.notificationsOpenSettings"),
          onPress: () => {
            void Linking.openSettings();
          },
        });
      }
      Alert.alert(
        t("configure.permissionPhotosTitle"),
        t("configure.permissionPhotosBody"),
        buttons
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      ...iosPickerOptions,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    await applyPickedPhoto(result.assets[0].uri);
  }, [applyPickedPhoto, iosPickerOptions, t]);

  const onReplacePhoto = useCallback(() => {
    if (Platform.OS === "ios" || Platform.OS === "android") {
      Alert.alert(t("home.uploadTitle"), undefined, [
        { text: t("configure.takePhoto"), onPress: () => void onTakePhoto() },
        {
          text: t("configure.chooseFromLibrary"),
          onPress: () => void onChooseFromLibrary(),
        },
        { text: t("colorWheel.cancel"), style: "cancel" },
      ]);
      return;
    }
    void onChooseFromLibrary();
  }, [onChooseFromLibrary, onTakePhoto, t]);

  return (
    <View style={styles.root}>
      <View style={styles.topChrome}>
        <StackScreenHeader title="HomeAI" />
        <View style={styles.stepperWrap}>
          <ConfigureStepper
            currentStep={step}
            labels={[...stepLabels]}
            onPressStep={onPressStep}
          />
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <>
            <View style={[styles.previewWrap, ambientShadow]}>
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.preview}
                  resizeMode="contain"
                />
              ) : (
                <Pressable
                  onPress={photoPreparing ? undefined : onReplacePhoto}
                  disabled={photoPreparing}
                  style={[styles.preview, styles.previewEmpty]}
                  accessibilityRole="button"
                  accessibilityLabel={t("configure.replacePhotoA11y")}
                >
                  <View style={styles.previewEmptyIconWrap}>
                    <MaterialIcons
                      name="add-photo-alternate"
                      size={34}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={[typography.headline, styles.previewEmptyTitle]}>
                    {t("home.uploadTitle")}
                  </Text>
                  <Text style={[typography.bodySm, styles.previewEmptySub]}>
                    {t("configure.previewSubtitle")}
                  </Text>
                </Pressable>
              )}
              {imageUri ? (
                <LinearGradient
                  colors={["transparent", "rgba(49,50,59,0.5)"]}
                  style={styles.previewGradient}
                  pointerEvents="none"
                />
              ) : null}
              {imageUri ? (
                <View style={styles.previewFooter}>
                  <View>
                    <Text style={[typography.imageOverlayTitle, styles.previewTitle]}>
                      {t("configure.previewTitle")}
                    </Text>
                    <Text style={[typography.imageOverlaySubtitle, styles.previewMeta]}>
                      {t("configure.previewSubtitle")}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.editChip}
                    hitSlop={8}
                    onPress={photoPreparing ? undefined : onReplacePhoto}
                    disabled={photoPreparing}
                    accessibilityRole="button"
                    accessibilityLabel={t("configure.replacePhotoA11y")}
                  >
                    <MaterialIcons name="edit" size={20} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}
              {photoPreparing ? (
                <View style={styles.photoPreparingOverlay} pointerEvents="none">
                  <ActivityIndicator color="#FFFFFF" size="large" />
                  <Text style={styles.photoPreparingLabel}>
                    {t("configure.preparingPhoto")}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[typography.body, styles.stepIntro]}>
              {t("configure.step0Intro")}
            </Text>
            <View style={styles.photoTipsBox}>
              <MaterialIcons
                name="lightbulb-outline"
                size={18}
                color={colors.primary}
              />
              <View style={styles.photoTipsTextCol}>
                <Text style={[typography.label, styles.photoTipsTitle]}>
                  {t("configure.photoTipsTitle")}
                </Text>
                <Text style={[typography.bodySm, styles.photoTipsBody]}>
                  {t("configure.photoTipsBody")}
                </Text>
              </View>
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={[typography.headline, styles.stepTitle]}>
              {isWalls
                ? t("configure.wallsTreatmentTitle")
                : isExterior
                  ? t("configure.sceneTitle")
                  : t("configure.roomTitle")}
            </Text>
            <Text style={[typography.label, styles.stepSubtitle]}>
              {isWalls
                ? t("configure.wallsTreatmentHint")
                : isExterior
                  ? t("configure.sceneHint")
                  : t("configure.requiredLabel")}
            </Text>
            <View style={styles.roomGrid}>
              {isWalls
                ? WALL_TREATMENT_TYPES.map((tt) => (
                    <RoomTypeTile
                      key={tt}
                      label={t(WALL_TREATMENT_LABEL_KEY[tt])}
                      selected={wallTreatment === tt}
                      icon={
                        <MaterialIcons
                          name={WALL_TREATMENT_ICONS[tt]}
                          size={24}
                          color={wallTreatment === tt ? colors.onPrimary : colors.primary}
                        />
                      }
                      onPress={() => onSelectWallTreatment(tt)}
                    />
                  ))
                : isExterior
                  ? EXTERIOR_SCENE_TYPES.map((s) => (
                      <RoomTypeTile
                        key={s}
                        label={t(EXTERIOR_SCENE_LABEL_KEY[s])}
                        selected={exteriorScene === s}
                        icon={
                          <MaterialIcons
                            name={EXTERIOR_SCENE_ICONS[s]}
                            size={24}
                            color={
                              exteriorScene === s ? colors.onPrimary : colors.primary
                            }
                          />
                        }
                        onPress={() => setExteriorScene(s)}
                      />
                    ))
                  : ROOM_TYPES.map((r) => (
                      <RoomTypeTile
                        key={r}
                        label={t(ROOM_TYPE_LABEL_KEY[r])}
                        selected={roomType === r}
                        icon={
                          <MaterialIcons
                            name={ROOM_TYPE_ICONS[r]}
                            size={24}
                            color={roomType === r ? colors.onPrimary : colors.primary}
                          />
                        }
                        onPress={() => setRoomType(r)}
                      />
                    ))}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={[typography.headline, styles.stepTitle]}>
              {isWalls
                ? wallsHasCustomizeStep
                  ? t("configure.wallsCustomTitle")
                  : t("configure.wallsFinishTitle")
                : isExterior
                  ? t("configure.styleTitleExterior")
                  : t("configure.styleTitle")}
            </Text>
            <Text style={[typography.label, styles.stepSubtitle]}>
              {isWalls
                ? wallsHasCustomizeStep
                  ? t("configure.wallsCustomHint")
                  : t("configure.wallsFinishHint")
                : isExterior
                  ? t("configure.styleHintExterior")
                  : t("configure.styleHint")}
            </Text>
            {isWalls ? (
              wallsHasCustomizeStep ? (
                <View style={styles.wallCustomBlock}>
                  <Text style={[typography.label, styles.wallCustomLabel]}>
                    {t("configure.wallsQuickColorsLabel")}
                  </Text>
                  <WallColorGrid
                    selectedId={selectedWallQuickColorId}
                    onSelect={onSelectWallQuickColor}
                    labelFor={wallQuickColorLabelFor}
                  />
                  <Text style={[typography.caption, styles.wallQuickColorsHint]}>
                    {t("configure.wallsQuickColorsHint")}
                  </Text>

                  <Text
                    style={[typography.label, styles.wallCustomLabel, styles.wallCustomLabelTop]}
                  >
                    {t("configure.wallsCustomColorLabel")}
                  </Text>
                  <View
                    style={[
                      styles.wallHexRow,
                      wallColorInputInvalid && styles.wallHexRowInvalid,
                    ]}
                  >
                    <View
                      style={[
                        styles.wallHexPreview,
                        {
                          backgroundColor:
                            normalizedWallColor ??
                            (wallStyleId ? getWallPresetSwatch(wallStyleId) : "#D9D9D9"),
                        },
                      ]}
                    />
                    <TextInput
                      ref={wallHexInputRef}
                      value={wallColorInput}
                      onChangeText={(next) => {
                        setWallColorInput(next);
                        if (next.trim().length === 0) {
                          setWallCustomColorActive(false);
                        }
                      }}
                      onFocus={() => setWallCustomColorActive(true)}
                      placeholder={t("configure.wallsCustomColorPlaceholder")}
                      placeholderTextColor={colors.onSurfaceVariant}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={7}
                      style={[styles.wallHexInput, { color: colors.onSurface }]}
                    />
                    {wallColorInput.trim().length > 0 ? (
                      <Pressable
                        onPress={() => {
                          setWallColorInput("");
                          setWallCustomColorActive(false);
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t("configure.wallsClearColor")}
                      >
                        <MaterialIcons
                          name="close"
                          size={18}
                          color={colors.onSurfaceVariant}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                  {wallColorInputInvalid ? (
                    <Text style={[typography.caption, styles.wallHexError]}>
                      {t("configure.wallsCustomInvalidHex")}
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => setColorWheelOpen(true)}
                    style={({ pressed }) => [
                      styles.wallWheelCta,
                      pressed && { opacity: 0.9 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t("configure.wallsOpenWheel")}
                  >
                    <MaterialIcons
                      name="palette"
                      size={18}
                      color={colors.primary}
                    />
                    <Text style={[typography.label, styles.wallWheelCtaText]}>
                      {t("configure.wallsOpenWheel")}
                    </Text>
                  </Pressable>

                  <Text
                    style={[typography.label, styles.wallCustomLabel, styles.wallCustomLabelTop]}
                  >
                    {t("configure.wallsCustomPromptLabel")}
                  </Text>
                  <TextInput
                    value={wallCustomPrompt}
                    onChangeText={setWallCustomPrompt}
                    placeholder={t("configure.wallsCustomPromptPlaceholder")}
                    placeholderTextColor={colors.onSurfaceVariant}
                    multiline
                    numberOfLines={4}
                    maxLength={400}
                    style={[styles.wallCustomTextarea, { color: colors.onSurface }]}
                  />
                  <View style={styles.wallScopeNote}>
                    <MaterialIcons
                      name="info-outline"
                      size={16}
                      color={colors.onSurfaceVariant}
                    />
                    <Text style={[typography.caption, styles.wallScopeNoteText]}>
                      {t("configure.wallsScopeBody")}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.wallFinishGrid}>
                  {wallPresetsForTreatment(wallTreatment ?? DEFAULT_WALL_TREATMENT).map(
                    (preset) => {
                      const selected = wallStyleId === preset.id;
                      return (
                        <Pressable
                          key={preset.id}
                          onPress={() => setWallStyleId(preset.id)}
                          style={({ pressed }) => [
                            styles.wallFinishCard,
                            selected && styles.wallFinishCardSelected,
                            pressed && { opacity: 0.92 },
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={t(WALL_PRESET_LABEL_KEY[preset.id])}
                        >
                          <View
                            style={[
                              styles.wallSwatch,
                              { backgroundColor: preset.swatch },
                            ]}
                          />
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.wallFinishLabel,
                              selected && { color: colors.primary },
                            ]}
                          >
                            {t(WALL_PRESET_LABEL_KEY[preset.id])}
                          </Text>
                          {selected ? (
                            <View style={styles.wallFinishCheck} pointerEvents="none">
                              <MaterialIcons
                                name="check"
                                size={14}
                                color={colors.onPrimary}
                              />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    }
                  )}
                </View>
              )
            ) : isExterior ? (
              <InteriorStyleGrid
                items={[...EXTERIOR_STYLES]}
                selected={exteriorStyle ?? ""}
                onSelect={(s) => setExteriorStyle(s as ExteriorStyleType)}
                labelFor={(s) => t(EXTERIOR_STYLE_LABEL_KEY[s as ExteriorStyleType])}
              />
            ) : (
              <InteriorStyleGrid
                items={STYLES}
                selected={style ?? ""}
                onSelect={(s) => setStyle(s as StyleType)}
                labelFor={(s) => t(STYLE_LABEL_KEY[s as StyleType])}
              />
            )}
          </>
        )}

        {step === 3 && !isWalls ? (
          <>
            <Text style={[typography.headline, styles.stepTitle]}>
              {t("configure.paletteTitle")}
            </Text>
            <Text style={[typography.label, styles.stepSubtitle]}>
              {t("configure.paletteHint")}
            </Text>
            <ColorPaletteGrid
              selected={paletteId}
              onSelect={setPaletteId}
              labelFor={(id) => t(PALETTE_LABEL_KEY[id])}
            />
          </>
        ) : null}

        {isReviewStep && (
          <>
            <Text style={[typography.headline, styles.stepTitle]}>
              {t("configure.reviewTitle")}
            </Text>
            <Text style={[typography.label, styles.stepSubtitle]}>
              {t("configure.reviewSubtitle")}
            </Text>
            <View style={styles.photoModeBlock}>
              <Text style={[typography.label, styles.photoModeLabel]}>
                {t("configure.photoModeTitle")}
              </Text>
              <View style={styles.photoModeRow}>
                <Pressable
                  onPress={() => setPhotoMode("empty")}
                  style={({ pressed }) => [
                    styles.photoModeChip,
                    photoMode === "empty" && styles.photoModeChipSelected,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: photoMode === "empty" }}
                >
                  <Text
                    style={[
                      typography.label,
                      styles.photoModeChipText,
                      photoMode === "empty" && { color: colors.onPrimary },
                    ]}
                  >
                    {t("configure.photoModeEmpty")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPhotoMode("furnished")}
                  style={({ pressed }) => [
                    styles.photoModeChip,
                    photoMode === "furnished" && styles.photoModeChipSelected,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: photoMode === "furnished" }}
                >
                  <Text
                    style={[
                      typography.label,
                      styles.photoModeChipText,
                      photoMode === "furnished" && { color: colors.onPrimary },
                    ]}
                  >
                    {t("configure.photoModeFurnished")}
                  </Text>
                </Pressable>
              </View>
              <Text style={[typography.caption, styles.photoModeHint]}>
                {t("configure.photoModeHint")}
              </Text>
            </View>
            <View style={[styles.reviewCard, ambientShadow]}>
              <View style={styles.reviewImageBlock}>
                <Image
                  source={{ uri: imageUri! }}
                  style={styles.reviewHeroImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(49,50,59,0.35)"]}
                  style={styles.reviewImageGradient}
                  pointerEvents="none"
                />
              </View>
              <View style={styles.reviewBody}>
                <Text style={[typography.overline, styles.reviewKicker]}>
                  {t("configure.reviewKicker")}
                </Text>
                {isWalls ? (
                  <>
                    <View style={styles.reviewRow}>
                      <View style={styles.reviewIconBubble}>
                        <MaterialIcons
                          name={WALL_TREATMENT_ICONS[wallTreatment ?? DEFAULT_WALL_TREATMENT]}
                          size={22}
                          color={colors.primary}
                        />
                      </View>
                      <View style={styles.reviewRowTexts}>
                        <Text style={typography.label}>
                          {t("configure.wallsReviewTreatment")}
                        </Text>
                        <Text style={[typography.title, styles.reviewPrimaryValue]}>
                          {t(
                            WALL_TREATMENT_LABEL_KEY[
                              wallTreatment ?? DEFAULT_WALL_TREATMENT
                            ]
                          )}
                        </Text>
                      </View>
                    </View>
                    {!hideWallsFinishReviewRow ? (
                      <>
                        <View style={styles.reviewDivider} />
                        <View style={styles.reviewRow}>
                          <View
                            style={[
                              styles.reviewIconBubble,
                              wallStyleId
                                ? { backgroundColor: getWallPresetSwatch(wallStyleId) }
                                : null,
                            ]}
                          />
                          <View style={styles.reviewRowTexts}>
                            <Text style={typography.label}>
                              {t("configure.wallsReviewFinish")}
                            </Text>
                            <Text style={[typography.title, styles.reviewPrimaryValue]}>
                              {wallStyleId ? t(WALL_PRESET_LABEL_KEY[wallStyleId]) : ""}
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                    {wallsHasCustomizeStep &&
                    (normalizedWallColor || wallCustomPrompt.trim().length > 0) ? (
                      <>
                        <View style={styles.reviewDivider} />
                        <View style={styles.reviewRow}>
                          <View
                            style={[
                              styles.reviewIconBubble,
                              normalizedWallColor
                                ? { backgroundColor: normalizedWallColor }
                                : null,
                            ]}
                          >
                            {!normalizedWallColor ? (
                              <MaterialIcons
                                name="edit"
                                size={22}
                                color={colors.primary}
                              />
                            ) : null}
                          </View>
                          <View style={styles.reviewRowTexts}>
                            <Text style={typography.label}>
                              {t("configure.wallsCustomTitle")}
                            </Text>
                            {normalizedWallColor ? (
                              <Text
                                style={[
                                  typography.title,
                                  styles.reviewPrimaryValue,
                                  wallCustomPrompt.trim().length > 0
                                    ? { marginBottom: 8 }
                                    : null,
                                ]}
                              >
                                {(() => {
                                  const id = wallQuickColorIdForHex(normalizedWallColor);
                                  return id && id !== "custom"
                                    ? `${t(WALL_COLOR_LABEL_KEY[id])} • ${normalizedWallColor}`
                                    : normalizedWallColor;
                                })()}
                              </Text>
                            ) : null}
                            {wallCustomPrompt.trim().length > 0 ? (
                              <Text
                                style={[typography.title, styles.reviewPrimaryValue]}
                                numberOfLines={4}
                              >
                                {wallCustomPrompt.trim()}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.reviewRow}>
                      <View style={styles.reviewIconBubble}>
                        <MaterialIcons
                          name={
                            isExterior
                              ? EXTERIOR_SCENE_ICONS[exteriorScene!]
                              : ROOM_TYPE_ICONS[roomType!]
                          }
                          size={22}
                          color={colors.primary}
                        />
                      </View>
                      <View style={styles.reviewRowTexts}>
                        <Text style={typography.label}>
                          {isExterior
                            ? t("configure.reviewSceneField")
                            : t("configure.reviewRoomField")}
                        </Text>
                        <Text style={[typography.title, styles.reviewPrimaryValue]}>
                          {isExterior
                            ? t(EXTERIOR_SCENE_LABEL_KEY[exteriorScene!])
                            : t(ROOM_TYPE_LABEL_KEY[roomType!])}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.reviewDivider} />
                    <View style={styles.reviewRow}>
                      <View style={styles.reviewIconBubble}>
                        <MaterialIcons
                          name={
                            isExterior
                              ? EXTERIOR_STYLE_ICONS[exteriorStyle!]
                              : STYLE_ICONS[style!]
                          }
                          size={22}
                          color={colors.primary}
                        />
                      </View>
                      <View style={styles.reviewRowTexts}>
                        <Text style={typography.label}>
                          {isExterior
                            ? t("configure.reviewStyleFieldExterior")
                            : t("configure.reviewStyleField")}
                        </Text>
                        <Text style={[typography.title, styles.reviewPrimaryValue]}>
                          {isExterior
                            ? t(EXTERIOR_STYLE_LABEL_KEY[exteriorStyle!])
                            : t(STYLE_LABEL_KEY[style!])}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.reviewDivider} />
                    <View style={styles.reviewRow}>
                      <View style={styles.reviewIconBubble}>
                        <MaterialIcons name="palette" size={22} color={colors.primary} />
                      </View>
                      <View style={styles.reviewRowTexts}>
                        <Text style={typography.label}>
                          {t("configure.reviewPaletteField")}
                        </Text>
                        <Text style={[typography.title, styles.reviewPrimaryValue]}>
                          {t(PALETTE_LABEL_KEY[paletteId])}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            </View>
            <View style={styles.reviewFootnote}>
              <MaterialIcons name="info-outline" size={16} color={colors.onSurfaceVariant} />
              <Text style={[typography.caption, styles.reviewFootnoteText]}>
                {t("configure.reviewFootnote")}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            paddingHorizontal: 24,
          },
        ]}
      >
        {step > 0 && (
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t("configure.prevStepA11y")}
          >
            <Text style={typography.secondaryCta}>{t("configure.back")}</Text>
          </Pressable>
        )}
        {step < lastStep ? (
          <PrimaryCTA
            title={t("configure.continue")}
            onPress={goNext}
            disabled={
              (step === 0 && !imageUri) ||
              (step === 1 &&
                (isWalls
                  ? !wallTreatment
                  : isExterior
                    ? !exteriorScene
                    : !roomType)) ||
              (step === 2 &&
                (isWalls
                  ? wallsHasCustomizeStep
                    ? wallColorInputInvalid
                    : !wallStyleId
                  : isExterior
                    ? !exteriorStyle
                    : !style))
            }
            style={[styles.footerCta, step === 0 && styles.footerCtaFull]}
          />
        ) : (
          <PrimaryCTA
            title={
              isWalls
                ? t("configure.generateWalls")
                : isExterior
                  ? t("configure.generateExterior")
                  : t("configure.generate")
            }
            onPress={onGenerate}
            disabled={
              isWalls
                ? !wallTreatment ||
                  !wallStyleId ||
                  (wallTreatment === "Custom" && wallColorInputInvalid)
                : isExterior
                  ? !exteriorScene || !exteriorStyle
                  : !roomType || !style
            }
            style={[styles.footerCta, step === 0 && styles.footerCtaFull]}
          />
        )}
      </View>
      {isWalls ? (
        <ColorWheelPicker
          visible={colorWheelOpen}
          initialHex={normalizedWallColor}
          onCancel={() => setColorWheelOpen(false)}
          onConfirm={onConfirmColorWheel}
        />
      ) : null}
    </View>
  );
}
