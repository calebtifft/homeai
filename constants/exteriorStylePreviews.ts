import type { ImageSourcePropType } from "react-native";
import type { ExteriorStyleType } from "./exteriorDesign";
import classicColonialImg from "../assets/exterior-style/classic-colonial.png";
import coastalCottageImg from "../assets/exterior-style/coastal-cottage.png";
import contemporaryLinesImg from "../assets/exterior-style/contemporary-lines.png";
import craftsmanCharmImg from "../assets/exterior-style/craftsman-charm.png";
import desertModernImg from "../assets/exterior-style/desert-modern.png";
import industrialExteriorImg from "../assets/exterior-style/industrial-exterior.png";
import japandiExteriorImg from "../assets/exterior-style/japandi-exterior.png";
import mediterraneanVillaImg from "../assets/exterior-style/mediterranean-villa.png";
import midCenturyCurbImg from "../assets/exterior-style/mid-century-curb.png";
import minimalNordicImg from "../assets/exterior-style/minimal-nordic.png";
import modernFacadeImg from "../assets/exterior-style/modern-facade.png";
import modernFarmhouseImg from "../assets/exterior-style/modern-farmhouse.png";
import rusticLodgeImg from "../assets/exterior-style/rustic-lodge.png";
import spanishRevivalImg from "../assets/exterior-style/spanish-revival.png";
import tropicalResortImg from "../assets/exterior-style/tropical-resort.png";
import tudorRevivalImg from "../assets/exterior-style/tudor-revival.png";

/**
 * Representative exterior photos for the style picker (local bundled assets).
 * Used for UI only — staging still uses `ExteriorStyleType` in `services/staging.ts`.
 */
export const EXTERIOR_STYLE_PREVIEW_SOURCE: Record<
  ExteriorStyleType,
  ImageSourcePropType
> = {
  "Modern Facade": modernFacadeImg,
  "Contemporary Lines": contemporaryLinesImg,
  "Classic Colonial": classicColonialImg,
  "Mediterranean Villa": mediterraneanVillaImg,
  "Craftsman Charm": craftsmanCharmImg,
  "Modern Farmhouse": modernFarmhouseImg,
  "Coastal Cottage": coastalCottageImg,
  "Desert Modern": desertModernImg,
  "Industrial Exterior": industrialExteriorImg,
  "Minimal Nordic": minimalNordicImg,
  "Tudor Revival": tudorRevivalImg,
  "Spanish Revival": spanishRevivalImg,
  "Tropical Resort": tropicalResortImg,
  "Japandi Exterior": japandiExteriorImg,
  "Mid-Century Curb": midCenturyCurbImg,
  "Rustic Lodge": rusticLodgeImg,
};
