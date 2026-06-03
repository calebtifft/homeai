import type { ImageSourcePropType } from "react-native";
import botanicalLeafImg from "../assets/wall-style/botanical-leaf.png";
import landscapeMuralImg from "../assets/wall-style/landscape-mural.png";
import shakerWainscotingImg from "../assets/wall-style/shaker-wainscoting.png";
import subwayTileImg from "../assets/wall-style/subway-tile.png";
import warmWhiteImg from "../assets/wall-style/warm-white.png";
import type { WallStylePresetId } from "./wallsDesign";

/**
 * Bundled preview photos for wall presets (Explore + configure pickers).
 * Staging still uses `promptHint` in `constants/wallsDesign.ts`.
 */
export const WALL_STYLE_PREVIEW_SOURCE: Partial<
  Record<WallStylePresetId, ImageSourcePropType>
> = {
  paint_classic_white: warmWhiteImg,
  wallpaper_botanical: botanicalLeafImg,
  paneling_shaker_painted: shakerWainscotingImg,
  tile_subway_white: subwayTileImg,
  mural_landscape: landscapeMuralImg,
};

export function getWallStylePreviewSource(
  presetId: WallStylePresetId
): ImageSourcePropType | undefined {
  return WALL_STYLE_PREVIEW_SOURCE[presetId];
}
