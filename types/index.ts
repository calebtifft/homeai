import type { StagingPaletteId } from "../constants/colorPalettes";
import type {
  ExteriorSceneType,
  ExteriorStyleType,
} from "../constants/exteriorDesign";
import type {
  WallStylePresetId,
  WallTreatmentType,
} from "../constants/wallsDesign";

export type { StagingPaletteId } from "../constants/colorPalettes";
export type {
  ExteriorSceneType,
  ExteriorStyleType,
} from "../constants/exteriorDesign";
export type {
  WallStylePresetId,
  WallTreatmentType,
} from "../constants/wallsDesign";

/** Top-level staging flow: interior staging, exterior design, or walls-only refresh. */
export type DesignMode = "interior" | "exterior" | "walls";

export type RoomType =
  | "Living Room"
  | "Bedroom"
  | "Kitchen"
  | "Bathroom"
  | "Home Office"
  | "Study Room"
  | "Restaurant";

/** Empty shell vs already furnished / prior staging — changes prompts and default img2img strength. */
export type StagingPhotoMode = "empty" | "furnished";

/** Interior styles — staging prompts use color + style playbooks in `services/staging.ts`. */
export type StyleType =
  | "Modern"
  | "Contemporary"
  | "Traditional"
  | "Transitional"
  | "Mid-Century"
  | "Rustic"
  | "Luxe"
  | "Minimal"
  | "Mediterranean"
  | "Biophilic"
  | "Airbnb"
  | "Soho Style"
  | "Rainbow"
  | "Cozy"
  | "Coastal"
  | "Japandi"
  | "Cottagecore"
  | "Wood";

/** Params shared by staging pipeline screens. */
export type StagingFlowParams = {
  photoMode?: StagingPhotoMode;
  paletteId?: StagingPaletteId;
  designMode?: DesignMode;
};

export type InteriorStagingSelection = StagingFlowParams & {
  designMode?: "interior";
  roomType: RoomType;
  style: StyleType;
};

export type ExteriorStagingSelection = StagingFlowParams & {
  designMode: "exterior";
  exteriorSceneType: ExteriorSceneType;
  exteriorStyle: ExteriorStyleType;
};

/** Walls-only refresh — paint, wallpaper, paneling, tile, mural, or a user-written prompt. */
export type WallsStagingSelection = StagingFlowParams & {
  designMode: "walls";
  wallTreatment: WallTreatmentType;
  wallStyle: WallStylePresetId;
  /** Optional `#RRGGBB` override (paint / accent wall). */
  wallColorHex?: string;
  /** Optional free-text addition the user typed in Configure. */
  wallCustomPrompt?: string;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  History: undefined;
  HistoryDetail: {
    imageUrl: string;
    originalUri?: string;
    sourceUri?: string;
    sessionFolder?: string;
    designMode?: DesignMode;
    roomType?: RoomType;
    style?: StyleType;
    exteriorSceneType?: ExteriorSceneType;
    exteriorStyle?: ExteriorStyleType;
    wallTreatment?: WallTreatmentType;
    wallStyle?: WallStylePresetId;
    wallColorHex?: string;
    wallCustomPrompt?: string;
    photoMode?: StagingPhotoMode;
    paletteId?: StagingPaletteId;
    createdAt?: string;
  };
  Settings: undefined;
  Language: undefined;
  PrivacySecurity: undefined;
  SubscriptionPlans: undefined;
  HelpCenter: undefined;
  ContactSupport: { topicHint?: "question" | "bug" | "billing" | "feature" | "other" } | undefined;
  Configure: {
    imageUri?: string;
    designMode?: DesignMode;
    /** From Explore tab — pre-fill configure picks (user still uploads photo first). */
    presetRoomType?: RoomType;
    presetStyle?: StyleType;
    presetExteriorScene?: ExteriorSceneType;
    presetExteriorStyle?: ExteriorStyleType;
    presetWallTreatment?: WallTreatmentType;
    presetWallStyle?: WallStylePresetId;
  };
  Processing: { imageUri: string } & (
    | InteriorStagingSelection
    | ExteriorStagingSelection
    | WallsStagingSelection
  );
  Result: { originalUri: string; generatedUri: string } & (
    | InteriorStagingSelection
    | ExteriorStagingSelection
    | WallsStagingSelection
  );
};
