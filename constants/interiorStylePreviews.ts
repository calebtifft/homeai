import type { StyleType } from "../types";
import type { ImageSourcePropType } from "react-native";
import modernImg from "../assets/interior-style/modern.jpg";
import scandinavianImg from "../assets/interior-style/scandinavian.jpg";
import vintageImg from "../assets/interior-style/vintage.jpg";
import industrialImg from "../assets/interior-style/industrial.jpg";
import midcenturyImg from "../assets/interior-style/midcentury.jpg";
import rustickImg from "../assets/interior-style/rustick.jpg";
import luxuryImg from "../assets/interior-style/luxury.jpg";
import minimalistImg from "../assets/interior-style/minimalist.png";
import mediterraneanImg from "../assets/interior-style/mediterranean.jpg";
import biophilicImg from "../assets/interior-style/biophilic.jpg";
import airbnbImg from "../assets/interior-style/airbnb.jpg";
import bohemianImg from "../assets/interior-style/bohemian.png";
import rainbowImg from "../assets/interior-style/rainbow.jpg";
import cozyImg from "../assets/interior-style/cozy.jpeg";
import coastalImg from "../assets/interior-style/coastal.jpg";
import japandiImg from "../assets/interior-style/japandi.png";
import farmhouseImg from "../assets/interior-style/farmhouse.jpg";
import zenImg from "../assets/interior-style/zen.png";

/**
 * Representative interior photos for the style picker (local bundled assets).
 * Used for UI only — staging still uses `StyleType` in `services/staging.ts`.
 */
export const INTERIOR_STYLE_PREVIEW_SOURCE: Record<StyleType, ImageSourcePropType> = {
  Modern: modernImg,
  Contemporary: scandinavianImg,
  Traditional: vintageImg,
  Transitional: industrialImg,
  "Mid-Century": midcenturyImg,
  Rustic: rustickImg,
  Luxe: luxuryImg,
  Minimal: minimalistImg,
  Mediterranean: mediterraneanImg,
  Biophilic: biophilicImg,
  Airbnb: airbnbImg,
  "Soho Style": bohemianImg,
  Rainbow: rainbowImg,
  Cozy: cozyImg,
  Coastal: coastalImg,
  Japandi: japandiImg,
  Cottagecore: farmhouseImg,
  Wood: zenImg,
};
