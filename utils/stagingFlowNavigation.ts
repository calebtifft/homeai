import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  DesignMode,
  ExteriorStagingSelection,
  InteriorStagingSelection,
  RootStackParamList,
  StagingFlowParams,
  WallsStagingSelection,
} from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

type StagingSelection = StagingFlowParams &
  (
    | ({ designMode?: "interior" } & Pick<
        InteriorStagingSelection,
        "roomType" | "style"
      >)
    | Pick<ExteriorStagingSelection, "designMode" | "exteriorSceneType" | "exteriorStyle">
    | Pick<
        WallsStagingSelection,
        | "designMode"
        | "wallTreatment"
        | "wallStyle"
        | "wallColorHex"
        | "wallCustomPrompt"
      >
  );

export function navigateToConfigureFromSelection(
  navigation: Nav,
  imageUri: string,
  selection: StagingSelection
): void {
  const mode: DesignMode =
    selection.designMode === "exterior"
      ? "exterior"
      : selection.designMode === "walls"
        ? "walls"
        : "interior";

  if (mode === "walls" && "wallTreatment" in selection && selection.wallTreatment) {
    navigation.navigate("Configure", {
      imageUri,
      designMode: "walls",
      presetWallTreatment: selection.wallTreatment,
      presetWallStyle: selection.wallStyle,
    });
    return;
  }
  if (
    mode === "exterior" &&
    "exteriorSceneType" in selection &&
    selection.exteriorSceneType &&
    selection.exteriorStyle
  ) {
    navigation.navigate("Configure", {
      imageUri,
      designMode: "exterior",
      presetExteriorScene: selection.exteriorSceneType,
      presetExteriorStyle: selection.exteriorStyle,
    });
    return;
  }
  if ("roomType" in selection && selection.roomType && selection.style) {
    navigation.navigate("Configure", {
      imageUri,
      designMode: "interior",
      presetRoomType: selection.roomType,
      presetStyle: selection.style,
    });
  }
}

export function navigateToProcessingFromSelection(
  navigation: Nav,
  imageUri: string,
  selection: StagingSelection & StagingFlowParams
): void {
  const photoMode = selection.photoMode;
  const paletteId = selection.paletteId;

  if (selection.designMode === "walls" && "wallTreatment" in selection) {
    navigation.navigate("Processing", {
      imageUri,
      designMode: "walls",
      wallTreatment: selection.wallTreatment,
      wallStyle: selection.wallStyle,
      wallColorHex: selection.wallColorHex,
      wallCustomPrompt: selection.wallCustomPrompt,
      photoMode,
      paletteId,
    });
    return;
  }
  if (
    selection.designMode === "exterior" &&
    "exteriorSceneType" in selection
  ) {
    navigation.navigate("Processing", {
      imageUri,
      designMode: "exterior",
      exteriorSceneType: selection.exteriorSceneType,
      exteriorStyle: selection.exteriorStyle,
      photoMode,
      paletteId,
    });
    return;
  }
  if ("roomType" in selection && selection.roomType && selection.style) {
    navigation.navigate("Processing", {
      imageUri,
      designMode: "interior",
      roomType: selection.roomType,
      style: selection.style,
      photoMode,
      paletteId,
    });
  }
}
